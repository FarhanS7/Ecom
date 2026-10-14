// db:migrate entry point. Usage: pnpm db:migrate
// Applies reviewed SQL in db/migrations/ via the harness in
// packages/backend/src/platform/database.ts. Exits non-zero on failure
// without printing credentials.

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  openAdminConnection,
  requireDatabaseUrl,
  resolveMigrationsDir,
  runMigrations,
} from '../platform/database.js';

const here = dirname(fileURLToPath(import.meta.url));
// src/db/migrate.ts -> package root -> repo root
const repoRoot = join(here, '..', '..', '..', '..');

async function main(): Promise<void> {
  let url: string;
  try {
    url = requireDatabaseUrl();
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
  const sql = openAdminConnection(url);
  try {
    const dir = resolveMigrationsDir(repoRoot);
    const { applied, skipped } = await runMigrations(sql, dir);
    console.log(`migrations applied: ${applied.length} (${applied.join(', ') || 'none'})`);
    console.log(`migrations skipped (already applied): ${skipped.length}`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  // Never print err.cause/connection strings; harness errors are pre-redacted.
  console.error(err instanceof Error ? err.message : 'Migration failed');
  process.exit(1);
});
