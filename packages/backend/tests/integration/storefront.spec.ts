// T016b storefront resolution against real PostgreSQL: active resolves with
// validated theme, malicious rows fall back to defaults, suspended/pending/
// unknown slugs stay unavailable. Skips honestly without DB (T003 contract);
// CI runs it live.

import { describe, expect, it } from 'vitest';
import { resetEnvCache } from '@shopscale/config';
import { DEFAULT_THEME } from '@shopscale/contracts';
import { resolveStorefront } from '../../src/stores/channel.service.js';
import { getTheme as themeOf } from '../../src/stores/theme.service.js';
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

const OWNER = 't016.owner@example.com';

async function seed(sql: NonNullable<Awaited<ReturnType<typeof connectOrSkip>>>): Promise<void> {
  await cleanup(sql);
  await sql.unsafe(
    `INSERT INTO "users" ("email_normalized","password_hash","status") VALUES ($1,'x','active') ON CONFLICT DO NOTHING;`,
    [OWNER],
  );
  const userId = (
    (await sql.unsafe(`SELECT "id" FROM "users" WHERE "email_normalized" = $1;`, [OWNER])) as Array<{ id: string }>
  )[0]?.id as string;
  // One business per store (D-007), even for fixtures.
  const mk = async (slug: string, status: string, tokens: unknown | null) => {
    const b = (await sql.unsafe(`INSERT INTO "businesses" ("owner_user_id") VALUES ($1) RETURNING "id";`, [
      userId,
    ])) as Array<{ id: string }>;
    const store = (await sql.unsafe(
      `INSERT INTO "stores" ("business_id","slug","name","status") VALUES ($1,$2,$3,$4) RETURNING "id";`,
      [b[0]?.id as string, slug, slug, status],
    )) as Array<{ id: string }>;
    const storeId = store[0]?.id as string;
    if (tokens !== null) {
      await sql.unsafe(`INSERT INTO "store_themes" ("store_id","approved_tokens") VALUES ($1,$2::text::jsonb) ON CONFLICT DO NOTHING;`, [
        storeId,
        // Serialized here and parsed by the database: an uncast parameter against a
        // jsonb column would be double-encoded into a JSON string, which the theme
        // contract then rejects and the storefront falls back to the default theme.
        JSON.stringify(tokens),
      ]);
    }
    return storeId;
  };
  await mk('t016-alpha', 'active', { ...DEFAULT_THEME, accent: '#111111' });
  await mk('t016-beta', 'active', { ...DEFAULT_THEME, accent: '#222222' });
  await mk('t016-evil', 'active', { primary: 'expression(alert(1))', radius: 8 });
  await mk('t016-grey', 'suspended', null);
  await mk('t016-waiting', 'pending', null);
}

async function cleanup(sql: NonNullable<Awaited<ReturnType<typeof connectOrSkip>>>): Promise<void> {
  const slugs = ['t016-alpha', 't016-beta', 't016-evil', 't016-grey', 't016-waiting'].map((s) => `'${s}'`).join(',');
  await sql.unsafe(
    `DELETE FROM "store_themes" WHERE "store_id" IN (SELECT "id" FROM "stores" WHERE "slug" IN (${slugs}));`,
  );
  await sql.unsafe(
    `DELETE FROM "store_memberships" WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" = $1);`,
    [OWNER],
  );
  await sql.unsafe(`DELETE FROM "stores" WHERE "slug" IN (${slugs});`);
  await sql.unsafe(
    `DELETE FROM "businesses" WHERE "owner_user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" = $1) AND "id" NOT IN (SELECT "business_id" FROM "stores");`,
    [OWNER],
  );
  await sql.unsafe(
    `DELETE FROM "user_platform_roles" WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" = $1);`,
    [OWNER],
  );
  await sql.unsafe(`DELETE FROM "users" WHERE "email_normalized" = $1;`, [OWNER]);
}

describe('storefront resolution (T016b)', () => {
  it('resolves active stores, falls back on malice, hides the rest', async () => {
    const sql = await connectOrSkip();
    if (!sql) return;
    try {
      await runMigrations(sql, migrationsDir);
      await seed(sql);

      const alpha = await resolveStorefront('t016-alpha', sql);
      expect(alpha?.name).toBe('t016-alpha');
      expect(alpha?.theme.accent).toBe('#111111');

      const beta = await resolveStorefront('t016-beta', sql);
      expect(beta?.theme.accent).toBe('#222222');

      const evil = await resolveStorefront('t016-evil', sql);
      expect(evil?.theme).toEqual(DEFAULT_THEME);

      expect(await resolveStorefront('t016-grey', sql)).toBeNull();
      expect(await resolveStorefront('t016-waiting', sql)).toBeNull();
      expect(await resolveStorefront('t016-missing', sql)).toBeNull();
      expect(await resolveStorefront('../admin', sql)).toBeNull();

      // Theme service agrees at the row level.
      const evilId = (
        (await sql.unsafe(`SELECT "id" FROM "stores" WHERE "slug" = 't016-evil';`)) as Array<{ id: string }>
      )[0]?.id as string;
      expect(await themeOf(evilId, sql)).toEqual(DEFAULT_THEME);
    } finally {
      await cleanup(sql);
      await sql.end();
      resetEnvCache();
    }
  });
});
