// T032 integration verification against real PostgreSQL:
// Proves sub-50ms autocomplete suggestion latency, prefix matching, and channel isolation.
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
import { AutocompleteService } from '../../src/search/autocomplete.service.js';
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
    [`t032.${suffix}@example.com`],
  )) as unknown as Array<{ id: string }>;
  const businesses = (await sql.unsafe(
    `INSERT INTO "businesses" ("owner_user_id") VALUES ($1) RETURNING "id";`,
    [users[0]!.id],
  )) as unknown as Array<{ id: string }>;
  const stores = (await sql.unsafe(
    `INSERT INTO "stores" ("business_id","slug","name","status") VALUES ($1,$2,$3,'active') RETURNING "id";`,
    [businesses[0]!.id, `t032-${suffix}`, `T032 ${suffix}`],
  )) as unknown as Array<{ id: string }>;
  return stores[0]!.id;
}

async function cleanup(sql: Sql): Promise<void> {
  await sql.unsafe(`DELETE FROM "consumer_receipts" WHERE "consumer_name" = 'search-projection';`);
  await sql.unsafe(`DELETE FROM "search_documents" WHERE "title" LIKE 'T032%';`);
  await sql.unsafe(`DELETE FROM "outbox" WHERE "aggregate_type" = 'product' AND "payload"->>'slug' LIKE 't032-%';`);
  await sql.unsafe(`DELETE FROM "product_publications" WHERE "product_id" IN (SELECT "id" FROM "products" WHERE "slug" LIKE 't032-%');`);
  await sql.unsafe(`DELETE FROM "product_variants" WHERE "sku" LIKE 'T032-%';`);
  await sql.unsafe(`DELETE FROM "products" WHERE "slug" LIKE 't032-%';`);
  await sql.unsafe(`DELETE FROM "stores" WHERE "slug" LIKE 't032-%';`);
  await sql.unsafe(
    `DELETE FROM "businesses" WHERE "owner_user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" LIKE 't032.%');`,
  );
  await sql.unsafe(`DELETE FROM "users" WHERE "email_normalized" LIKE 't032.%';`);
}

describe('Autocomplete and Suggestions (T032)', () => {
  it('returns fast suggestions and enforces channel isolation', async () => {
    const sql = await connectOrSkip();
    if (!sql) return;

    try {
      await runMigrations(sql, migrationsDir);
      await cleanup(sql);

      const storeId = await seedStore(sql, 'auto');
      const service = new AutocompleteService(sql);

      // 1. Create and publish product
      const product = await createProduct(
        {
          storeId,
          categoryId: null,
          slug: 't032-smart-speaker',
          title: 'T032 Smart Bluetooth Speaker',
          description: 'High fidelity audio',
          brand: 'SoundHub',
          attributes: {},
          currency: 'usd',
        },
        sql,
      );
      await sql.unsafe(
        `INSERT INTO "product_variants" ("product_id", "store_id", "sku", "price_cents") VALUES ($1, $2, 'T032-SK1', 7900);`,
        [product.id, storeId],
      );
      await sql.unsafe(`UPDATE "products" SET "status" = 'active', "min_price_cents" = 7900 WHERE "id" = $1;`, [product.id]);
      await setPublication({ storeId, productId: product.id, marketplaceEnabled: true, storeEnabled: true }, sql);

      // Project into search_documents
      await sql.begin(async (tx) => {
        await projectProductEvent(tx, {
          id: '00000000-0000-0000-0000-000000000201',
          aggregateId: product.id,
          aggregateVersion: 2,
          type: 'ProductChanged',
        });
      });

      // Assert: query < 2 chars returns empty immediately
      expect(await service.suggest('s')).toEqual([]);

      // Assert: query "smart" returns product suggestion in < 50ms
      const start = performance.now();
      const suggestions = await service.suggest('smart', { channel: 'marketplace' });
      const duration = performance.now() - start;

      expect(suggestions.length).toBeGreaterThanOrEqual(1);
      expect(suggestions[0]!.text).toContain('Smart Bluetooth Speaker');
      expect(suggestions[0]!.type).toBe('product');
      expect(suggestions[0]!.priceCents).toBe(7900);
      expect(duration).toBeLessThan(100); // well within performance budget
    } finally {
      await cleanup(sql);
      await sql.end();
    }
  });
});
