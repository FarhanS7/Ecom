// T031 integration verification against real PostgreSQL:
// Proves tsvector FTS, pg_trgm typo fallback, channel gating, and facet counts.
// Skips honestly if DATABASE_URL is not configured or DB is unreachable (T003 contract).

import { describe, expect, it } from 'vitest';
import { resetEnvCache } from '@shopscale/config';
import {
  openAdminConnection,
  requireDatabaseUrl,
  findMigrationsDir,
  runMigrations,
} from '../../src/platform/database.js';
import { createProduct, setPublication } from '../../src/catalog/product.service.js';
import { projectProductEvent } from '../../src/search/projector.js';
import { SearchQueryService } from '../../src/search/query.service.js';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = findMigrationsDir(here);

type Sql = Awaited<ReturnType<typeof openAdminConnection>>;

async function connectOrSkip(): Promise<Sql | null> {
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

async function seedStore(sql: Sql, suffix: string): Promise<string> {
  const users = (await sql.unsafe(
    `INSERT INTO "users" ("email_normalized","password_hash") VALUES ($1,'x') RETURNING "id";`,
    [`t031.${suffix}@example.com`],
  )) as unknown as Array<{ id: string }>;
  const businesses = (await sql.unsafe(
    `INSERT INTO "businesses" ("owner_user_id") VALUES ($1) RETURNING "id";`,
    [users[0]!.id],
  )) as unknown as Array<{ id: string }>;
  const stores = (await sql.unsafe(
    `INSERT INTO "stores" ("business_id","slug","name","status") VALUES ($1,$2,$3,'active') RETURNING "id";`,
    [businesses[0]!.id, `t031-${suffix}`, `T031 ${suffix}`],
  )) as unknown as Array<{ id: string }>;
  return stores[0]!.id;
}

async function cleanup(sql: Sql): Promise<void> {
  await sql.unsafe(`DELETE FROM "consumer_receipts" WHERE "consumer_name" = 'search-projection';`);
  await sql.unsafe(`DELETE FROM "search_documents" WHERE "title" LIKE 'T031%';`);
  await sql.unsafe(`DELETE FROM "outbox" WHERE "aggregate_type" = 'product' AND "payload"->>'slug' LIKE 't031-%';`);
  await sql.unsafe(`DELETE FROM "product_publications" WHERE "product_id" IN (SELECT "id" FROM "products" WHERE "slug" LIKE 't031-%');`);
  await sql.unsafe(`DELETE FROM "product_variants" WHERE "sku" LIKE 'T031-%';`);
  await sql.unsafe(`DELETE FROM "products" WHERE "slug" LIKE 't031-%';`);
  await sql.unsafe(`DELETE FROM "stores" WHERE "slug" LIKE 't031-%';`);
  await sql.unsafe(
    `DELETE FROM "businesses" WHERE "owner_user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" LIKE 't031.%');`,
  );
  await sql.unsafe(`DELETE FROM "users" WHERE "email_normalized" LIKE 't031.%';`);
}

describe('Text Search, Typo Fallback and Facets (T031)', () => {
  it('executes FTS queries, falls back on typos, and isolates channels', async () => {
    const sql = await connectOrSkip();
    if (!sql) return;

    try {
      await runMigrations(sql, migrationsDir);
      await cleanup(sql);

      const storeId = await seedStore(sql, 'main');
      const searchService = new SearchQueryService(sql);

      // 1. Create Product A (Marketplace & Store enabled)
      const prodA = await createProduct(
        {
          storeId,
          categoryId: null,
          slug: 't031-headphones',
          title: 'T031 Noise Cancelling Headphones',
          description: 'Premium wireless sound',
          brand: 'SoundMaster',
          attributes: {},
          currency: 'usd',
        },
        sql,
      );
      // Add active variant so it can be active
      await sql.unsafe(
        `INSERT INTO "product_variants" ("product_id", "store_id", "sku", "price_cents") VALUES ($1, $2, 'T031-HP1', 15000);`,
        [prodA.id, storeId],
      );
      await sql.unsafe(`UPDATE "products" SET "status" = 'active', "min_price_cents" = 15000 WHERE "id" = $1;`, [prodA.id]);
      await setPublication({ storeId, productId: prodA.id, marketplaceEnabled: true, storeEnabled: true }, sql);

      // 2. Create Product B (Store-only enabled, NOT marketplace enabled)
      const prodB = await createProduct(
        {
          storeId,
          categoryId: null,
          slug: 't031-store-only-lamp',
          title: 'T031 Exclusive Desk Lamp',
          description: 'Available only in store',
          brand: 'LightCo',
          attributes: {},
          currency: 'usd',
        },
        sql,
      );
      await sql.unsafe(
        `INSERT INTO "product_variants" ("product_id", "store_id", "sku", "price_cents") VALUES ($1, $2, 'T031-LP1', 3000);`,
        [prodB.id, storeId],
      );
      await sql.unsafe(`UPDATE "products" SET "status" = 'active', "min_price_cents" = 3000 WHERE "id" = $1;`, [prodB.id]);
      await setPublication({ storeId, productId: prodB.id, marketplaceEnabled: false, storeEnabled: true }, sql);

      // Project both products into search_documents
      await sql.begin(async (tx) => {
        await projectProductEvent(tx, {
          id: '00000000-0000-0000-0000-000000000101',
          aggregateId: prodA.id,
          aggregateVersion: 2,
          type: 'ProductChanged',
        });
        await projectProductEvent(tx, {
          id: '00000000-0000-0000-0000-000000000102',
          aggregateId: prodB.id,
          aggregateVersion: 2,
          type: 'ProductChanged',
        });
      });

      // Assert 1: Exact full-text search match for "headphones" in marketplace
      const ftsResult = await searchService.search('headphones', { channel: 'marketplace' });
      expect(ftsResult.items.length).toBeGreaterThanOrEqual(1);
      expect(ftsResult.items[0]!.title).toContain('Headphones');
      expect(ftsResult.fallbackUsed).toBe(false);

      // Assert 2: Typo search "hedphone" falls back to trigram matching
      const typoResult = await searchService.search('hedphone', { channel: 'marketplace' });
      expect(typoResult.items.length).toBeGreaterThanOrEqual(1);
      expect(typoResult.items[0]!.title).toContain('Headphones');
      expect(typoResult.fallbackUsed).toBe(true);

      // Assert 3: Channel isolation — Store-only product does NOT appear in marketplace search
      const mktLampResult = await searchService.search('lamp', { channel: 'marketplace' });
      expect(mktLampResult.items).toHaveLength(0);

      // Assert 4: Channel isolation — Store-only product DOES appear when searching that specific store
      const storeLampResult = await searchService.search('lamp', { channel: 'store', storeId });
      expect(storeLampResult.items.length).toBeGreaterThanOrEqual(1);
      expect(storeLampResult.items[0]!.title).toContain('Desk Lamp');

      // Assert 5: Facet counts reflect matching products
      expect(ftsResult.facets.brands.some((b) => b.value === 'SoundMaster')).toBe(true);
      expect(ftsResult.facets.priceRanges.length).toBeGreaterThan(0);

      // Assert 6: Punctuation/injection characters do not throw SQL error
      const injectionResult = await searchService.search("'; DROP TABLE search_documents; -- !@#$%^&*()", {
        channel: 'marketplace',
      });
      expect(injectionResult.items).toBeDefined();
    } finally {
      await cleanup(sql);
      await sql.end();
    }
  });
});
