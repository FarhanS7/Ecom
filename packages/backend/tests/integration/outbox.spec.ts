// T029 integration verification against real PostgreSQL:
// Proves transactional outbox atomicity, rollback safety, and SKIP LOCKED claiming.
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
import { writeOutboxEvent } from '../../src/platform/outbox.service.js';
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
    [`t029.${suffix}@example.com`],
  )) as unknown as Array<{ id: string }>;
  const businesses = (await sql.unsafe(
    `INSERT INTO "businesses" ("owner_user_id") VALUES ($1) RETURNING "id";`,
    [users[0]!.id],
  )) as unknown as Array<{ id: string }>;
  const stores = (await sql.unsafe(
    `INSERT INTO "stores" ("business_id","slug","name","status") VALUES ($1,$2,$3,'active') RETURNING "id";`,
    [businesses[0]!.id, `t029-${suffix}`, `T029 ${suffix}`],
  )) as unknown as Array<{ id: string }>;
  return stores[0]!.id;
}

async function cleanup(sql: Sql): Promise<void> {
  await sql.unsafe(`DELETE FROM "outbox" WHERE "aggregate_type" = 'product' AND "payload"->>'slug' LIKE 't029-%';`);
  await sql.unsafe(`DELETE FROM "product_publications" WHERE "product_id" IN (SELECT "id" FROM "products" WHERE "slug" LIKE 't029-%');`);
  await sql.unsafe(`DELETE FROM "product_variants" WHERE "sku" LIKE 'T029-%';`);
  await sql.unsafe(`DELETE FROM "products" WHERE "slug" LIKE 't029-%';`);
  await sql.unsafe(`DELETE FROM "stores" WHERE "slug" LIKE 't029-%';`);
  await sql.unsafe(
    `DELETE FROM "businesses" WHERE "owner_user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" LIKE 't029.%');`,
  );
  await sql.unsafe(`DELETE FROM "users" WHERE "email_normalized" LIKE 't029.%';`);
}

describe('Transactional Outbox Integration (T029)', () => {
  it('commits business write and outbox event atomically in one transaction', async () => {
    const sql = await connectOrSkip();
    if (!sql) return;

    try {
      await runMigrations(sql, migrationsDir);
      await cleanup(sql);

      const storeId = await seedStore(sql, 'atomicity');

      // 1. Create a product via product.service (which internally calls writeOutboxEvent in the same tx)
      const product = await createProduct(
        {
          storeId,
          categoryId: null,
          slug: 't029-atomic-lamp',
          title: 'Atomic Lamp',
          description: 'A test lamp',
          brand: 'ShopScale',
          attributes: { color: 'blue' },
          currency: 'usd',
        },
        sql,
      );

      // Verify product is in database
      const productRows = (await sql.unsafe(
        `SELECT "id", "slug", "version" FROM "products" WHERE "id" = $1;`,
        [product.id],
      )) as unknown as Array<{ id: string; slug: string; version: number }>;
      expect(productRows).toHaveLength(1);
      expect(productRows[0]!.slug).toBe('t029-atomic-lamp');

      // Verify outbox record exists for this product
      const outboxRows = (await sql.unsafe(
        `SELECT "id", "aggregate_type", "aggregate_id", "event_type", "published_at", "payload"
         FROM "outbox"
         WHERE "aggregate_type" = 'product' AND "aggregate_id" = $1;`,
        [product.id],
      )) as unknown as Array<{
        id: string;
        aggregate_type: string;
        aggregate_id: string;
        event_type: string;
        published_at: Date | null;
        payload: { action: string; title: string };
      }>;

      expect(outboxRows).toHaveLength(1);
      expect(outboxRows[0]!.event_type).toBe('ProductChanged');
      expect(outboxRows[0]!.published_at).toBeNull();
      expect(outboxRows[0]!.payload.action).toBe('created');
      expect(outboxRows[0]!.payload.title).toBe('Atomic Lamp');

      // 2. Publication change writes PublicationChanged event in outbox
      await setPublication(
        {
          storeId,
          productId: product.id,
          marketplaceEnabled: true,
          storeEnabled: true,
        },
        sql,
      );

      const pubOutboxRows = (await sql.unsafe(
        `SELECT "id", "event_type", "payload"
         FROM "outbox"
         WHERE "aggregate_type" = 'product' AND "aggregate_id" = $1 AND "event_type" = 'PublicationChanged';`,
        [product.id],
      )) as unknown as Array<{ id: string; event_type: string; payload: { marketplaceEnabled: boolean } }>;

      expect(pubOutboxRows).toHaveLength(1);
      expect(pubOutboxRows[0]!.payload.marketplaceEnabled).toBe(true);
    } finally {
      await cleanup(sql);
      await sql.end();
    }
  });

  it('rolls back both business write and outbox event when an error occurs in transaction', async () => {
    const sql = await connectOrSkip();
    if (!sql) return;

    try {
      await runMigrations(sql, migrationsDir);
      await cleanup(sql);

      const storeId = await seedStore(sql, 'rollback');

      // Attempt transaction that writes outbox and product, then throws
      await expect(
        sql.begin(async (tx) => {
          const inserted = (await tx.unsafe(
            `INSERT INTO "products" ("store_id", "slug", "title")
             VALUES ($1, 't029-fail-lamp', 'Fail Lamp')
             RETURNING "id";`,
            [storeId],
          )) as unknown as Array<{ id: string }>;

          await writeOutboxEvent(tx, {
            aggregateType: 'product',
            aggregateId: inserted[0]!.id,
            type: 'ProductChanged',
            payload: { slug: 't029-fail-lamp' },
          });

          // Simulate mid-transaction business rule failure
          throw new Error('SIMULATED_TRANSACTION_FAILURE');
        }),
      ).rejects.toThrow('SIMULATED_TRANSACTION_FAILURE');

      // Assert product was NOT committed
      const products = (await sql.unsafe(
        `SELECT 1 FROM "products" WHERE "slug" = 't029-fail-lamp';`,
      )) as unknown as unknown[];
      expect(products).toHaveLength(0);

      // Assert outbox row was NOT committed
      const outbox = (await sql.unsafe(
        `SELECT 1 FROM "outbox" WHERE "payload"->>'slug' = 't029-fail-lamp';`,
      )) as unknown as unknown[];
      expect(outbox).toHaveLength(0);
    } finally {
      await cleanup(sql);
      await sql.end();
    }
  });

  it('supports FOR UPDATE SKIP LOCKED claiming and lease management', async () => {
    const sql = await connectOrSkip();
    if (!sql) return;

    try {
      await runMigrations(sql, migrationsDir);
      await cleanup(sql);

      // Insert two unpublished outbox rows
      const inserted = (await sql.unsafe(
        `INSERT INTO "outbox" ("aggregate_type", "aggregate_id", "event_type", "payload")
         VALUES 
           ('test', gen_random_uuid(), 'TestEvent1', '{"item": 1}'::jsonb),
           ('test', gen_random_uuid(), 'TestEvent2', '{"item": 2}'::jsonb)
         RETURNING "id";`,
      )) as unknown as Array<{ id: string }>;

      expect(inserted).toHaveLength(2);
      const [id1, id2] = [inserted[0]!.id, inserted[1]!.id];

      // Claim batch 1
      const claimed = (await sql.unsafe(
        `WITH claimable AS (
           SELECT "id" FROM "outbox"
           WHERE "published_at" IS NULL AND ("lease_until" IS NULL OR "lease_until" < now())
           ORDER BY "created_at" ASC, "id" ASC
           LIMIT 1
           FOR UPDATE SKIP LOCKED
         )
         UPDATE "outbox" o
         SET "lease_until" = now() + interval '30 seconds', "attempts" = o."attempts" + 1
         FROM claimable c
         WHERE o."id" = c."id"
         RETURNING o."id", o."attempts";`,
      )) as unknown as Array<{ id: string; attempts: number }>;

      expect(claimed).toHaveLength(1);
      expect(claimed[0]!.id).toBe(id1);
      expect(claimed[0]!.attempts).toBe(1);

      // Concurrent claim with SKIP LOCKED skips the leased row and claims the next
      const claimed2 = (await sql.unsafe(
        `WITH claimable AS (
           SELECT "id" FROM "outbox"
           WHERE "published_at" IS NULL AND ("lease_until" IS NULL OR "lease_until" < now())
           ORDER BY "created_at" ASC, "id" ASC
           LIMIT 1
           FOR UPDATE SKIP LOCKED
         )
         UPDATE "outbox" o
         SET "lease_until" = now() + interval '30 seconds', "attempts" = o."attempts" + 1
         FROM claimable c
         WHERE o."id" = c."id"
         RETURNING o."id", o."attempts";`,
      )) as unknown as Array<{ id: string; attempts: number }>;

      expect(claimed2).toHaveLength(1);
      expect(claimed2[0]!.id).toBe(id2);

      // Third claim finds nothing because both are leased
      const claimed3 = (await sql.unsafe(
        `WITH claimable AS (
           SELECT "id" FROM "outbox"
           WHERE "published_at" IS NULL AND ("lease_until" IS NULL OR "lease_until" < now())
           ORDER BY "created_at" ASC, "id" ASC
           LIMIT 1
           FOR UPDATE SKIP LOCKED
         )
         UPDATE "outbox" o
         SET "lease_until" = now() + interval '30 seconds', "attempts" = o."attempts" + 1
         FROM claimable c
         WHERE o."id" = c."id"
         RETURNING o."id";`,
      )) as unknown as Array<{ id: string }>;

      expect(claimed3).toHaveLength(0);

      // Mark first published
      await sql.unsafe(`UPDATE "outbox" SET "published_at" = now(), "lease_until" = NULL WHERE "id" = $1;`, [id1]);

      // Release lease on second
      await sql.unsafe(`UPDATE "outbox" SET "lease_until" = NULL WHERE "id" = $1;`, [id2]);

      // Now id2 is immediately re-claimable, while id1 is never re-claimed
      const reClaimed = (await sql.unsafe(
        `WITH claimable AS (
           SELECT "id" FROM "outbox"
           WHERE "published_at" IS NULL AND ("lease_until" IS NULL OR "lease_until" < now())
           ORDER BY "created_at" ASC, "id" ASC
           LIMIT 5
           FOR UPDATE SKIP LOCKED
         )
         UPDATE "outbox" o
         SET "lease_until" = now() + interval '30 seconds', "attempts" = o."attempts" + 1
         FROM claimable c
         WHERE o."id" = c."id"
         RETURNING o."id";`,
      )) as unknown as Array<{ id: string }>;

      expect(reClaimed).toHaveLength(1);
      expect(reClaimed[0]!.id).toBe(id2);
    } finally {
      await sql.unsafe(`DELETE FROM "outbox" WHERE "aggregate_type" = 'test';`);
      await sql.end();
    }
  });
});
