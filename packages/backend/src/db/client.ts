// @shopscale/backend/db/client - PostgreSQL client (Drizzle + postgres.js)
// Lazy singleton: constructing the module must NEVER throw on missing env.
// The first call to getSql()/getDb() validates configuration (redacted errors)
// and connects on demand. Boot code calls getEnv() explicitly to fail fast.

import pg from 'postgres';
import type { Sql, TransactionSql } from 'postgres';
import { getEnv } from '@shopscale/config';

let sql: Sql | null = null;

export function getSql(): Sql {
  if (!sql) {
    const env = getEnv();
    sql = pg(env.DATABASE_URL, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
      onnotice: () => {}, // Suppress notices in production
    });
  }
  return sql;
}

/** Lazy alias for the shared client. Prefer over holding module-level handles. */
export function getDb(): Sql {
  return getSql();
}

export async function closeSql(): Promise<void> {
  if (sql) {
    await sql.end();
    sql = null;
  }
}

// Transaction helper
export async function withTransaction<T>(
  callback: (tx: TransactionSql<{}>) => Promise<T>
): Promise<T> {
  const sql = getSql();
  // @ts-expect-error - postgres.js types are complex; this works at runtime
  return sql.begin(callback);
}
