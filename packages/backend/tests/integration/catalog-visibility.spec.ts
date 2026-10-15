// T021b visibility battery over real PostgreSQL: seed two stores and the
// three publication combinations (marketplace-only, store-only, both) and
// assert list, detail, and count visibility on both channels — plus the
// invisibility cases: unpublished detail nulls out, draft/archived
// excluded, suspended store vanishes from every channel. Needs a REAL
// database; skips honestly otherwise (CI runs it live).
//
// This spec drives the read SERVICE directly (no HTTP): channel visibility
// is a SQL property and the service is the single WHERE shape the public
// controller delegates to. Placement mirrors T019's catalog-schema.spec
// (backend suite) for the same reason. HTTP plumbing is covered by
// catalog-write.spec.ts and the T018 matrix.

import { describe, expect, it } from 'vitest';
import { resetEnvCache } from '@shopscale/config';
import { getChannelProduct, listChannelProducts } from '../../src/catalog/read.service.js';
import {
  openAdminConnection,
  requireDatabaseUrl,
  resolveMigrationsDir,
  runMigrations,
} from '../../src/platform/database.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const migrationsDir = resolveMigrationsDir(repoRoot);

type Sql = Awaited<ReturnType<typeof openAdminConnection>>;

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

async function cleanup(sql: Sql): Promise<void> {
  await sql.unsafe(`DELETE FROM "product_publications" WHERE "product_id" IN (SELECT "id" FROM "products" WHERE "slug" LIKE 't021-%');`);
  await sql.unsafe(`DELETE FROM "product_variants" WHERE "sku" LIKE 'T021-%';`);
  await sql.unsafe(`DELETE FROM "products" WHERE "slug" LIKE 't021-%';`);
  await sql.unsafe(`DELETE FROM "stores" WHERE "slug" LIKE 't021-%';`);
  await sql.unsafe(
    `DELETE FROM "businesses" WHERE "owner_user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" LIKE 't021.%');`,
  );
  await sql.unsafe(`DELETE FROM "users" WHERE "email_normalized" LIKE 't021.%';`);
}

async function seedStore(sql: Sql, suffix: string): Promise<string> {
  const users = (await sql.unsafe(
    `INSERT INTO "users" ("email_normalized","password_hash") VALUES ($1,'x') RETURNING "id";`,
    [`t021.${suffix}@example.com`],
  )) as unknown as Array<{ id: string }>;
  const businesses = (await sql.unsafe(
    `INSERT INTO "businesses" ("owner_user_id") VALUES ($1) RETURNING "id";`,
    [users[0]!.id],
  )) as unknown as Array<{ id: string }>;
  const stores = (await sql.unsafe(
    `INSERT INTO "stores" ("business_id","slug","name","status") VALUES ($1,$2,$3,'active') RETURNING "id";`,
    [businesses[0]!.id, `t021-${suffix}`, `T021 ${suffix}`],
  )) as unknown as Array<{ id: string }>;
  return stores[0]!.id;
}

async function seedProduct(
  sql: Sql,
  storeId: string,
  slug: string,
  status: string,
  marketplace: boolean,
  store: boolean,
): Promise<string> {
  const products = (await sql.unsafe(
    `INSERT INTO "products" ("store_id","slug","title","status") VALUES ($1,$2,$3,$4) RETURNING "id";`,
    [storeId, slug, `Product ${slug}`, status],
  )) as unknown as Array<{ id: string }>;
  await sql.unsafe(
    `INSERT INTO "product_publications" ("product_id","marketplace_enabled","store_enabled") VALUES ($1,$2,$3);`,
    [products[0]!.id, marketplace, store],
  );
  return products[0]!.id;
}

describe('channel catalog visibility (T021b)', () => {
  it('marketplace vs store channel: three publication combinations across two stores', async () => {
    const sql = await connectOrSkip();
    if (!sql) return;
    try {
      await runMigrations(sql, migrationsDir);
      await cleanup(sql);
      const storeA = await seedStore(sql, 'store-a');
      const storeB = await seedStore(sql, 'store-b');

      // Combination 1: marketplace-only (A).
      await seedProduct(sql, storeA, 't021-mp-only', 'active', true, false);
      // Combination 2: store-only (B).
      await seedProduct(sql, storeB, 't021-store-only', 'active', false, true);
      // Combination 3: both channels (A).
      const bothId = await seedProduct(sql, storeA, 't021-both', 'active', true, true);
      // Invisible everywhere: fully unpublished (B).
      await seedProduct(sql, storeB, 't021-unpublished', 'active', false, false);
      // Invisible everywhere: draft with both flags (A).
      await seedProduct(sql, storeA, 't021-draft', 'draft', true, true);
      // Invisible everywhere: archived with both flags (B).
      await seedProduct(sql, storeB, 't021-archived', 'archived', true, true);

      // Marketplace list: mp-only + both, nothing else.
      const market = await listChannelProducts({ channel: 'marketplace' }, sql);
      expect(market.items.map((p) => p.slug).sort()).toEqual(['t021-both', 't021-mp-only']);

      // Store A list: its store-enabled product only.
      const storeAList = await listChannelProducts({ channel: 'store', storeSlug: 't021-store-a' }, sql);
      expect(storeAList.items.map((p) => p.slug)).toEqual(['t021-both']);

      // Store B list: its store-only product.
      const storeBList = await listChannelProducts({ channel: 'store', storeSlug: 't021-store-b' }, sql);
      expect(storeBList.items.map((p) => p.slug)).toEqual(['t021-store-only']);

      // Counts follow visibility (three-combination matrix).
      expect(market.items).toHaveLength(2);
      expect(storeAList.items).toHaveLength(1);
      expect(storeBList.items).toHaveLength(1);

      // Detail visibility: published products resolve on their channel…
      expect((await getChannelProduct({ channel: 'marketplace', productSlug: 't021-mp-only' }, sql))?.slug).toBe(
        't021-mp-only',
      );
      expect(
        (await getChannelProduct({ channel: 'store', storeSlug: 't021-store-b', productSlug: 't021-store-only' }, sql))
          ?.slug,
      ).toBe('t021-store-only');
      // …and cross-channel reads leak nothing (null, same as unknown slug).
      expect(await getChannelProduct({ channel: 'marketplace', productSlug: 't021-store-only' }, sql)).toBeNull();
      expect(
        await getChannelProduct({ channel: 'store', storeSlug: 't021-store-a', productSlug: 't021-mp-only' }, sql),
      ).toBeNull();
      expect(await getChannelProduct({ channel: 'marketplace', productSlug: 't021-unpublished' }, sql)).toBeNull();
      expect(await getChannelProduct({ channel: 'marketplace', productSlug: 't021-draft' }, sql)).toBeNull();
      expect(await getChannelProduct({ channel: 'marketplace', productSlug: 't021-archived' }, sql)).toBeNull();
      expect(await getChannelProduct({ channel: 'marketplace', productSlug: 't021-never-existed' }, sql)).toBeNull();

      // Detail of a visible product exposes its ACTIVE variants only.
      await sql.unsafe(
        `INSERT INTO "product_variants" ("product_id","store_id","sku","price_cents","status") VALUES ($1,$2,'T021-ACTIVE',1000,'active');`,
        [bothId, storeA],
      );
      await sql.unsafe(
        `INSERT INTO "product_variants" ("product_id","store_id","sku","price_cents","status") VALUES ($1,$2,'T021-HIDDEN',2000,'inactive');`,
        [bothId, storeA],
      );
      const detail = await getChannelProduct({ channel: 'marketplace', productSlug: 't021-both' }, sql);
      expect(detail?.variants.map((v) => v.sku)).toEqual(['T021-ACTIVE']);
      expect(detail?.store).toEqual({ slug: 't021-store-a', name: 'T021 store-a' });

      // Unknown and suspended stores share one outcome on the store channel.
      expect(await listChannelProducts({ channel: 'store', storeSlug: 't021-no-such' }, sql)).toEqual({
        items: [],
        nextCursor: null,
      });
      await sql.unsafe(`UPDATE "stores" SET "status" = 'suspended' WHERE "slug" = 't021-store-b';`);
      expect(await listChannelProducts({ channel: 'store', storeSlug: 't021-store-b' }, sql)).toEqual({
        items: [],
        nextCursor: null,
      });
      expect(
        await getChannelProduct({ channel: 'store', storeSlug: 't021-store-b', productSlug: 't021-store-only' }, sql),
      ).toBeNull();
      // Marketplace too: a suspended store's products vanish from every channel.
      const marketAfter = await listChannelProducts({ channel: 'marketplace' }, sql);
      expect(marketAfter.items.map((p) => p.slug).sort()).toEqual(['t021-both', 't021-mp-only']);
    } finally {
      await cleanup(sql);
      await sql.end();
    }
  });

  it('filters and sorts narrow visibility deterministically', async () => {
    const sql = await connectOrSkip();
    if (!sql) return;
    try {
      await runMigrations(sql, migrationsDir);
      await cleanup(sql);
      const storeA = await seedStore(sql, 'filter-store');
      const cheap = await seedProduct(sql, storeA, 't021-cheap', 'active', true, true);
      const pricey = await seedProduct(sql, storeA, 't021-pricey', 'active', true, true);
      await sql.unsafe(`UPDATE "products" SET "min_price_cents" = 500 WHERE "id" = $1;`, [cheap]);
      await sql.unsafe(`UPDATE "products" SET "min_price_cents" = 5000 WHERE "id" = $1;`, [pricey]);

      const asc = await listChannelProducts({ channel: 'marketplace', sort: 'price_asc' }, sql);
      expect(asc.items.map((p) => p.slug)).toEqual(['t021-cheap', 't021-pricey']);
      const desc = await listChannelProducts({ channel: 'marketplace', sort: 'price_desc' }, sql);
      expect(desc.items.map((p) => p.slug)).toEqual(['t021-pricey', 't021-cheap']);
      const band = await listChannelProducts(
        { channel: 'marketplace', minPriceCents: 400, maxPriceCents: 1000 },
        sql,
      );
      expect(band.items.map((p) => p.slug)).toEqual(['t021-cheap']);
      const capped = await listChannelProducts({ channel: 'marketplace', limit: 1 }, sql);
      expect(capped.items).toHaveLength(1);
    } finally {
      await cleanup(sql);
      await sql.end();
    }
  });
});
