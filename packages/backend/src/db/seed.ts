// @shopscale/backend/db/seed - deterministic seed entrypoint (T028a).
//
// Usage (root):   pnpm seed --size s --seed 42
// Usage (direct): tsx src/db/seed.ts --size s --seed 42
// Back-compat:    SEED=42 SIZE=s tsx src/db/seed.ts
//
// Two guards, both deliberate:
//   * Only Tier S is implemented; M/L/XL are refused BY NAME (T077 owns the
//     streaming bulk tiers) instead of silently seeding something smaller.
//   * The script refuses to touch a production database even accidentally.
// Nothing here prints credentials: the database is reported as host/path only.

import { openAdminConnection, requireDatabaseUrl } from '../platform/database.js';
import type { Sql } from 'postgres';
import {
  planIdentity,
  shapeForSize,
  writeIdentity,
  type IdentityWriteReport,
  type SeedSize,
} from './seed/identity.js';

export interface SeedOptions {
  size: SeedSize;
  seed: number;
}

const SIZES: readonly SeedSize[] = ['s', 'm', 'l', 'xl'];

/** Never print credentials: host and database path only. */
export function redactedDatabaseLabel(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}`;
  } catch {
    return '(unparsable DATABASE_URL, redacted)';
  }
}

/**
 * Accept both documented spellings (`--size s`, `--size=s`) and the original
 * `SIZE=` / `SEED=` argument form, plus the `SEED`/`SIZE` environment variables.
 */
export function parseSeedArgs(args: readonly string[], env: NodeJS.ProcessEnv = process.env): SeedOptions {
  const read = (name: 'size' | 'seed'): string | undefined => {
    const flag = `--${name}`;
    for (let index = 0; index < args.length; index += 1) {
      const arg = args[index]!;
      if (arg === flag) return args[index + 1];
      if (arg.startsWith(`${flag}=`)) return arg.slice(flag.length + 1);
      if (arg.toUpperCase().startsWith(`${name.toUpperCase()}=`)) return arg.slice(name.length + 1);
    }
    return env[name.toUpperCase()];
  };

  const rawSize = (read('size') ?? 's').trim();
  if (!SIZES.includes(rawSize as SeedSize)) {
    throw new Error(`SIZE must be one of: ${SIZES.join(', ')} (received "${rawSize}")`);
  }
  const rawSeed = read('seed') ?? '42';
  const seed = Number.parseInt(rawSeed, 10);
  if (!Number.isFinite(seed)) {
    throw new Error(`SEED must be an integer (received "${rawSeed}")`);
  }
  return { size: rawSize as SeedSize, seed };
}

/**
 * Refuse a production target unless the operator says so explicitly. A seed run
 * deletes nothing, but it does write fixture accounts and a catalog, which is
 * exactly what must never land on a production database by accident.
 */
export function assertSeedTarget(input: { nodeEnv?: string | undefined; force?: string | undefined }): void {
  const nodeEnv = input.nodeEnv ?? process.env['NODE_ENV'];
  const force = input.force ?? process.env['SEED_FORCE'];
  if (nodeEnv === 'production' && force !== '1') {
    throw new Error(
      'Refusing to seed with NODE_ENV=production. Set SEED_FORCE=1 only if you have confirmed the target database is disposable.',
    );
  }
}

export interface SeedReport {
  options: SeedOptions;
  identity: IdentityWriteReport;
}

/** Plan and write the dataset. T028b extends this with the catalog tables. */
export async function seedDatabase(sql: Sql, options: SeedOptions): Promise<SeedReport> {
  const shape = shapeForSize(options.size);
  const plan = planIdentity({ seed: options.seed, shape });
  const identity = await writeIdentity(sql, plan);
  return { options, identity };
}

async function main(): Promise<void> {
  const options = parseSeedArgs(process.argv.slice(2));
  assertSeedTarget({});
  // Refuse an unsupported size BEFORE connecting: the operator should learn the
  // tier is unavailable from the message, not from a half-written database.
  const shape = shapeForSize(options.size);
  const url = requireDatabaseUrl();

  console.log(`Seeding database: size=${options.size}, seed=${options.seed}`);
  console.log(`Database: ${redactedDatabaseLabel(url)}`);

  const sql = openAdminConnection(url);
  try {
    await sql`SELECT 1`;
    const report = await seedDatabase(sql, options);
    console.log(`Shape: ${shape.stores} stores, ${shape.productsPerStore} products/store, ${shape.categories} categories`);
    console.log(
      `Identity written: users=${report.identity.user} businesses=${report.identity.business} ` +
        `stores=${report.identity.store} memberships=${report.identity.membership} ` +
        `platformRoles=${report.identity.platformRole} (existing rows are left untouched)`,
    );
  } finally {
    await sql.end();
  }
}

// Never run on import: the unit suites import this module for its parsers.
const underTest = process.env['VITEST'] !== undefined || process.env['NODE_ENV'] === 'test';
if (!underTest) {
  main().catch((err: unknown) => {
    console.error('Seed failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
