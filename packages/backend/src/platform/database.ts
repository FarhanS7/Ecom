// @shopscale/backend/platform/database - Migration harness + connection boundary.
// Invariant: credentials come only from validated environment (@shopscale/config).
// Errors are redacted: never log the URL, password, or tokens.

import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { getEnv, resetEnvCache } from '@shopscale/config';

const MIGRATIONS_TABLE = '__shopscale_migrations';

export class DatabaseConfigError extends Error {
  readonly code = 'DATABASE_CONFIG_INVALID';
}

export class DatabaseConnectionError extends Error {
  readonly code = 'DATABASE_UNAVAILABLE';
}

/** Read DATABASE_URL from validated env, with a redacted error on failure. */
export function requireDatabaseUrl(): string {
  resetEnvCache();
  try {
    const env = getEnv();
    if (!env.DATABASE_URL || env.DATABASE_URL.length === 0) {
      throw new DatabaseConfigError(
        'Invalid configuration: DATABASE_URL is missing. Set it in .env (see .env.example). Value redacted.',
      );
    }
    return env.DATABASE_URL;
  } catch (err) {
    if (err instanceof DatabaseConfigError) throw err;
    // getEnv lists field names but never values; re-wrap to guarantee no
    // secret material leaks even if validation internals change.
    throw new DatabaseConfigError(
      'Invalid configuration: database credentials missing or malformed. ' +
        'Set DATABASE_URL in .env (see .env.example). Value redacted.',
    );
  }
}

/** Open a short-lived admin connection for migrations/health checks. */
export function openAdminConnection(url: string): Sql {
  return postgres(url, {
    max: 2,
    idle_timeout: 10,
    connect_timeout: 10,
    prepare: false,
    onnotice: () => {},
  });
}

/** Liveness-style check: can we run SELECT 1? Never throws credentials. */
export async function checkDatabaseConnection(sql: Sql): Promise<{ ok: true } | { ok: false; detail: string }> {
  try {
    await sql`SELECT 1`;
    return { ok: true };
  } catch {
    return { ok: false, detail: 'Database connection failed' };
  }
}

async function ensureMigrationsTable(sql: Sql): Promise<void> {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS "${MIGRATIONS_TABLE}" (
      "filename" text PRIMARY KEY,
      "applied_at" timestamptz NOT NULL DEFAULT now()
    );
  `);
}

async function getAppliedFilenames(sql: Sql): Promise<Set<string>> {
  const rows = (await sql.unsafe(
    `SELECT "filename" FROM "${MIGRATIONS_TABLE}";`,
  )) as unknown as Array<{ filename: string }>;
  return new Set(rows.map((r) => r.filename));
}

/**
 * Apply every *.sql file in `migrationsDir` in lexicographic order.
 * Each file runs in its own transaction; already-recorded files are skipped,
 * so running migrations twice is safe (idempotent). Returns the list of
 * newly applied files.
 */
export async function runMigrations(
  sql: Sql,
  migrationsDir: string,
): Promise<{ applied: string[]; skipped: string[] }> {
  const entries = await readdir(migrationsDir);
  const files = entries.filter((f) => f.endsWith('.sql')).sort();
  await ensureMigrationsTable(sql);
  const appliedSet = await getAppliedFilenames(sql);

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    if (appliedSet.has(file)) {
      skipped.push(file);
      continue;
    }
    const fullPath = join(migrationsDir, file);
    const contents = await readFile(fullPath, 'utf8');
    // One transaction per file: a failure leaves earlier files recorded
    // and the failed file unrecorded, so retry resumes correctly.
    await sql.begin(async (tx) => {
      await tx.unsafe(contents);
      await tx.unsafe(`INSERT INTO "${MIGRATIONS_TABLE}" ("filename") VALUES ($1) ON CONFLICT DO NOTHING;`, [
        file,
      ]);
    });
    applied.push(file);
  }

  return { applied, skipped };
}

/** Resolve the migrations directory from a repo root or explicit override. */
export function resolveMigrationsDir(repoRoot: string): string {
  return join(repoRoot, 'db', 'migrations');
}

/**
 * Locate `db/migrations` by walking up from a directory inside the repository.
 *
 * Why this exists: seven integration specs computed the repo root with a fixed
 * `join(here, '..', '..', '..')`. From `packages/backend/tests/integration` that
 * resolves to `<repo>/packages`, so `runMigrations` was pointed at
 * `<repo>/packages/db/migrations` and died on `readdir` (ENOENT) the moment a
 * real database was reachable — the specs only ever printed their honest SKIP
 * lines, so nobody saw it. Counting `..` is the bug; searching for the directory
 * cannot silently drift when a file moves.
 */
export function findMigrationsDir(startDir: string): string {
  let current = resolve(startDir);
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = resolveMigrationsDir(current);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error(`Could not locate db/migrations by walking up from ${startDir}.`);
}

/**
 * Port contract for dual connection pools separating write transactions from read queries (TASK-082).
 */
export interface ReplicaPoolPort {
  getPrimary(): Sql;
  getReplica(): Sql;
  isReplicaConfigured(): boolean;
  close(): Promise<void>;
}

/**
 * Dual connection pool router directing write operations to the primary instance
 * and read-only analytical/reporting queries to the read replica pool if configured.
 * Defaults gracefully to the primary pool if READ_REPLICA_URL is not set.
 */
export class DualPoolRouter implements ReplicaPoolPort {
  private primarySql: Sql | null = null;
  private replicaSql: Sql | null = null;

  constructor(
    private readonly primaryUrl?: string,
    private readonly replicaUrl?: string,
  ) {}

  getPrimary(): Sql {
    if (!this.primarySql) {
      const url = this.primaryUrl ?? requireDatabaseUrl();
      this.primarySql = postgres(url, {
        max: 10,
        idle_timeout: 20,
        connect_timeout: 10,
        prepare: false,
        onnotice: () => {},
      });
    }
    return this.primarySql;
  }

  getReplica(): Sql {
    const configuredUrl = this.replicaUrl ?? process.env['READ_REPLICA_URL'];
    if (configuredUrl) {
      if (!this.replicaSql) {
        this.replicaSql = postgres(configuredUrl, {
          max: 10,
          idle_timeout: 20,
          connect_timeout: 10,
          prepare: false,
          onnotice: () => {},
        });
      }
      return this.replicaSql;
    }
    return this.getPrimary();
  }

  isReplicaConfigured(): boolean {
    return Boolean(this.replicaUrl ?? process.env['READ_REPLICA_URL']);
  }

  async close(): Promise<void> {
    if (this.replicaSql) {
      await this.replicaSql.end();
      this.replicaSql = null;
    }
    if (this.primarySql) {
      await this.primarySql.end();
      this.primarySql = null;
    }
  }
}

