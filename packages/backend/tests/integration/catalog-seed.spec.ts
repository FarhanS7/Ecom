// T028c: the seed against real PostgreSQL. The task file's own acceptance
// scenario — "seed isolated DB twice and compare counts/checksums; verify all FKs
// and storefront browsing" — which no unit test can prove.
//
// Skips honestly without DATABASE_URL or a reachable database (T003 contract);
// CI runs it live. The task file suggested `jest --runInBand`; the runner is
// vitest (docs/operations/commands.md), so this runs under
// `vitest --config vitest.integration.config.ts`.
//
// Every fixture this spec creates is marked (`seed.` emails, `seed-` slugs,
// `SEED-` SKUs) and removed in a `finally`, so it cannot disturb the other specs'
// fixtures and stays re-runnable.

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { resetEnvCache } from '@shopscale/config';
import { getChannelProduct, listChannelProducts } from '../../src/catalog/read.service.js';
import { planCatalog, writeCatalog } from '../../src/db/seed/catalog.js';
import { planIdentity, writeIdentity, type SeedShape } from '../../src/db/seed/identity.js';
import { planThemes, writeThemes } from '../../src/db/seed/themes.js';
import {
  cleanupSeedData,
  databaseChecksum,
  tableCounts,
  verifyDatabase,
} from '../../src/db/seed/verify.js';
import { seedDatabase } from '../../src/db/seed.js';
import {
  findMigrationsDir,
  openAdminConnection,
  requireDatabaseUrl,
  runMigrations,
} from '../../src/platform/database.js';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = findMigrationsDir(here);

/** Small enough to run twice in a test; wide enough for every storefront state. */
const SHAPE: SeedShape = {
  stores: 3,
  emptyStores: 1,
  productsPerStore: 8,
  variantsPerProduct: [2, 3],
  categories: 3,
  staffPerStore: 3,
};

type Sql = NonNullable<Awaited<ReturnType<typeof connectOrSkip>>>;

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

function buildPlan(seed: number) {
  const identity = planIdentity({ seed, shape: SHAPE });
  const catalog = planCatalog(identity);
  const themes = planThemes(identity, catalog);
  return { identity, catalog, themes };
}

async function applyPlan(sql: Sql, plan: ReturnType<typeof buildPlan>) {
  const identity = await writeIdentity(sql, plan.identity);
  const catalog = await writeCatalog(sql, plan.catalog);
  const themes = await writeThemes(sql, plan.themes);
  return { identity, catalog, themes };
}

function slugById(plan: ReturnType<typeof buildPlan>, id: string): string {
  const product = plan.catalog.products.find((row) => row.id === id);
  if (!product) throw new Error(`no planned product with id ${id}`);
  return product.slug;
}

describe('seed lifecycle against PostgreSQL (T028c)', () => {
  it('is idempotent, reproducible, and self-consistent', async () => {
    const sql = await connectOrSkip();
    if (!sql) return;
    try {
      await runMigrations(sql, migrationsDir);
      await cleanupSeedData(sql);

      const first = buildPlan(42);
      const firstWrite = await applyPlan(sql, first);
      // A clean slate means every planned row is a new row.
      expect(firstWrite.identity.user).toBe(first.identity.users.length);
      expect(firstWrite.identity.store).toBe(first.identity.stores.length);
      expect(firstWrite.identity.membership).toBe(first.identity.memberships.length);
      expect(firstWrite.catalog.product).toBe(first.catalog.products.length);
      expect(firstWrite.catalog.variant).toBe(first.catalog.variants.length);
      expect(firstWrite.catalog.publication).toBe(first.catalog.publications.length);
      expect(firstWrite.themes.theme).toBe(first.themes.themes.length);
      expect(firstWrite.themes.content).toBe(first.themes.content.length);

      const countsAfterFirst = await tableCounts(sql);
      const checksumAfterFirst = await databaseChecksum(sql);
      // Guard against a vacuous comparison.
      expect(countsAfterFirst.find((row) => row.table === 'products')?.rows).toBe(
        first.catalog.products.length,
      );

      // (1) IDEMPOTENCE: a second run inserts nothing and changes no digest.
      const secondWrite = await applyPlan(sql, first);
      expect(secondWrite).toEqual({
        identity: { user: 0, business: 0, store: 0, membership: 0, platformRole: 0 },
        catalog: { category: 0, product: 0, variant: 0, publication: 0 },
        themes: { theme: 0, content: 0 },
      });
      expect(await tableCounts(sql)).toEqual(countsAfterFirst);
      expect(await databaseChecksum(sql)).toBe(checksumAfterFirst);

      // (2) REPRODUCIBILITY: after a wipe, the same seed rebuilds the same dataset
      // — ids, timestamps and derived prices included, because they are all
      // functions of the seed rather than of the clock or of insertion order.
      await cleanupSeedData(sql);
      await applyPlan(sql, buildPlan(42));
      expect(await databaseChecksum(sql)).toBe(checksumAfterFirst);

      // (3) SENSITIVITY: a different seed is a different dataset.
      await cleanupSeedData(sql);
      const other = buildPlan(43);
      await applyPlan(sql, other);
      expect(await databaseChecksum(sql)).not.toBe(checksumAfterFirst);
      expect(other.catalog.products.length).toBe(first.catalog.products.length);

      // (4) VALIDITY: every FK holds, no product is unpublishable, and every
      // derived price agrees with its active variants.
      const verification = await verifyDatabase(sql);
      expect(verification.integrity.map((check) => check.name)).toHaveLength(15);
      expect(verification.integrity.filter((check) => check.orphans !== 0)).toEqual([]);
      expect(verification.distributions.derivedPriceMismatches).toBe(0);
      expect(verification.distributions.productsWithoutActiveVariant).toBe(0);
      expect(verification.distributions.draftProductsWithChannelFlag).toBeGreaterThan(0);
      expect(verification.distributions.emptyStores).toBeGreaterThan(0);
      expect(verification.failures).toEqual([]);
    } finally {
      await cleanupSeedData(sql);
      await sql.end();
      resetEnvCache();
    }
  });

  it('browses the seeded catalog through the real read service', async () => {
    const sql = await connectOrSkip();
    if (!sql) return;
    try {
      await runMigrations(sql, migrationsDir);
      await cleanupSeedData(sql);
      const bundle = buildPlan(42);
      await applyPlan(sql, bundle);

      const [alpha, beta, gamma] = bundle.catalog.stores;
      expect(alpha?.slug).toBe('seed-alpha');
      expect(beta?.slug).toBe('seed-beta');
      expect(gamma?.empty).toBe(true);
      expect(alpha!.marketplaceProductIds.length).toBeGreaterThan(0);

      // MARKETPLACE: every seeded marketplace-visible product is listed, and the
      // store-only and empty stores contribute nothing. (Filtered to seeded ids so
      // an unrelated leftover fixture could not make this vacuous or flaky.)
      const seededMarketplace = new Set(alpha!.marketplaceProductIds);
      const marketplace = await listChannelProducts({ channel: 'marketplace', limit: 100 }, sql);
      const marketplaceIds = marketplace.items.map((item) => item.id);
      expect(marketplaceIds.filter((id) => seededMarketplace.has(id)).sort()).toEqual(
        [...seededMarketplace].sort(),
      );
      for (const store of [beta!, gamma!]) {
        for (const id of store.productIds) expect(marketplaceIds).not.toContain(id);
      }

      // STORE CHANNEL: scoped by slug, so the returned page is exactly that
      // store's visible products.
      const alphaList = await listChannelProducts({ channel: 'store', storeSlug: alpha!.slug, limit: 100 }, sql);
      expect(alphaList.items.map((item) => item.id).sort()).toEqual([...alpha!.storeProductIds].sort());
      const betaList = await listChannelProducts({ channel: 'store', storeSlug: beta!.slug, limit: 100 }, sql);
      expect(betaList.items.map((item) => item.id).sort()).toEqual([...beta!.storeProductIds].sort());
      // The store-only store is invisible on the marketplace.
      for (const item of betaList.items) expect(marketplaceIds).not.toContain(item.id);

      // EMPTY STORE: a real empty page, not an error and not a hint.
      const gammaList = await listChannelProducts({ channel: 'store', storeSlug: gamma!.slug, limit: 100 }, sql);
      expect(gammaList.items).toEqual([]);
      expect(gammaList.nextCursor).toBeNull();

      // DETAIL: a listed product resolves with its active variants.
      const visibleSlug = slugById(bundle, alpha!.storeProductIds[0]!);
      const detail = await getChannelProduct(
        { channel: 'store', storeSlug: alpha!.slug, productSlug: visibleSlug },
        sql,
      );
      expect(detail?.slug).toBe(visibleSlug);
      expect(detail?.variants.length).toBeGreaterThan(0);
      expect(detail?.store.slug).toBe(alpha!.slug);

      // INVISIBLE, even though its publication row carries a channel flag:
      // the draft (ADR-0010 "on (not live)") and the archived product.
      expect(alpha!.draftFlaggedProductIds.length).toBeGreaterThan(0);
      expect(alpha!.archivedProductIds.length).toBeGreaterThan(0);
      for (const id of [...alpha!.draftFlaggedProductIds, ...alpha!.archivedProductIds]) {
        const slug = slugById(bundle, id);
        expect(await getChannelProduct({ channel: 'store', storeSlug: alpha!.slug, productSlug: slug }, sql)).toBeNull();
        expect(await getChannelProduct({ channel: 'marketplace', productSlug: slug }, sql)).toBeNull();
      }

      // INVISIBLE because it is on no channel at all, although it is active.
      const unlisted = bundle.catalog.products.filter(
        (product) =>
          product.store_id === alpha!.storeId &&
          product.status === 'active' &&
          bundle.catalog.publications.find((row) => row.product_id === product.id)?.store_enabled === false &&
          bundle.catalog.publications.find((row) => row.product_id === product.id)?.marketplace_enabled === false,
      );
      expect(unlisted.length).toBeGreaterThan(0);
      for (const product of unlisted) {
        expect(
          await getChannelProduct({ channel: 'store', storeSlug: alpha!.slug, productSlug: product.slug }, sql),
        ).toBeNull();
        expect(await getChannelProduct({ channel: 'marketplace', productSlug: product.slug }, sql)).toBeNull();
      }

      // CROSS-STORE: the seeded stores deliberately reuse product slugs (per-store
      // uniqueness is the constraint, and proving that needs a repeat), so the
      // assertion cannot be "null" — it is "always the store that was asked for".
      // A leak would serve alpha's product through beta's channel.
      for (const id of alpha!.storeProductIds.slice(0, 3)) {
        const slug = slugById(bundle, id);
        const viaAlpha = await getChannelProduct(
          { channel: 'store', storeSlug: alpha!.slug, productSlug: slug },
          sql,
        );
        expect(viaAlpha?.store.slug).toBe(alpha!.slug);
        const viaBeta = await getChannelProduct(
          { channel: 'store', storeSlug: beta!.slug, productSlug: slug },
          sql,
        );
        if (viaBeta) {
          expect(viaBeta.store.slug).toBe(beta!.slug);
          expect(viaBeta.id).not.toBe(id);
        }
      }
    } finally {
      await cleanupSeedData(sql);
      await sql.end();
      resetEnvCache();
    }
  });

  it('runs the documented CLI path (Tier S) and verifies its own dataset', async () => {
    const sql = await connectOrSkip();
    if (!sql) return;
    try {
      await runMigrations(sql, migrationsDir);
      await cleanupSeedData(sql);

      // The exact entrypoint `pnpm seed` uses, so the wiring (shapeForSize →
      // plan → write → verify) is exercised live and not only in unit tests.
      const report = await seedDatabase(sql, { size: 's', seed: 42, verify: false });
      expect(report.catalog.product).toBe(1000);
      expect(report.catalog.variant).toBeGreaterThanOrEqual(2000);
      expect(report.planChecksum).toMatch(/^[0-9a-f]{32}$/);

      const verification = await verifyDatabase(sql);
      expect(verification.failures).toEqual([]);
      expect(verification.distributions.products).toBe(1000);
      expect(verification.distributions.emptyStores).toBe(1);
      expect(verification.counts.find((row) => row.table === 'stores')?.rows).toBe(3);

      // A second live run of the CLI path is a no-op, not a duplicate catalog.
      const checksumBeforeRerun = await databaseChecksum(sql);
      const again = await seedDatabase(sql, { size: 's', seed: 42, verify: false });
      expect(again.catalog.product).toBe(0);
      expect(again.catalog.variant).toBe(0);
      expect(await databaseChecksum(sql)).toBe(checksumBeforeRerun);
      expect((await verifyDatabase(sql)).distributions.products).toBe(1000);
    } finally {
      await cleanupSeedData(sql);
      await sql.end();
      resetEnvCache();
    }
  });
});
