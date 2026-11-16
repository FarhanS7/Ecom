// T030 integration verification against real PostgreSQL:
// Proves projection deduplication, version monotonicity, and out-of-order safety.
// Skips honestly if DATABASE_URL is not configured or DB is unreachable (T003 contract).

import { describe, expect, it } from 'vitest';
import { resetEnvCache } from '@shopscale/config';
import {
  openAdminConnection,
  requireDatabaseUrl,
  findMigrationsDir,
  runMigrations,
} from '../../src/platform/database.js';
import { createProduct } from '../../src/catalog/product.service.js';
import { projectProductEvent } from '../../src/search/projector.js';
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
    [`t030.${suffix}@example.com`],
  )) as unknown as Array<{ id: string }>;
  const businesses = (await sql.unsafe(
    `INSERT INTO "businesses" ("owner_user_id") VALUES ($1) RETURNING "id";`,
    [users[0]!.id],
  )) as unknown as Array<{ id: string }>;
  const stores = (await sql.unsafe(
    `INSERT INTO "stores" ("business_id","slug","name","status") VALUES ($1,$2,$3,'active') RETURNING "id";`,
    [businesses[0]!.id, `t030-${suffix}`, `T030 ${suffix}`],
  )) as unknown as Array<{ id: string }>;
  return stores[0]!.id;
}

async function cleanup(sql: Sql): Promise<void> {
  await sql.unsafe(`DELETE FROM "consumer_receipts" WHERE "consumer_name" = 'search-projection';`);
  await sql.unsafe(`DELETE FROM "search_documents" WHERE "title" LIKE 'T030%';`);
  await sql.unsafe(`DELETE FROM "outbox" WHERE "aggregate_type" = 'product' AND "payload"->>'slug' LIKE 't030-%';`);
  await sql.unsafe(`DELETE FROM "product_publications" WHERE "product_id" IN (SELECT "id" FROM "products" WHERE "slug" LIKE 't030-%');`);
  await sql.unsafe(`DELETE FROM "products" WHERE "slug" LIKE 't030-%';`);
  await sql.unsafe(`DELETE FROM "stores" WHERE "slug" LIKE 't030-%';`);
  await sql.unsafe(
    `DELETE FROM "businesses" WHERE "owner_user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" LIKE 't030.%');`,
  );
  await sql.unsafe(`DELETE FROM "users" WHERE "email_normalized" LIKE 't030.%';`);
}

describe('Idempotent Projection Consumers (T030)', () => {
  it('projects product and records deduplication receipt', async () => {
    const sql = await connectOrSkip();
    if (!sql) return;

    try {
      await runMigrations(sql, migrationsDir);
      await cleanup(sql);

      const storeId = await seedStore(sql, 'project');

      const product = await createProduct(
        {
          storeId,
          categoryId: null,
          slug: 't030-jacket',
          title: 'T030 Winter Jacket',
          description: 'Warm fleece jacket',
          brand: 'Alpine',
          attributes: { size: 'L' },
          currency: 'usd',
        },
        sql,
      );

      const eventId = '00000000-0000-0000-0000-000000000010';

      // Run projection inside transaction
      await sql.begin(async (tx) => {
        const outcome = await projectProductEvent(tx, {
          id: eventId,
          aggregateId: product.id,
          aggregateVersion: product.version,
          type: 'ProductChanged',
        });
        expect(outcome.status).toBe('PROJECTED');
      });

      // Assert consumer_receipts has record
      const receipts = (await sql.unsafe(
        `SELECT 1 FROM "consumer_receipts" WHERE "consumer_name" = 'search-projection' AND "event_id" = $1;`,
        [eventId],
      )) as unknown as unknown[];
      expect(receipts).toHaveLength(1);

      // Assert search_documents has projection row
      const docs = (await sql.unsafe(
        `SELECT "product_id", "title", "source_version", "visibility" FROM "search_documents" WHERE "product_id" = $1;`,
        [product.id],
      )) as unknown as Array<{ product_id: string; title: string; source_version: number; visibility: boolean }>;
      expect(docs).toHaveLength(1);
      expect(docs[0]!.title).toBe('T030 Winter Jacket');
      expect(docs[0]!.source_version).toBe(product.version);
      expect(docs[0]!.visibility).toBe(false); // draft initially

      // Replay identical event: must return DUPLICATE_IGNORED and not fail
      await sql.begin(async (tx) => {
        const outcome = await projectProductEvent(tx, {
          id: eventId,
          aggregateId: product.id,
          aggregateVersion: product.version,
          type: 'ProductChanged',
        });
        expect(outcome.status).toBe('DUPLICATE_IGNORED');
      });
    } finally {
      await cleanup(sql);
      await sql.end();
    }
  });

  it('enforces version monotonicity when out-of-order events arrive (v3 before v2)', async () => {
    const sql = await connectOrSkip();
    if (!sql) return;

    try {
      await runMigrations(sql, migrationsDir);
      await cleanup(sql);

      const storeId = await seedStore(sql, 'out-of-order');

      const product = await createProduct(
        {
          storeId,
          categoryId: null,
          slug: 't030-order-lamp',
          title: 'T030 Monotonic Lamp',
          description: 'A test lamp',
          brand: 'LampCo',
          attributes: {},
          currency: 'usd',
        },
        sql,
      );

      // Artificially bump product version to 3
      await sql.unsafe(`UPDATE "products" SET "version" = 3 WHERE "id" = $1;`, [product.id]);

      const eventV3Id = '00000000-0000-0000-0000-000000000030';
      const eventV2Id = '00000000-0000-0000-0000-000000000020';

      // v3 arrives first
      await sql.begin(async (tx) => {
        const outcome = await projectProductEvent(tx, {
          id: eventV3Id,
          aggregateId: product.id,
          aggregateVersion: 3,
          type: 'ProductChanged',
        });
        expect(outcome.status).toBe('PROJECTED');
      });

      const docsAfterV3 = (await sql.unsafe(
        `SELECT "source_version" FROM "search_documents" WHERE "product_id" = $1;`,
        [product.id],
      )) as unknown as Array<{ source_version: number }>;
      expect(docsAfterV3[0]!.source_version).toBe(3);

      // Delayed v2 arrives later: must be ignored due to monotonicity
      await sql.begin(async (tx) => {
        const outcome = await projectProductEvent(tx, {
          id: eventV2Id,
          aggregateId: product.id,
          aggregateVersion: 2,
          type: 'ProductChanged',
        });
        expect(outcome.status).toBe('STALE_VERSION_IGNORED');
        expect(outcome.currentVersion).toBe(3);
      });

      // Assert search_documents version remains 3
      const docsAfterV2 = (await sql.unsafe(
        `SELECT "source_version" FROM "search_documents" WHERE "product_id" = $1;`,
        [product.id],
      )) as unknown as Array<{ source_version: number }>;
      expect(docsAfterV2[0]!.source_version).toBe(3);
    } finally {
      await cleanup(sql);
      await sql.end();
    }
  });
});
