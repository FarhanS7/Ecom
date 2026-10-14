// T015a onboarding proof against real PostgreSQL: double-accept collapse,
// last-owner protection, cross-store denial, approval/suspension transitions.
// Skips honestly without DATABASE_URL or reachable DB (T003 contract); CI
// runs it live. End-to-end HTTP replay is T015b.

import { describe, expect, it } from 'vitest';
import { resetEnvCache } from '@shopscale/config';
import {
  OnboardingError,
  acceptInvitation,
  applyForStore,
  approveStore,
  inviteMember,
  suspendStore,
  updateMember,
} from '../../src/stores/onboarding.service.js';
import {
  openAdminConnection,
  requireDatabaseUrl,
  resolveMigrationsDir,
  runMigrations,
} from '../../src/platform/database.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const migrationsDir = resolveMigrationsDir(repoRoot);

const OWNER = 't015.owner@example.com';
const STAFF = 't015.staff@example.com';
const ADMIN = 't015.admin@example.com';
const PASSWORD_HASH = 'argon2id-placeholder-hash';

async function connectOrSkip() {
  resetEnvCache();
  let url: string;
  try {
    url = requireDatabaseUrl();
  } catch {
    console.warn('SKIP: DATABASE_URL not configured; start infra first (T004).');
    return null;
  }
  const sql = openAdminConnection(url);
  try {
    await sql`SELECT 1`;
    return sql;
  } catch {
    await sql.end();
    console.warn('SKIP: database unreachable; start infra first (T004).');
    return null;
  }
}

async function userId(sql: NonNullable<Awaited<ReturnType<typeof connectOrSkip>>>, email: string): Promise<string> {
  await sql.unsafe(
    `INSERT INTO "users" ("email_normalized","password_hash","status") VALUES ($1,$2,'active') ON CONFLICT DO NOTHING;`,
    [email, PASSWORD_HASH],
  );
  const rows = (await sql.unsafe(`SELECT "id" FROM "users" WHERE "email_normalized" = $1;`, [email])) as Array<{
    id: string;
  }>;
  return rows[0]?.id as string;
}

async function cleanup(sql: NonNullable<Awaited<ReturnType<typeof connectOrSkip>>>): Promise<void> {
  const emails = [OWNER, STAFF, ADMIN].map((e) => `'${e}'`).join(',');
  await sql.unsafe(
    `DELETE FROM "store_invitations" WHERE "store_id" IN (SELECT "s"."id" FROM "stores" s JOIN "businesses" b ON b."id" = s."business_id" JOIN "users" u ON u."id" = b."owner_user_id" WHERE u."email_normalized" IN (${emails}));`,
  );
  await sql.unsafe(
    `DELETE FROM "store_memberships" WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" IN (${emails}));`,
  );
  await sql.unsafe(
    `DELETE FROM "stores" WHERE "business_id" IN (SELECT "b"."id" FROM "businesses" b JOIN "users" u ON u."id" = b."owner_user_id" WHERE u."email_normalized" IN (${emails}));`,
  );
  await sql.unsafe(
    `DELETE FROM "businesses" WHERE "owner_user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" IN (${emails}));`,
  );
  await sql.unsafe(
    `DELETE FROM "user_platform_roles" WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" IN (${emails}));`,
  );
  await sql.unsafe(
    `DELETE FROM "identity_tokens" WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" IN (${emails}));`,
  );
  await sql.unsafe(
    `DELETE FROM "refresh_tokens" WHERE "family_id" IN (SELECT "id" FROM "session_families" WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" IN (${emails})));`,
  );
  await sql.unsafe(`DELETE FROM "session_families" WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" IN (${emails}));`);
  await sql.unsafe(`DELETE FROM "audit_logs" WHERE "actor_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" IN (${emails}));`);
  await sql.unsafe(`DELETE FROM "users" WHERE "email_normalized" IN (${emails});`);
}

describe('onboarding (T015a)', () => {
  it('accepts an invitation exactly once', async () => {
    const sql = await connectOrSkip();
    if (!sql) return;
    try {
      await runMigrations(sql, migrationsDir);
      await cleanup(sql);
      const owner = await userId(sql, OWNER);
      const staff = await userId(sql, STAFF);
      const app = await applyForStore({ userId: owner, slug: 't015-once', name: 'Once', requestId: 't015a' }, sql);
      const invite = await inviteMember(
        { storeId: app.storeId, actorId: owner, email: STAFF, role: 'manager', requestId: 't015a' },
        sql,
      );
      const first = await acceptInvitation({ token: invite.token, userId: staff, requestId: 't015a' }, sql);
      expect(first.role).toBe('manager');
      await expect(acceptInvitation({ token: invite.token, userId: staff, requestId: 't015a' }, sql)).rejects.toMatchObject({
        failure: 'NOT_FOUND',
      });
      const count = (await sql.unsafe(
        `SELECT count(*)::int AS n FROM "store_memberships" WHERE "store_id" = $1 AND "user_id" = $2;`,
        [app.storeId, staff],
      )) as Array<{ n: number }>;
      expect(count[0]?.n).toBe(1);
    } finally {
      await cleanup(sql);
      await sql.end();
      resetEnvCache();
    }
  });

  it('refuses to remove the last active owner', async () => {
    const sql = await connectOrSkip();
    if (!sql) return;
    try {
      await runMigrations(sql, migrationsDir);
      await cleanup(sql);
      const owner = await userId(sql, OWNER);
      const app = await applyForStore({ userId: owner, slug: 't015-last', name: 'Last', requestId: 't015a' }, sql);
      await expect(
        updateMember(
          { storeId: app.storeId, actorId: owner, targetUserId: owner, role: 'manager', requestId: 't015a' },
          sql,
        ),
      ).rejects.toMatchObject({ failure: 'CONFLICT' });
      await expect(
        updateMember(
          { storeId: app.storeId, actorId: owner, targetUserId: owner, status: 'revoked', requestId: 't015a' },
          sql,
        ),
      ).rejects.toMatchObject({ failure: 'CONFLICT' });
      expect(OnboardingError).toBeTypeOf('function');
    } finally {
      await cleanup(sql);
      await sql.end();
      resetEnvCache();
    }
  });

  it('denies cross-store grants and enforces approval transitions', async () => {
    const sql = await connectOrSkip();
    if (!sql) return;
    try {
      await runMigrations(sql, migrationsDir);
      await cleanup(sql);
      const owner = await userId(sql, OWNER);
      const admin = await userId(sql, ADMIN);
      await sql.unsafe(
        `INSERT INTO "user_platform_roles" ("user_id","role_id") SELECT $1, "id" FROM "platform_roles" WHERE "key" = 'admin' ON CONFLICT DO NOTHING;`,
        [admin],
      );
      const appA = await applyForStore({ userId: owner, slug: 't015-cross-a', name: 'A', requestId: 't015a' }, sql);
      const staff = await userId(sql, STAFF);
      const appB = await applyForStore({ userId: staff, slug: 't015-cross-b', name: 'B', requestId: 't015a' }, sql);
      // Owner of A has no scope in B: generic NOT_FOUND, never a grant.
      await expect(
        updateMember({ storeId: appB.storeId, actorId: owner, targetUserId: staff, role: 'manager', requestId: 't015a' }, sql),
      ).rejects.toMatchObject({ failure: 'NOT_FOUND' });

      // Approval lifecycle: pending -> active -> suspended; anything else 409.
      expect(appA.status).toBe('pending');
      const approved = await approveStore({ storeId: appA.storeId, actorId: admin, requestId: 't015a' }, sql);
      expect(approved.status).toBe('active');
      await expect(approveStore({ storeId: appA.storeId, actorId: admin, requestId: 't015a' }, sql)).rejects.toMatchObject({
        failure: 'CONFLICT',
      });
      await expect(
        approveStore({ storeId: appA.storeId, actorId: owner, requestId: 't015a' }, sql),
      ).rejects.toMatchObject({ failure: 'FORBIDDEN' });
      const suspended = await suspendStore({ storeId: appA.storeId, actorId: admin, requestId: 't015a' }, sql);
      expect(suspended.status).toBe('suspended');
      const audit = (await sql.unsafe(
        `SELECT count(*)::int AS n FROM "audit_logs" WHERE "store_id" = $1 AND "action" IN ('store.applied','store.approved','store.suspended');`,
        [appA.storeId],
      )) as Array<{ n: number }>;
      expect(audit[0]?.n).toBe(3);
    } finally {
      await cleanup(sql);
      await sql.end();
      resetEnvCache();
    }
  });
});
