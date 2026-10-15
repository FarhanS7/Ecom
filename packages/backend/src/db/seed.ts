// @shopscale/backend/db/seed - deterministic seed entrypoint (T028a/T028b).
//
// Usage (root):   pnpm seed --size s --seed 42
//                 pnpm seed:verify            (counts/FKs/distributions, no writes)
// Usage (direct): tsx src/db/seed.ts [--size s] [--seed 42] [--verify]
// Back-compat:    SEED=42 SIZE=s tsx src/db/seed.ts
//
// Two guards, both deliberate:
//   * Only Tier S is implemented; M/L/XL are refused BY NAME (T077 owns the
//     streaming bulk tiers) instead of silently seeding something smaller.
//   * The script refuses to touch a production database even accidentally.
// Nothing here prints credentials: the database is reported as host/path only,
// and the checksums cover domain columns, never `password_hash`.
//
// Seeding is idempotent: every row is inserted with ON CONFLICT DO NOTHING against
// a name-addressed primary key, so a second run reports 0 inserted and changes
// nothing (proven in T028c against a live database).

import { openAdminConnection, requireDatabaseUrl } from '../platform/database.js';
import type { Sql } from 'postgres';
import { planCatalog, writeCatalog, type CatalogWriteReport } from './seed/catalog.js';
import {
  planIdentity,
  shapeForSize,
  writeIdentity,
  type IdentityWriteReport,
  type SeedSize,
} from './seed/identity.js';
import { planThemes, writeThemes, type ThemeWriteReport } from './seed/themes.js';
import { planChecksum, verifyDatabase, type SeedVerification } from './seed/verify.js';

export interface SeedOptions {
  size: SeedSize;
  seed: number;
  /** Report what is seeded instead of writing (the `seed:verify` mode). */
  verify: boolean;
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
  return { size: rawSize as SeedSize, seed, verify: args.includes('--verify') };
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
  catalog: CatalogWriteReport;
  themes: ThemeWriteReport;
  /** Digest of the PLAN, for comparison with the database checksum. */
  planChecksum: string;
}

/** Plan the whole dataset, then write it in FK order. */
export async function seedDatabase(sql: Sql, options: SeedOptions): Promise<SeedReport> {
  const shape = shapeForSize(options.size);
  const identity = planIdentity({ seed: options.seed, shape });
  const catalog = planCatalog(identity);
  const themes = planThemes(identity, catalog);
  const bundle = { identity, catalog, themes };

  const identityReport = await writeIdentity(sql, identity);
  const catalogReport = await writeCatalog(sql, catalog);
  const themeReport = await writeThemes(sql, themes);

  return {
    options,
    identity: identityReport,
    catalog: catalogReport,
    themes: themeReport,
    planChecksum: planChecksum(bundle),
  };
}

function printVerification(verification: SeedVerification): void {
  console.log('Counts:');
  for (const count of verification.counts) {
    console.log(`  ${count.table.padEnd(20)} ${count.rows}`);
  }
  console.log(`Checksum (database): ${verification.checksum}`);
  console.log('Checksums (per table):');
  for (const table of Object.keys(verification.checksums).sort()) {
    console.log(`  ${table.padEnd(20)} ${verification.checksums[table]}`);
  }
  const distributions = verification.distributions;
  console.log(
    'Distributions: ' +
      `stores=${distributions.stores} (empty=${distributions.emptyStores}) ` +
      `products=${distributions.products} variants=${distributions.variants} (active=${distributions.activeVariants}) ` +
      `store-visible=${distributions.storeChannelVisible} marketplace-visible=${distributions.marketplaceVisible} ` +
      `draft-with-flag=${distributions.draftProductsWithChannelFlag} archived=${distributions.archivedProducts}`,
  );
  // The commands doc lists "ledger" alongside counts/FKs/distributions; there are
  // no order/payment rows until T077, so it is reported as not applicable.
  console.log('Ledger: not applicable until orders exist (T077).');
  console.log(`Checks: ${verification.integrity.length} foreign-key checks ran.`);
  if (verification.failures.length > 0) {
    console.error('Verification FAILED:');
    for (const failure of verification.failures) console.error(`  - ${failure}`);
  } else {
    console.log('Verification passed: no orphans, no derived-price mismatch, no unpublishable product.');
  }
}

async function main(): Promise<void> {
  const options = parseSeedArgs(process.argv.slice(2));
  assertSeedTarget({});
  // Refuse an unsupported size BEFORE connecting: the operator should learn the
  // tier is unavailable from the message, not from a half-written database.
  const shape = shapeForSize(options.size);

  console.log(
    options.verify
      ? `Verifying seeded data: size=${options.size}, seed=${options.seed}`
      : `Seeding database: size=${options.size}, seed=${options.seed}`,
  );
  // Logged before the connection so an operator can see WHICH mode was requested
  // even when the target turns out to be unreachable (or misconfigured).
  const url = requireDatabaseUrl();
  console.log(`Database: ${redactedDatabaseLabel(url)}`);

  const sql = openAdminConnection(url);
  try {
    await sql`SELECT 1`;

    if (options.verify) {
      const verification = await verifyDatabase(sql);
      printVerification(verification);
      if (verification.failures.length > 0) process.exitCode = 1;
      return;
    }

    const report = await seedDatabase(sql, options);
    console.log(
      `Shape: ${shape.stores} stores (${shape.emptyStores} empty), ${shape.productsPerStore} products/store, ` +
        `${shape.categories} categories`,
    );
    console.log(
      `Identity written: users=${report.identity.user} businesses=${report.identity.business} ` +
        `stores=${report.identity.store} memberships=${report.identity.membership} ` +
        `platformRoles=${report.identity.platformRole} (existing rows are left untouched)`,
    );
    console.log(
      `Catalog written: categories=${report.catalog.category} products=${report.catalog.product} ` +
        `variants=${report.catalog.variant} publications=${report.catalog.publication}`,
    );
    console.log(`Themes written: themes=${report.themes.theme} content=${report.themes.content}`);
    console.log(`Checksum (plan): ${report.planChecksum}`);

    const verification = await verifyDatabase(sql);
    printVerification(verification);
    if (verification.failures.length > 0) process.exitCode = 1;
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
