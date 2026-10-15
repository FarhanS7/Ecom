// T009 verification against real PostgreSQL:
// - Normalized email UNIQUE collapses concurrent duplicate registration to
//   exactly one account (unique-violation for the rest).
// - Stored records contain token HASHES; raw refresh/reset values never land.
// - Migration seeds required roles/permissions with FK/index constraints.
// Skips gracefully without DATABASE_URL or reachable DB (same contract as
// T003); CI runs it for real with services up.
// Canonical location: package-colocated per repo layout (T003 precedent).

import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { resetEnvCache } from '@shopscale/config';
import {
  openAdminConnection,
  requireDatabaseUrl,
  findMigrationsDir,
  runMigrations,
} from '../../src/platform/database.js';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = findMigrationsDir(here);

const TEST_EMAIL = 't009.concurrent@example.com';
const TEST_EMAIL_2 = 't009.hashprobe@example.com';

function sha256Hex(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

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

async function cleanup(sql: Awaited<ReturnType<typeof connectOrSkip>>): Promise<void> {
  if (!sql) return;
  await sql.unsafe(`DELETE FROM "identity_tokens" WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" IN ($1,$2))`, [
    TEST_EMAIL,
    TEST_EMAIL_2,
  ]);
  await sql.unsafe(`DELETE FROM "refresh_tokens" WHERE "family_id" IN (SELECT "id" FROM "session_families" WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" IN ($1,$2)))`, [
    TEST_EMAIL,
    TEST_EMAIL_2,
  ]);
  await sql.unsafe(`DELETE FROM "session_families" WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" IN ($1,$2))`, [
    TEST_EMAIL,
    TEST_EMAIL_2,
  ]);
  await sql.unsafe(`DELETE FROM "user_platform_roles" WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" IN ($1,$2))`, [
    TEST_EMAIL,
    TEST_EMAIL_2,
  ]);
  await sql.unsafe(`DELETE FROM "users" WHERE "email_normalized" IN ($1,$2)`, [TEST_EMAIL, TEST_EMAIL_2]);
}

describe('identity schema (T009)', () => {
  it('collapses concurrent duplicate registration to one account', async () => {
    const sql = await connectOrSkip();
    if (!sql) return;
    try {
      await runMigrations(sql, migrationsDir);
      await cleanup(sql);

      const attempts = await Promise.allSettled(
        Array.from({ length: 10 }, () =>
          sql.unsafe(
            `INSERT INTO "users" ("email_normalized","password_hash","status") VALUES ($1,$2,'active') RETURNING "id";`,
            [TEST_EMAIL, 'argon2id-placeholder-hash'],
          ),
        ),
      );
      const ok = attempts.filter((a) => a.status === 'fulfilled');
      const failed = attempts.filter((a) => a.status === 'rejected');
      expect(ok).toHaveLength(1);
      expect(failed).toHaveLength(9);
      for (const f of failed) {
        const reason = (f as PromiseRejectedResult).reason as { code?: string };
        expect(reason?.code).toBe('23505');
      }
      const count = (await sql.unsafe(
        `SELECT count(*)::int AS n FROM "users" WHERE "email_normalized" = $1;`,
        [TEST_EMAIL],
      )) as Array<{ n: number }>;
      expect(count[0].n).toBe(1);
    } finally {
      await cleanup(sql);
      await sql.end();
      resetEnvCache();
    }
  });

  it('stores token hashes, never raw token values', async () => {
    const sql = await connectOrSkip();
    if (!sql) return;
    try {
      await runMigrations(sql, migrationsDir);
      await cleanup(sql);

      const rawRefresh = randomBytes(32).toString('hex');
      const rawReset = randomBytes(32).toString('hex');
      const refreshHash = sha256Hex(rawRefresh);
      const resetHash = sha256Hex(rawReset);

      const user = (await sql.unsafe(
        `INSERT INTO "users" ("email_normalized","password_hash","status") VALUES ($1,$2,'active') RETURNING "id";`,
        [TEST_EMAIL_2, 'argon2id-placeholder-hash'],
      )) as Array<{ id: string }>;
      const userId = user[0].id;

      const family = (await sql.unsafe(
        `INSERT INTO "session_families" ("user_id","expires_at") VALUES ($1, now() + interval '7 days') RETURNING "id";`,
        [userId],
      )) as Array<{ id: string }>;

      await sql.unsafe(
        `INSERT INTO "refresh_tokens" ("family_id","token_hash","expires_at") VALUES ($1,$2, now() + interval '7 days');`,
        [family[0].id, refreshHash],
      );
      await sql.unsafe(
        `INSERT INTO "identity_tokens" ("user_id","purpose","token_hash","expires_at") VALUES ($1,'reset',$2, now() + interval '1 hour');`,
        [userId, resetHash],
      );

      const storedRefresh = (await sql.unsafe(`SELECT "token_hash" FROM "refresh_tokens" WHERE "family_id" = $1;`, [
        family[0].id,
      ])) as Array<{ token_hash: string }>;
      const storedReset = (await sql.unsafe(
        `SELECT "token_hash" FROM "identity_tokens" WHERE "user_id" = $1 AND "purpose" = 'reset';`,
        [userId],
      )) as Array<{ token_hash: string }>;

      expect(storedRefresh[0].token_hash).toBe(refreshHash);
      expect(storedRefresh[0].token_hash).not.toBe(rawRefresh);
      expect(storedReset[0].token_hash).toBe(resetHash);
      expect(storedReset[0].token_hash).not.toBe(rawReset);
      // And the raw values appear nowhere in the two tables.
      const scan = (await sql.unsafe(
        `SELECT (SELECT count(*) FROM "refresh_tokens" WHERE "token_hash" = $1) + (SELECT count(*) FROM "identity_tokens" WHERE "token_hash" = $2) AS n;`,
        [rawRefresh, rawReset],
      )) as Array<{ n: string }>;
      expect(Number(scan[0].n)).toBe(0);
    } finally {
      await cleanup(sql);
      await sql.end();
      resetEnvCache();
    }
  });

  it('seeds roles/permissions with required constraints', async () => {
    const sql = await connectOrSkip();
    if (!sql) return;
    try {
      await runMigrations(sql, migrationsDir);

      const roles = (await sql.unsafe(`SELECT "key" FROM "platform_roles" ORDER BY "key";`)) as Array<{
        key: string;
      }>;
      expect(roles.map((r) => r.key).sort()).toEqual(['admin', 'customer', 'seller', 'support']);

      const perms = (await sql.unsafe(`SELECT count(*)::int AS n FROM "permissions";`)) as Array<{
        n: number;
      }>;
      expect(perms[0].n).toBe(7);

      const adminPerms = (await sql.unsafe(
        `SELECT count(*)::int AS n FROM "platform_role_permissions" pr JOIN "platform_roles" r ON r."id" = pr."role_id" WHERE r."key" = 'admin';`,
      )) as Array<{ n: number }>;
      expect(adminPerms[0].n).toBe(7);

      const customerPerms = (await sql.unsafe(
        `SELECT count(*)::int AS n FROM "platform_role_permissions" pr JOIN "platform_roles" r ON r."id" = pr."role_id" WHERE r."key" = 'customer';`,
      )) as Array<{ n: number }>;
      expect(customerPerms[0].n).toBe(0);

      const uniq = (await sql.unsafe(
        `SELECT count(*)::int AS n FROM "pg_constraint" WHERE "conname" IN ('users_email_normalized_uniq','refresh_tokens_token_hash_uniq','identity_tokens_token_hash_uniq');`,
      )) as Array<{ n: number }>;
      expect(uniq[0].n).toBe(3);

      const idx = (await sql.unsafe(
        `SELECT count(*)::int AS n FROM "pg_indexes" WHERE "indexname" IN ('session_families_user_id_idx','refresh_tokens_family_id_idx','identity_tokens_user_id_idx');`,
      )) as Array<{ n: number }>;
      expect(idx[0].n).toBe(3);
    } finally {
      await sql.end();
      resetEnvCache();
    }
  });
});
