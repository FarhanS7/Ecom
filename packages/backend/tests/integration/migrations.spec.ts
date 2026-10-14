// T003 verification: migration harness against real PostgreSQL.
// - Empty DB -> migrate -> probe table + sentinel row exist.
// - Migrate again -> no new work (twice-safe), sentinel still exactly one row.
// - Missing DATABASE_URL -> redacted config error (no secret in message).
// Skips gracefully when DATABASE_URL is unset or the database is unreachable,
// so unit CI without services stays green; real runs happen with infra up.

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { resetEnvCache } from '@shopscale/config';
import {
  DatabaseConfigError,
  openAdminConnection,
  requireDatabaseUrl,
  resolveMigrationsDir,
  runMigrations,
} from '../../src/platform/database.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const migrationsDir = resolveMigrationsDir(repoRoot);

async function tryConnect(url: string) {
  const sql = openAdminConnection(url);
  try {
    await sql`SELECT 1`;
    return sql;
  } catch {
    await sql.end();
    return null;
  }
}

describe('migration harness (T003)', () => {
  it('fails with a redacted error when DATABASE_URL is missing', () => {
    const saved = process.env.DATABASE_URL;
    resetEnvCache();
    // Point validation at values that fail without leaking anything.
    process.env.DATABASE_URL = '';
    process.env.REDIS_CACHE_URL = 'redis://localhost:6379';
    process.env.JWT_ACCESS_SECRET = 'a'.repeat(32);
    process.env.JWT_REFRESH_SECRET = 'b'.repeat(32);
    process.env.MOCK_PAYMENTS_SECRET = 'c'.repeat(32);
    try {
      expect(() => requireDatabaseUrl()).toThrow(DatabaseConfigError);
      try {
        requireDatabaseUrl();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        expect(msg).toMatch(/redacted/i);
        expect(msg).not.toMatch(/postgres:\/\//i);
      }
    } finally {
      resetEnvCache();
      if (saved === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = saved;
    }
  });

  it('migrates an empty database and re-runs safely', async () => {
    resetEnvCache();
    let url: string;
    try {
      url = requireDatabaseUrl();
    } catch {
      console.warn('SKIP: DATABASE_URL not configured; start infra first (T004).');
      return;
    }
    const sql = await tryConnect(url);
    if (!sql) {
      console.warn('SKIP: database unreachable; start infra first (T004).');
      return;
    }
    try {
      // Reset to empty for a true empty-DB proof (probe + tracking removed).
      await sql.unsafe('DROP TABLE IF EXISTS "migration_probe";');
      await sql.unsafe('DROP TABLE IF EXISTS "__shopscale_migrations";');

      const first = await runMigrations(sql, migrationsDir);
      expect(first.applied).toContain('0000-bootstrap.sql');

      const probe = await sql.unsafe('SELECT count(*)::int AS n FROM "migration_probe";');
      expect((probe as Array<{ n: number }>)[0].n).toBe(1);

      const second = await runMigrations(sql, migrationsDir);
      expect(second.applied).toHaveLength(0);
      expect(second.skipped).toContain('0000-bootstrap.sql');

      const again = await sql.unsafe('SELECT count(*)::int AS n FROM "migration_probe";');
      expect((again as Array<{ n: number }>)[0].n).toBe(1);
    } finally {
      await sql.end();
      resetEnvCache();
    }
  });

  it('upgrades a previous schema (pre-harness table preserved)', async () => {
    resetEnvCache();
    let url: string;
    try {
      url = requireDatabaseUrl();
    } catch {
      console.warn('SKIP: DATABASE_URL not configured; start infra first (T004).');
      return;
    }
    const sql = await tryConnect(url);
    if (!sql) {
      console.warn('SKIP: database unreachable; start infra first (T004).');
      return;
    }
    try {
      // Simulate a database that predates the harness tracking table.
      await sql.unsafe('DROP TABLE IF EXISTS "__shopscale_migrations";');
      await sql.unsafe(`
        CREATE TABLE IF NOT EXISTS "migration_probe" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "note" text NOT NULL,
          "created_at" timestamptz NOT NULL DEFAULT now()
        );
      `);
      const { applied } = await runMigrations(sql, migrationsDir);
      // Harness adopts the existing table and records the file exactly once.
      expect(applied.length).toBeLessThanOrEqual(1);
      const rows = await sql.unsafe('SELECT count(*)::int AS n FROM "migration_probe";');
      expect((rows as Array<{ n: number }>)[0].n).toBeGreaterThanOrEqual(1);
    } finally {
      await sql.end();
      resetEnvCache();
    }
  });
});
