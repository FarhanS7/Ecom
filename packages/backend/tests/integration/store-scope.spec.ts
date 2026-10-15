// T014a verification against real PostgreSQL: one-store-per-business,
// active-membership gating, and the catalog-editor/fulfillment boundary.
// Skips honestly without DATABASE_URL or reachable DB (T003 contract); CI
// runs it live. HTTP retry proof (old token after revocation) is T014b.

import { describe, expect, it } from 'vitest';
import { resetEnvCache } from '@shopscale/config';
import { authorizeStore } from '../../src/stores/permissions.js';
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

const OWNER_EMAIL = 't014.owner@example.com';
const EDITOR_EMAIL = 't014.editor@example.com';
const OUTSIDER_EMAIL = 't014.outsider@example.com';

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

describe('store scope (T014a)', () => {
  it('rejects a second store for one business', async () => {
    const sql = await connectOrSkip();
    if (!sql) return;
    try {
      await runMigrations(sql, migrationsDir);
      await sql.unsafe(
        `INSERT INTO "users" ("email_normalized","password_hash","status") VALUES ($1,'x','active') ON CONFLICT DO NOTHING;`,
        [OWNER_EMAIL],
      );
      const userId = (
        (await sql.unsafe(`SELECT "id" FROM "users" WHERE "email_normalized" = $1;`, [OWNER_EMAIL])) as Array<{
          id: string;
        }>
      )[0]?.id as string;
      const biz = (await sql.unsafe(`INSERT INTO "businesses" ("owner_user_id") VALUES ($1) RETURNING "id";`, [
        userId,
      ])) as Array<{ id: string }>;
      const businessId = biz[0]?.id as string;
      await sql.unsafe(`INSERT INTO "stores" ("business_id","slug","name","status") VALUES ($1,'t014-first','First','active');`, [
        businessId,
      ]);
      let collided = false;
      try {
        await sql.unsafe(
          `INSERT INTO "stores" ("business_id","slug","name","status") VALUES ($1,'t014-second','Second','active');`,
          [businessId],
        );
      } catch (err) {
        collided = (err as { code?: string }).code === '23505';
      }
      expect(collided).toBe(true);
    } finally {
      await sql.unsafe(`DELETE FROM "stores" WHERE "slug" IN ('t014-first','t014-second');`);
      await sql.unsafe(
        `DELETE FROM "businesses" WHERE "owner_user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" = $1);`,
        [OWNER_EMAIL],
      );
      await sql.unsafe(`DELETE FROM "user_platform_roles" WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" = $1);`, [
        OWNER_EMAIL,
      ]);
      await sql.unsafe(`DELETE FROM "users" WHERE "email_normalized" = $1;`, [OWNER_EMAIL]);
      await sql.end();
      resetEnvCache();
    }
  });

  it('gates permissions on active membership and role grants', async () => {
    const sql = await connectOrSkip();
    if (!sql) return;
    try {
      await runMigrations(sql, migrationsDir);
      for (const email of [OWNER_EMAIL, EDITOR_EMAIL, OUTSIDER_EMAIL]) {
        await sql.unsafe(
          `INSERT INTO "users" ("email_normalized","password_hash","status") VALUES ($1,'x','active') ON CONFLICT DO NOTHING;`,
          [email],
        );
      }
      const ids = (await sql.unsafe(
        `SELECT "email_normalized" AS email, "id" FROM "users" WHERE "email_normalized" IN ($1,$2,$3);`,
        [OWNER_EMAIL, EDITOR_EMAIL, OUTSIDER_EMAIL],
      )) as Array<{ email: string; id: string }>;
      const byEmail = Object.fromEntries(ids.map((r) => [r.email, r.id]));
      const biz = (await sql.unsafe(
        `INSERT INTO "businesses" ("owner_user_id") VALUES ($1) RETURNING "id";`,
        [byEmail[OWNER_EMAIL]],
      )) as Array<{ id: string }>;
      const businessId = biz[0]?.id as string;
      const store = (await sql.unsafe(
        `INSERT INTO "stores" ("business_id","slug","name","status") VALUES ($1,'t014-scope','Scope','active') RETURNING "id";`,
        [businessId],
      )) as Array<{ id: string }>;
      const storeId = store[0]?.id as string;
      await sql.unsafe(
        `INSERT INTO "store_memberships" ("store_id","user_id","role_id") SELECT $1, $2, "id" FROM "store_roles" WHERE "key" = 'owner';`,
        [storeId, byEmail[OWNER_EMAIL]],
      );
      await sql.unsafe(
        `INSERT INTO "store_memberships" ("store_id","user_id","role_id","status") SELECT $1, $2, "id", 'revoked' FROM "store_roles" WHERE "key" = 'manager';`,
        [storeId, byEmail[EDITOR_EMAIL]],
      );
      // Owner: everything. Revoked manager: nothing. Outsider: nothing.
      expect(await authorizeStore({ userId: byEmail[OWNER_EMAIL] as string, storeId, permission: 'store:manage' }, sql)).toBe(
        true,
      );
      expect(
        await authorizeStore({ userId: byEmail[EDITOR_EMAIL] as string, storeId, permission: 'fulfillment:manage' }, sql),
      ).toBe(false);
      expect(
        await authorizeStore({ userId: byEmail[OUTSIDER_EMAIL] as string, storeId, permission: 'catalog:manage' }, sql),
      ).toBe(false);
      expect(
        await authorizeStore({ userId: byEmail[OWNER_EMAIL] as string, storeId: '00000000-0000-0000-0000-000000000000', permission: 'catalog:manage' }, sql),
      ).toBe(false);

      // Promote the editor to catalog-editor (active): catalog yes, fulfill no.
      await sql.unsafe(`UPDATE "store_memberships" SET "role_id" = (SELECT "id" FROM "store_roles" WHERE "key" = 'catalog-editor'), "status" = 'active' WHERE "store_id" = $1 AND "user_id" = $2;`, [
        storeId,
        byEmail[EDITOR_EMAIL],
      ]);
      expect(
        await authorizeStore({ userId: byEmail[EDITOR_EMAIL] as string, storeId, permission: 'catalog:manage' }, sql),
      ).toBe(true);
      expect(
        await authorizeStore({ userId: byEmail[EDITOR_EMAIL] as string, storeId, permission: 'fulfillment:manage' }, sql),
      ).toBe(false);
    } finally {
      await sql.unsafe(`DELETE FROM "stores" WHERE "slug" IN ('t014-first','t014-second','t014-scope');`);
      await sql.unsafe(
        `DELETE FROM "businesses" WHERE "owner_user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" IN ($1,$2,$3));`,
        [OWNER_EMAIL, EDITOR_EMAIL, OUTSIDER_EMAIL],
      );
      await sql.unsafe(
        `DELETE FROM "user_platform_roles" WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" IN ($1,$2,$3));`,
        [OWNER_EMAIL, EDITOR_EMAIL, OUTSIDER_EMAIL],
      );
      await sql.unsafe(`DELETE FROM "users" WHERE "email_normalized" IN ($1,$2,$3);`, [
        OWNER_EMAIL,
        EDITOR_EMAIL,
        OUTSIDER_EMAIL,
      ]);
      await sql.end();
      resetEnvCache();
    }
  });
});
