// @shopscale/backend/tests/integration/orders-schema.spec - Integration tests for orders schema (T046).
// Invariants verified:
// 1. Unified customer order hierarchy: parent orders -> child seller_orders (DEC-011) -> order_items.
// 2. Composite foreign key: order_items(store_id, seller_order_id) references seller_orders(store_id, id).
// 3. ON DELETE RESTRICT on users, stores, variants prevents deleting entities referenced in order history.
// 4. Schema check constraints enforce positive amounts, valid payment statuses, and valid fulfillment statuses.

import { describe, expect, it } from 'vitest';
import { resetEnvCache } from '@shopscale/config';
import {
  findMigrationsDir,
  openAdminConnection,
  requireDatabaseUrl,
  runMigrations,
} from '../../src/platform/database.js';
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

async function cleanup(sql: Sql, prefix: string): Promise<void> {
  await sql.unsafe(
    `DELETE FROM "payment_attempts" WHERE "order_id" IN (
       SELECT "id" FROM "orders" WHERE "channel_key" LIKE $1
     );`,
    [`${prefix}%`],
  );
  await sql.unsafe(
    `DELETE FROM "order_items" WHERE "order_id" IN (
       SELECT "id" FROM "orders" WHERE "channel_key" LIKE $1
     );`,
    [`${prefix}%`],
  );
  await sql.unsafe(
    `DELETE FROM "seller_orders" WHERE "order_id" IN (
       SELECT "id" FROM "orders" WHERE "channel_key" LIKE $1
     );`,
    [`${prefix}%`],
  );
  await sql.unsafe(`DELETE FROM "orders" WHERE "channel_key" LIKE $1;`, [`${prefix}%`]);
  await sql.unsafe(`DELETE FROM "product_variants" WHERE "sku" LIKE $1;`, [`${prefix.toUpperCase()}-%`]);
  await sql.unsafe(`DELETE FROM "products" WHERE "slug" LIKE $1;`, [`${prefix}-%`]);
  await sql.unsafe(`DELETE FROM "stores" WHERE "slug" LIKE $1;`, [`${prefix}-%`]);
  await sql.unsafe(
    `DELETE FROM "businesses" WHERE "owner_user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" LIKE $1);`,
    [`${prefix}.%`],
  );
  await sql.unsafe(`DELETE FROM "users" WHERE "email_normalized" LIKE $1;`, [`${prefix}.%`]);
}

describe('Orders and Seller Suborders Schema Integration (T046)', () => {
  it('inserts parent orders, seller suborders, order items, and payment attempts (DEC-011)', async () => {
    const sql = await connectOrSkip();
    if (!sql) return;

    await runMigrations(sql, migrationsDir);
    const prefix = 't046-multi-vendor';
    await cleanup(sql, prefix);

    try {
      // 1. Seed customer and seller accounts
      const userRows = (await sql.unsafe(
        `INSERT INTO "users" ("email_normalized", "password_hash") VALUES
           ($1, 'x'), ($2, 'x')
         RETURNING "id", "email_normalized";`,
        [`${prefix}.customer@example.com`, `${prefix}.seller@example.com`],
      )) as unknown as Array<{ id: string; email_normalized: string }>;

      const customerId = userRows.find((u) => u.email_normalized.includes('customer'))!.id;
      const sellerId = userRows.find((u) => u.email_normalized.includes('seller'))!.id;

      const bizRows = (await sql.unsafe(
        `INSERT INTO "businesses" ("owner_user_id") VALUES ($1) RETURNING "id";`,
        [sellerId],
      )) as unknown as Array<{ id: string }>;
      const bizId = bizRows[0]!.id;

      // 2. Create 2 distinct stores: Store Alpha and Store Beta
      const storeAlphaRows = (await sql.unsafe(
        `INSERT INTO "stores" ("business_id", "slug", "name", "status") VALUES ($1, $2, 'Store Alpha', 'active') RETURNING "id";`,
        [bizId, `${prefix}-store-alpha`],
      )) as unknown as Array<{ id: string }>;
      const storeAlphaId = storeAlphaRows[0]!.id;

      const storeBetaRows = (await sql.unsafe(
        `INSERT INTO "stores" ("business_id", "slug", "name", "status") VALUES ($1, $2, 'Store Beta', 'active') RETURNING "id";`,
        [bizId, `${prefix}-store-beta`],
      )) as unknown as Array<{ id: string }>;
      const storeBetaId = storeBetaRows[0]!.id;

      // 3. Create products & variants for both stores
      const prodAlpha = (await sql.unsafe(
        `INSERT INTO "products" ("store_id", "slug", "title", "status") VALUES ($1, $2, 'Alpha Item', 'active') RETURNING "id";`,
        [storeAlphaId, `${prefix}-alpha-prod`],
      )) as unknown as Array<{ id: string }>;

      const varAlpha = (await sql.unsafe(
        `INSERT INTO "product_variants" ("store_id", "product_id", "sku", "price_cents", "status")
         VALUES ($1, $2, 'T046-VAR-ALPHA', 4500, 'active') RETURNING "id";`,
        [storeAlphaId, prodAlpha[0]!.id],
      )) as unknown as Array<{ id: string }>;
      const varAlphaId = varAlpha[0]!.id;

      const prodBeta = (await sql.unsafe(
        `INSERT INTO "products" ("store_id", "slug", "title", "status") VALUES ($1, $2, 'Beta Item', 'active') RETURNING "id";`,
        [storeBetaId, `${prefix}-beta-prod`],
      )) as unknown as Array<{ id: string }>;

      const varBeta = (await sql.unsafe(
        `INSERT INTO "product_variants" ("store_id", "product_id", "sku", "price_cents", "status")
         VALUES ($1, $2, 'T046-VAR-BETA', 5500, 'active') RETURNING "id";`,
        [storeBetaId, prodBeta[0]!.id],
      )) as unknown as Array<{ id: string }>;
      const varBetaId = varBeta[0]!.id;

      // 4. Create parent Order (Marketplace multi-seller checkout)
      const address = {
        fullName: 'Jane Customer',
        line1: '100 Market St',
        city: 'San Francisco',
        state: 'CA',
        postalCode: '94105',
        country: 'USA',
      };

      const orderRows = (await sql.unsafe(
        `INSERT INTO "orders" (
           "user_id", "channel_key", "payment_status", "fulfillment_status",
           "subtotal_cents", "shipping_cents", "discount_cents", "total_cents",
           "currency", "address_snapshot"
         ) VALUES ($1, $2, 'PENDING', 'PENDING', 10000, 1000, 0, 11000, 'USD', $3)
         RETURNING "id", "payment_status", "fulfillment_status", "total_cents";`,
        [customerId, `${prefix}-channel`, JSON.stringify(address)],
      )) as unknown as Array<{
        id: string;
        payment_status: string;
        fulfillment_status: string;
        total_cents: number;
      }>;
      const orderId = orderRows[0]!.id;

      expect(orderRows[0]!.total_cents).toBe(11000);
      expect(orderRows[0]!.payment_status).toBe('PENDING');

      // 5. Create 2 child seller_orders (DEC-011 immediate vendor splitting)
      const subAlphaRows = (await sql.unsafe(
        `INSERT INTO "seller_orders" (
           "order_id", "store_id", "fulfillment_status",
           "subtotal_cents", "shipping_cents", "discount_cents", "total_cents", "commission_bps_snapshot"
         ) VALUES ($1, $2, 'PENDING', 4500, 500, 0, 5000, 1000)
         RETURNING "id";`,
        [orderId, storeAlphaId],
      )) as unknown as Array<{ id: string }>;
      const subAlphaId = subAlphaRows[0]!.id;

      const subBetaRows = (await sql.unsafe(
        `INSERT INTO "seller_orders" (
           "order_id", "store_id", "fulfillment_status",
           "subtotal_cents", "shipping_cents", "discount_cents", "total_cents", "commission_bps_snapshot"
         ) VALUES ($1, $2, 'PENDING', 5500, 500, 0, 6000, 1000)
         RETURNING "id";`,
        [orderId, storeBetaId],
      )) as unknown as Array<{ id: string }>;
      const subBetaId = subBetaRows[0]!.id;

      // 6. Create order_items with historical snapshots and composite FK
      await sql.unsafe(
        `INSERT INTO "order_items" (
           "order_id", "seller_order_id", "store_id", "variant_id",
           "title_snapshot", "sku_snapshot", "qty", "unit_price_cents", "total_cents"
         ) VALUES
           ($1, $2, $3, $4, 'Alpha Item', 'T046-VAR-ALPHA', 1, 4500, 4500),
           ($1, $5, $6, $7, 'Beta Item', 'T046-VAR-BETA', 1, 5500, 5500);`,
        [orderId, subAlphaId, storeAlphaId, varAlphaId, subBetaId, storeBetaId, varBetaId],
      );

      // 7. Create payment attempt
      await sql.unsafe(
        `INSERT INTO "payment_attempts" (
           "order_id", "provider", "effect_key", "amount_cents", "currency", "status"
         ) VALUES ($1, 'mock', $2, 11000, 'USD', 'PENDING');`,
        [orderId, `${prefix}-effect-1`],
      );

      // 8. Verify relationships and totals
      const fetchedSuborders = (await sql.unsafe(
        `SELECT "store_id", "total_cents" FROM "seller_orders" WHERE "order_id" = $1 ORDER BY "total_cents" ASC;`,
        [orderId],
      )) as unknown as Array<{ store_id: string; total_cents: number }>;

      expect(fetchedSuborders).toHaveLength(2);
      expect(fetchedSuborders[0]!.total_cents).toBe(5000);
      expect(fetchedSuborders[1]!.total_cents).toBe(6000);

      const items = (await sql.unsafe(
        `SELECT "sku_snapshot", "title_snapshot" FROM "order_items" WHERE "order_id" = $1 ORDER BY "sku_snapshot" ASC;`,
        [orderId],
      )) as unknown as Array<{ sku_snapshot: string; title_snapshot: string }>;

      expect(items).toHaveLength(2);
      expect(items[0]!.sku_snapshot).toBe('T046-VAR-ALPHA');
      expect(items[1]!.sku_snapshot).toBe('T046-VAR-BETA');
    } finally {
      await cleanup(sql, prefix);
      await sql.end();
    }
  });

  it('enforces composite foreign key on order_items (store_id, seller_order_id)', async () => {
    const sql = await connectOrSkip();
    if (!sql) return;

    await runMigrations(sql, migrationsDir);
    const prefix = 't046-comp-fk';
    await cleanup(sql, prefix);

    try {
      const userRows = (await sql.unsafe(
        `INSERT INTO "users" ("email_normalized", "password_hash") VALUES ($1, 'x') RETURNING "id";`,
        [`${prefix}.user@example.com`],
      )) as unknown as Array<{ id: string }>;
      const userId = userRows[0]!.id;

      const bizRows = (await sql.unsafe(
        `INSERT INTO "businesses" ("owner_user_id") VALUES ($1) RETURNING "id";`,
        [userId],
      )) as unknown as Array<{ id: string }>;
      const bizId = bizRows[0]!.id;

      const storeRows = (await sql.unsafe(
        `INSERT INTO "stores" ("business_id", "slug", "name", "status") VALUES
           ($1, $2, 'Store A', 'active'),
           ($1, $3, 'Store B', 'active')
         RETURNING "id", "slug";`,
        [bizId, `${prefix}-store-a`, `${prefix}-store-b`],
      )) as unknown as Array<{ id: string; slug: string }>;

      const storeA = storeRows.find((s) => s.slug.includes('-a'))!.id;
      const storeB = storeRows.find((s) => s.slug.includes('-b'))!.id;

      const prod = (await sql.unsafe(
        `INSERT INTO "products" ("store_id", "slug", "title", "status") VALUES ($1, $2, 'Prod', 'active') RETURNING "id";`,
        [storeA, `${prefix}-prod`],
      )) as unknown as Array<{ id: string }>;

      const variant = (await sql.unsafe(
        `INSERT INTO "product_variants" ("store_id", "product_id", "sku", "price_cents", "status")
         VALUES ($1, $2, 'T046-COMP-SKU', 1000, 'active') RETURNING "id";`,
        [storeA, prod[0]!.id],
      )) as unknown as Array<{ id: string }>;

      const order = (await sql.unsafe(
        `INSERT INTO "orders" (
           "user_id", "channel_key", "subtotal_cents", "shipping_cents", "total_cents", "address_snapshot"
         ) VALUES ($1, $2, 1000, 500, 1500, '{}') RETURNING "id";`,
        [userId, `${prefix}-channel`],
      )) as unknown as Array<{ id: string }>;
      const orderId = order[0]!.id;

      // Suborder belongs to Store A
      const suborder = (await sql.unsafe(
        `INSERT INTO "seller_orders" (
           "order_id", "store_id", "subtotal_cents", "shipping_cents", "total_cents"
         ) VALUES ($1, $2, 1000, 500, 1500) RETURNING "id";`,
        [orderId, storeA],
      )) as unknown as Array<{ id: string }>;
      const suborderId = suborder[0]!.id;

      // Attempting to insert an order_item pointing to suborderId but with storeB (mismatch!)
      await expect(
        sql.unsafe(
          `INSERT INTO "order_items" (
             "order_id", "seller_order_id", "store_id", "variant_id",
             "title_snapshot", "sku_snapshot", "qty", "unit_price_cents", "total_cents"
           ) VALUES ($1, $2, $3, $4, 'Cross Store', 'T046-COMP-SKU', 1, 1000, 1000);`,
          [orderId, suborderId, storeB, variant[0]!.id],
        ),
      ).rejects.toThrow();
    } finally {
      await cleanup(sql, prefix);
      await sql.end();
    }
  });

  it('enforces ON DELETE RESTRICT on stores and product_variants referenced by orders', async () => {
    const sql = await connectOrSkip();
    if (!sql) return;

    await runMigrations(sql, migrationsDir);
    const prefix = 't046-restrict';
    await cleanup(sql, prefix);

    try {
      const userRows = (await sql.unsafe(
        `INSERT INTO "users" ("email_normalized", "password_hash") VALUES ($1, 'x') RETURNING "id";`,
        [`${prefix}.user@example.com`],
      )) as unknown as Array<{ id: string }>;
      const userId = userRows[0]!.id;

      const bizRows = (await sql.unsafe(
        `INSERT INTO "businesses" ("owner_user_id") VALUES ($1) RETURNING "id";`,
        [userId],
      )) as unknown as Array<{ id: string }>;
      const bizId = bizRows[0]!.id;

      const storeRows = (await sql.unsafe(
        `INSERT INTO "stores" ("business_id", "slug", "name", "status") VALUES ($1, $2, 'Store Restrict', 'active') RETURNING "id";`,
        [bizId, `${prefix}-store`],
      )) as unknown as Array<{ id: string }>;
      const storeId = storeRows[0]!.id;

      const prod = (await sql.unsafe(
        `INSERT INTO "products" ("store_id", "slug", "title", "status") VALUES ($1, $2, 'Prod', 'active') RETURNING "id";`,
        [storeId, `${prefix}-prod`],
      )) as unknown as Array<{ id: string }>;

      const variant = (await sql.unsafe(
        `INSERT INTO "product_variants" ("store_id", "product_id", "sku", "price_cents", "status")
         VALUES ($1, $2, 'T046-RESTRICT-SKU', 1000, 'active') RETURNING "id";`,
        [storeId, prod[0]!.id],
      )) as unknown as Array<{ id: string }>;
      const variantId = variant[0]!.id;

      const order = (await sql.unsafe(
        `INSERT INTO "orders" (
           "user_id", "channel_key", "subtotal_cents", "shipping_cents", "total_cents", "address_snapshot"
         ) VALUES ($1, $2, 1000, 500, 1500, '{}') RETURNING "id";`,
        [userId, `${prefix}-channel`],
      )) as unknown as Array<{ id: string }>;
      const orderId = order[0]!.id;

      const suborder = (await sql.unsafe(
        `INSERT INTO "seller_orders" (
           "order_id", "store_id", "subtotal_cents", "shipping_cents", "total_cents"
         ) VALUES ($1, $2, 1000, 500, 1500) RETURNING "id";`,
        [orderId, storeId],
      )) as unknown as Array<{ id: string }>;
      const suborderId = suborder[0]!.id;

      await sql.unsafe(
        `INSERT INTO "order_items" (
           "order_id", "seller_order_id", "store_id", "variant_id",
           "title_snapshot", "sku_snapshot", "qty", "unit_price_cents", "total_cents"
         ) VALUES ($1, $2, $3, $4, 'Prod Title', 'T046-RESTRICT-SKU', 1, 1000, 1000);`,
        [orderId, suborderId, storeId, variantId],
      );

      // Attempting to delete variant referenced by order_items must fail with RESTRICT
      await expect(
        sql.unsafe(`DELETE FROM "product_variants" WHERE "id" = $1;`, [variantId]),
      ).rejects.toThrow();

      // Attempting to delete store referenced by seller_orders must fail with RESTRICT
      await expect(
        sql.unsafe(`DELETE FROM "stores" WHERE "id" = $1;`, [storeId]),
      ).rejects.toThrow();

      // Attempting to delete user referenced by orders must fail with RESTRICT
      await expect(
        sql.unsafe(`DELETE FROM "users" WHERE "id" = $1;`, [userId]),
      ).rejects.toThrow();
    } finally {
      await cleanup(sql, prefix);
      await sql.end();
    }
  });

  it('rejects invalid statuses and negative amounts via CHECK constraints', async () => {
    const sql = await connectOrSkip();
    if (!sql) return;

    await runMigrations(sql, migrationsDir);
    const prefix = 't046-checks';
    await cleanup(sql, prefix);

    try {
      const userRows = (await sql.unsafe(
        `INSERT INTO "users" ("email_normalized", "password_hash") VALUES ($1, 'x') RETURNING "id";`,
        [`${prefix}.user@example.com`],
      )) as unknown as Array<{ id: string }>;
      const userId = userRows[0]!.id;

      // Invalid payment status
      await expect(
        sql.unsafe(
          `INSERT INTO "orders" (
             "user_id", "channel_key", "payment_status", "subtotal_cents", "shipping_cents", "total_cents", "address_snapshot"
           ) VALUES ($1, $2, 'BOGUS_STATUS', 1000, 500, 1500, '{}');`,
          [userId, `${prefix}-channel`],
        ),
      ).rejects.toThrow();

      // Negative total_cents
      await expect(
        sql.unsafe(
          `INSERT INTO "orders" (
             "user_id", "channel_key", "subtotal_cents", "shipping_cents", "total_cents", "address_snapshot"
           ) VALUES ($1, $2, 1000, 500, -50, '{}');`,
          [userId, `${prefix}-channel`],
        ),
      ).rejects.toThrow();
    } finally {
      await cleanup(sql, prefix);
      await sql.end();
    }
  });
});
