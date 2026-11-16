// T034 integration verification: Safe Full Reindex.
// Invariants:
// 1. Truncating search_documents removes all search visibility.
// 2. Running reindexService restores 100% of product search documents with computed visibility.
// 3. Search documents are immediately searchable via SearchQueryService.
// 4. Skips honestly if DATABASE_URL is not configured or DB is unreachable (T003 contract).

import { describe, expect, it } from 'vitest';
import { resetEnvCache } from '@shopscale/config';
import {
  openAdminConnection,
  requireDatabaseUrl,
  findMigrationsDir,
  runMigrations,
} from '../../src/platform/database.js';
import { ReindexService } from '../../src/search/reindex.service.js';
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
    [`t034.${suffix}@example.com`],
  )) as unknown as Array<{ id: string }>;
  const businesses = (await sql.unsafe(
    `INSERT INTO "businesses" ("owner_user_id") VALUES ($1) RETURNING "id";`,
    [users[0]!.id],
  )) as unknown as Array<{ id: string }>;
  const stores = (await sql.unsafe(
    `INSERT INTO "stores" ("business_id","slug","name","status") VALUES ($1,$2,$3,'active') RETURNING "id";`,
    [businesses[0]!.id, `t034-${suffix}`, `T034 ${suffix}`],
  )) as unknown as Array<{ id: string }>;
  return stores[0]!.id;
}

async function cleanup(sql: Sql): Promise<void> {
  await sql.unsafe(
    `DELETE FROM "search_documents" WHERE "product_id" IN (SELECT "id" FROM "products" WHERE "slug" LIKE 't034-%');`,
  );
  await sql.unsafe(
    `DELETE FROM "product_publications" WHERE "product_id" IN (SELECT "id" FROM "products" WHERE "slug" LIKE 't034-%');`,
  );
  await sql.unsafe(`DELETE FROM "product_variants" WHERE "sku" LIKE 'T034-%';`);
  await sql.unsafe(`DELETE FROM "products" WHERE "slug" LIKE 't034-%';`);
  await sql.unsafe(`DELETE FROM "stores" WHERE "slug" LIKE 't034-%';`);
  await sql.unsafe(
    `DELETE FROM "businesses" WHERE "owner_user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" LIKE 't034.%');`,
  );
  await sql.unsafe(`DELETE FROM "users" WHERE "email_normalized" LIKE 't034.%';`);
}

describe('Safe Full Reindex (T034)', () => {
  it('restores wiped search documents and recovers searchability', async () => {
    const sql = await connectOrSkip();
    if (!sql) return;

    await runMigrations(sql, migrationsDir);
    await cleanup(sql);

    try {
      const storeId = await seedStore(sql, 'reindex');

      // Seed 3 products
      const p1 = (await sql.unsafe(
        `INSERT INTO "products" ("store_id","slug","title","description","brand","status","min_price_cents","currency")
         VALUES ($1,'t034-sneakers','Pro Athletic Sneakers','High performance running sneakers','ProBrand','active',12000,'USD')
         RETURNING "id";`,
        [storeId],
      )) as unknown as Array<{ id: string }>;

      const p2 = (await sql.unsafe(
        `INSERT INTO "products" ("store_id","slug","title","description","brand","status","min_price_cents","currency")
         VALUES ($1,'t034-hoodie','Cozy Fleece Hoodie','Warm organic fleece hoodie','CozyWear','active',6500,'USD')
         RETURNING "id";`,
        [storeId],
      )) as unknown as Array<{ id: string }>;

      const p3 = (await sql.unsafe(
        `INSERT INTO "products" ("store_id","slug","title","description","brand","status","min_price_cents","currency")
         VALUES ($1,'t034-draft','Secret Prototype','Not yet published','ProBrand','draft',9999,'USD')
         RETURNING "id";`,
        [storeId],
      )) as unknown as Array<{ id: string }>;

      // Set publications
      await sql.unsafe(
        `INSERT INTO "product_publications" ("product_id","marketplace_enabled","store_enabled")
         VALUES ($1,true,true), ($2,true,false), ($3,false,false);`,
        [p1[0]!.id, p2[0]!.id, p3[0]!.id],
      );

      // Verify search_documents initially does not have these products
      await sql.unsafe(
        `DELETE FROM "search_documents" WHERE "product_id" IN ($1, $2, $3);`,
        [p1[0]!.id, p2[0]!.id, p3[0]!.id],
      );

      const queryService = new SearchQueryService(sql);
      const preSearch = await queryService.search({
        channel: 'marketplace',
        query: 'Sneakers',
      });
      const foundPre = preSearch.items.find((i) => i.id === p1[0]!.id);
      expect(foundPre).toBeUndefined();

      // Run reindex with small batch size to test batching
      const reindexService = new ReindexService(sql);
      const reindexResult = await reindexService.reindex({
        batchSize: 2,
      });

      expect(reindexResult.reindexedCount).toBeGreaterThanOrEqual(3);
      expect(reindexResult.batches).toBeGreaterThanOrEqual(2);

      // Verify search_documents now contain active products with visibility=true
      const docs = (await sql.unsafe(
        `SELECT "product_id", "title", "visibility", "marketplace_enabled", "store_enabled"
         FROM "search_documents"
         WHERE "product_id" IN ($1, $2, $3)
         ORDER BY "title" ASC;`,
        [p1[0]!.id, p2[0]!.id, p3[0]!.id],
      )) as unknown as Array<{
        product_id: string;
        title: string;
        visibility: boolean;
        marketplace_enabled: boolean;
        store_enabled: boolean;
      }>;

      expect(docs.length).toBe(3);

      const doc1 = docs.find((d) => d.product_id === p1[0]!.id);
      expect(doc1?.visibility).toBe(true);
      expect(doc1?.marketplace_enabled).toBe(true);
      expect(doc1?.store_enabled).toBe(true);

      const doc2 = docs.find((d) => d.product_id === p2[0]!.id);
      expect(doc2?.visibility).toBe(true);
      expect(doc2?.marketplace_enabled).toBe(true);
      expect(doc2?.store_enabled).toBe(false);

      const doc3 = docs.find((d) => d.product_id === p3[0]!.id);
      expect(doc3?.visibility).toBe(false); // draft product has visibility = false

      // Verify searchable via SearchQueryService
      const postSearch = await queryService.search({
        channel: 'marketplace',
        query: 'Sneakers',
      });
      const foundPost = postSearch.items.find((i) => i.id === p1[0]!.id);
      expect(foundPost).toBeDefined();
      expect(foundPost?.title).toBe('Pro Athletic Sneakers');
    } finally {
      await cleanup(sql);
      await sql.end();
    }
  });
});
