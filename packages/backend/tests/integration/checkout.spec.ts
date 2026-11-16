// @shopscale/backend/tests/integration/checkout.spec - Integration tests for idempotent checkout creation (T047).
// Invariants verified against real PostgreSQL:
// 1. Single ACID transaction: orders, seller_orders, order_items, stock_reservations, and outbox commit together.
// 2. Immediate vendor suborder splitting (DEC-011): multi-seller basket produces distinct seller_orders.
// 3. Idempotency replay (OR-1, G3): identical Idempotency-Key returns cached response without duplicate stock reservations.
// 4. Key conflict detection: reusing key with modified parameters throws IdempotencyConflictError (409 Conflict).
// 5. Atomic rollback: stock failure on any line item rolls back all reservations, orders, and outbox events (G2).

import { describe, expect, it } from 'vitest';
import { resetEnvCache } from '@shopscale/config';
import {
  findMigrationsDir,
  openAdminConnection,
  requireDatabaseUrl,
  runMigrations,
} from '../../src/platform/database.js';
import { checkoutService } from '../../src/commerce/checkout.service.js';
import { quoteService } from '../../src/commerce/quote.service.js';
import {
  IdempotencyConflictError,
  InsufficientStockError,
} from '../../src/commerce/errors.js';
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
    `DELETE FROM "outbox" WHERE "aggregate_id" IN (
       SELECT "id" FROM "orders" WHERE "channel_key" LIKE $1
     );`,
    [`${prefix}%`],
  );
  await sql.unsafe(
    `DELETE FROM "stock_movements" WHERE "store_id" IN (
       SELECT "id" FROM "stores" WHERE "slug" LIKE $1
     );`,
    [`${prefix}%`],
  );
  await sql.unsafe(
    `DELETE FROM "stock_reservations" WHERE "store_id" IN (
       SELECT "id" FROM "stores" WHERE "slug" LIKE $1
     );`,
    [`${prefix}%`],
  );
  await sql.unsafe(
    `DELETE FROM "inventory" WHERE "store_id" IN (
       SELECT "id" FROM "stores" WHERE "slug" LIKE $1
     );`,
    [`${prefix}%`],
  );
  await sql.unsafe(
    `DELETE FROM "idempotency_requests" WHERE "channel_key" LIKE $1;`,
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
  await sql.unsafe(`DELETE FROM "addresses" WHERE "user_id" IN (
    SELECT "id" FROM "users" WHERE "email_normalized" LIKE $1
  );`, [`${prefix}%`]);
  await sql.unsafe(`DELETE FROM "product_variants" WHERE "sku" LIKE $1;`, [`${prefix.toUpperCase()}-%`]);
  await sql.unsafe(`DELETE FROM "products" WHERE "slug" LIKE $1;`, [`${prefix}-%`]);
  await sql.unsafe(`DELETE FROM "stores" WHERE "slug" LIKE $1;`, [`${prefix}-%`]);
  await sql.unsafe(
    `DELETE FROM "businesses" WHERE "owner_user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" LIKE $1);`,
    [`${prefix}.%`],
  );
  await sql.unsafe(`DELETE FROM "users" WHERE "email_normalized" LIKE $1;`, [`${prefix}.%`]);
}

describe('Idempotent Checkout Creation Integration (T047)', () => {
  it('executes atomic checkout and replays identical request idempotently (OR-1, OR-4, G3)', async () => {
    const sql = await connectOrSkip();
    if (!sql) return;

    await runMigrations(sql, migrationsDir);
    const prefix = 't047-checkout';
    await cleanup(sql, prefix);

    try {
      // 1. Seed Customer User & Address
      const custRows = (await sql.unsafe(
        `INSERT INTO "users" ("email_normalized", "password_hash") VALUES ($1, 'x') RETURNING "id";`,
        [`${prefix}.customer@example.com`],
      )) as unknown as Array<{ id: string }>;
      const customerId = custRows[0]!.id;

      const addrFields = {
        name: 'Jane Customer',
        line1: '789 Pine St',
        city: 'Denver',
        region: 'CO',
        postalCode: '80202',
        country: 'USA',
      };
      const addrRows = (await sql.unsafe(
        `INSERT INTO "addresses" ("user_id", "fields") VALUES ($1, $2::text::jsonb) RETURNING "id";`,
        [customerId, JSON.stringify(addrFields)],
      )) as unknown as Array<{ id: string }>;
      const addressId = addrRows[0]!.id;

      // 2. Seed Seller A Store & Variant
      const sellerRows = (await sql.unsafe(
        `INSERT INTO "users" ("email_normalized", "password_hash") VALUES ($1, 'x') RETURNING "id";`,
        [`${prefix}.seller@example.com`],
      )) as unknown as Array<{ id: string }>;
      const sellerId = sellerRows[0]!.id;

      const bizRows = (await sql.unsafe(
        `INSERT INTO "businesses" ("owner_user_id") VALUES ($1) RETURNING "id";`,
        [sellerId],
      )) as unknown as Array<{ id: string }>;
      const bizId = bizRows[0]!.id;

      const storeARows = (await sql.unsafe(
        `INSERT INTO "stores" ("business_id", "slug", "name", "status") VALUES ($1, $2, 'Store A', 'active') RETURNING "id";`,
        [bizId, `${prefix}-store-a`],
      )) as unknown as Array<{ id: string }>;
      const storeAId = storeARows[0]!.id;

      const storeBRows = (await sql.unsafe(
        `INSERT INTO "stores" ("business_id", "slug", "name", "status") VALUES ($1, $2, 'Store B', 'active') RETURNING "id";`,
        [bizId, `${prefix}-store-b`],
      )) as unknown as Array<{ id: string }>;
      const storeBId = storeBRows[0]!.id;

      const prodA = (await sql.unsafe(
        `INSERT INTO "products" ("store_id", "slug", "title", "status") VALUES ($1, $2, 'Prod A', 'active') RETURNING "id";`,
        [storeAId, `${prefix}-prod-a`],
      )) as unknown as Array<{ id: string }>;
      const prodB = (await sql.unsafe(
        `INSERT INTO "products" ("store_id", "slug", "title", "status") VALUES ($1, $2, 'Prod B', 'active') RETURNING "id";`,
        [storeBId, `${prefix}-prod-b`],
      )) as unknown as Array<{ id: string }>;

      const varA = (await sql.unsafe(
        `INSERT INTO "product_variants" ("store_id", "product_id", "sku", "price_cents", "status")
         VALUES ($1, $2, 'T047-VAR-A', 2000, 'active') RETURNING "id";`,
        [storeAId, prodA[0]!.id],
      )) as unknown as Array<{ id: string }>;
      const variantAId = varA[0]!.id;

      const varB = (await sql.unsafe(
        `INSERT INTO "product_variants" ("store_id", "product_id", "sku", "price_cents", "status")
         VALUES ($1, $2, 'T047-VAR-B', 3000, 'active') RETURNING "id";`,
        [storeBId, prodB[0]!.id],
      )) as unknown as Array<{ id: string }>;
      const variantBId = varB[0]!.id;

      // Seed initial stock: on_hand = 10 each
      await sql.unsafe(
        `INSERT INTO "inventory" ("variant_id", "store_id", "on_hand", "reserved") VALUES
           ($1, $2, 10, 0),
           ($3, $4, 10, 0);`,
        [variantAId, storeAId, variantBId, storeBId],
      );

      // 3. Obtain canonical quote token
      const quote = await quoteService.calculateQuote({
        channelKey: `${prefix}-channel`,
        items: [
          { variantId: variantAId, qty: 1, expectedUnitPriceCents: '2000' },
          { variantId: variantBId, qty: 1, expectedUnitPriceCents: '3000' },
        ],
      });

      expect(quote.totalCents).toBe('6000'); // 5000 subtotal + 1000 shipping (2 sellers)

      // 4. Initiate checkout with Idempotency-Key
      const idempotencyKey = '77777777-7777-4777-8777-777777777777';
      const checkoutRes1 = await checkoutService.initiateCheckout({
        userId: customerId,
        channelKey: `${prefix}-channel`,
        addressId,
        acceptedQuoteToken: quote.quoteToken,
        idempotencyKey,
      });

      expect(checkoutRes1.status).toBe('PENDING');
      expect(checkoutRes1.totalCents).toBe('6000');
      expect(checkoutRes1.orderId).toBeDefined();

      const orderId = checkoutRes1.orderId;

      // Verify all transactional artifacts exist in database
      const orderRows = (await sql.unsafe(
        `SELECT "id", "payment_status", "total_cents", "address_snapshot" FROM "orders" WHERE "id" = $1;`,
        [orderId],
      )) as unknown as Array<{ id: string; payment_status: string; total_cents: number; address_snapshot: { line1?: string } }>;

      expect(orderRows).toHaveLength(1);
      expect(orderRows[0]!.payment_status).toBe('PENDING');
      expect(orderRows[0]!.total_cents).toBe(6000);
      expect(orderRows[0]!.address_snapshot.line1).toBe('789 Pine St');

      // Verify 2 seller suborders created (DEC-011)
      const suborderRows = (await sql.unsafe(
        `SELECT "store_id", "total_cents" FROM "seller_orders" WHERE "order_id" = $1 ORDER BY "total_cents" ASC;`,
        [orderId],
      )) as unknown as Array<{ store_id: string; total_cents: number }>;

      expect(suborderRows).toHaveLength(2);
      expect(suborderRows[0]!.total_cents).toBe(2500); // 2000 + 500
      expect(suborderRows[1]!.total_cents).toBe(3500); // 3000 + 500

      // Verify reservations created and inventory updated
      const resRows = (await sql.unsafe(
        `SELECT "variant_id", "quantity", "status" FROM "stock_reservations" WHERE "cart_id" = $1;`,
        [orderId],
      )) as unknown as Array<{ variant_id: string; quantity: number; status: string }>;

      expect(resRows).toHaveLength(2);
      expect(resRows.every((r) => r.status === 'ACTIVE')).toBe(true);

      const invRows = (await sql.unsafe(
        `SELECT "variant_id", "on_hand", "reserved" FROM "inventory" WHERE "variant_id" IN ($1, $2);`,
        [variantAId, variantBId],
      )) as unknown as Array<{ variant_id: string; on_hand: number; reserved: number }>;

      expect(invRows.every((r) => r.reserved === 1)).toBe(true);

      // Verify Transactional Outbox event written
      const outboxRows = (await sql.unsafe(
        `SELECT "event_type", "aggregate_id" FROM "outbox" WHERE "aggregate_id" = $1;`,
        [orderId],
      )) as unknown as Array<{ event_type: string; aggregate_id: string }>;

      expect(outboxRows).toHaveLength(1);
      expect(outboxRows[0]!.event_type).toBe('order.checkout_reserved');

      // 5. Test Idempotent Replay (Second call with identical parameters)
      const checkoutRes2 = await checkoutService.initiateCheckout({
        userId: customerId,
        channelKey: `${prefix}-channel`,
        addressId,
        acceptedQuoteToken: quote.quoteToken,
        idempotencyKey,
      });

      expect(checkoutRes2).toEqual(checkoutRes1);

      // Verify inventory reservation was NOT executed again (reserved is still 1, not 2)
      const invAfter = (await sql.unsafe(
        `SELECT "reserved" FROM "inventory" WHERE "variant_id" IN ($1, $2);`,
        [variantAId, variantBId],
      )) as unknown as Array<{ reserved: number }>;

      expect(invAfter.every((r) => r.reserved === 1)).toBe(true);
    } finally {
      await cleanup(sql, prefix);
      await sql.end();
    }
  });

  it('rejects idempotency key reuse with modified parameters (409 Conflict)', async () => {
    const sql = await connectOrSkip();
    if (!sql) return;

    await runMigrations(sql, migrationsDir);
    const prefix = 't047-conflict';
    await cleanup(sql, prefix);

    try {
      const custRows = (await sql.unsafe(
        `INSERT INTO "users" ("email_normalized", "password_hash") VALUES ($1, 'x') RETURNING "id";`,
        [`${prefix}.customer@example.com`],
      )) as unknown as Array<{ id: string }>;
      const customerId = custRows[0]!.id;

      // Seed 2 addresses
      const addr1 = (await sql.unsafe(
        `INSERT INTO "addresses" ("user_id", "fields") VALUES ($1, '{}') RETURNING "id";`,
        [customerId],
      )) as unknown as Array<{ id: string }>;

      const addr2 = (await sql.unsafe(
        `INSERT INTO "addresses" ("user_id", "fields") VALUES ($1, '{}') RETURNING "id";`,
        [customerId],
      )) as unknown as Array<{ id: string }>;

      const bizRows = (await sql.unsafe(
        `INSERT INTO "businesses" ("owner_user_id") VALUES ($1) RETURNING "id";`,
        [customerId],
      )) as unknown as Array<{ id: string }>;
      const bizId = bizRows[0]!.id;

      const storeRows = (await sql.unsafe(
        `INSERT INTO "stores" ("business_id", "slug", "name", "status") VALUES ($1, $2, 'Store', 'active') RETURNING "id";`,
        [bizId, `${prefix}-store`],
      )) as unknown as Array<{ id: string }>;
      const storeId = storeRows[0]!.id;

      const prod = (await sql.unsafe(
        `INSERT INTO "products" ("store_id", "slug", "title", "status") VALUES ($1, $2, 'Prod', 'active') RETURNING "id";`,
        [storeId, `${prefix}-prod`],
      )) as unknown as Array<{ id: string }>;

      const varRows = (await sql.unsafe(
        `INSERT INTO "product_variants" ("store_id", "product_id", "sku", "price_cents", "status")
         VALUES ($1, $2, 'T047-CONF-VAR', 1000, 'active') RETURNING "id";`,
        [storeId, prod[0]!.id],
      )) as unknown as Array<{ id: string }>;
      const variantId = varRows[0]!.id;

      await sql.unsafe(
        `INSERT INTO "inventory" ("variant_id", "store_id", "on_hand", "reserved") VALUES ($1, $2, 5, 0);`,
        [variantId, storeId],
      );

      const quote = await quoteService.calculateQuote({
        channelKey: `${prefix}-channel`,
        items: [{ variantId, qty: 1 }],
      });

      const key = '88888888-8888-4888-8888-888888888888';

      // First call with addr1 succeeds
      await checkoutService.initiateCheckout({
        userId: customerId,
        channelKey: `${prefix}-channel`,
        addressId: addr1[0]!.id,
        acceptedQuoteToken: quote.quoteToken,
        idempotencyKey: key,
      });

      // Second call with same key but addr2 must fail with IdempotencyConflictError
      await expect(
        checkoutService.initiateCheckout({
          userId: customerId,
          channelKey: `${prefix}-channel`,
          addressId: addr2[0]!.id,
          acceptedQuoteToken: quote.quoteToken,
          idempotencyKey: key,
        }),
      ).rejects.toThrow(IdempotencyConflictError);
    } finally {
      await cleanup(sql, prefix);
      await sql.end();
    }
  });

  it('rolls back completely if any line item reservation fails due to stock (G2)', async () => {
    const sql = await connectOrSkip();
    if (!sql) return;

    await runMigrations(sql, migrationsDir);
    const prefix = 't047-insufficient';
    await cleanup(sql, prefix);

    try {
      const custRows = (await sql.unsafe(
        `INSERT INTO "users" ("email_normalized", "password_hash") VALUES ($1, 'x') RETURNING "id";`,
        [`${prefix}.customer@example.com`],
      )) as unknown as Array<{ id: string }>;
      const customerId = custRows[0]!.id;

      const addrRows = (await sql.unsafe(
        `INSERT INTO "addresses" ("user_id", "fields") VALUES ($1, '{}') RETURNING "id";`,
        [customerId],
      )) as unknown as Array<{ id: string }>;
      const addressId = addrRows[0]!.id;

      const bizRows = (await sql.unsafe(
        `INSERT INTO "businesses" ("owner_user_id") VALUES ($1) RETURNING "id";`,
        [customerId],
      )) as unknown as Array<{ id: string }>;
      const bizId = bizRows[0]!.id;

      const storeRows = (await sql.unsafe(
        `INSERT INTO "stores" ("business_id", "slug", "name", "status") VALUES ($1, $2, 'Store', 'active') RETURNING "id";`,
        [bizId, `${prefix}-store`],
      )) as unknown as Array<{ id: string }>;
      const storeId = storeRows[0]!.id;

      const prod = (await sql.unsafe(
        `INSERT INTO "products" ("store_id", "slug", "title", "status") VALUES ($1, $2, 'Prod', 'active') RETURNING "id";`,
        [storeId, `${prefix}-prod`],
      )) as unknown as Array<{ id: string }>;

      // 2 variants: Var 1 has 5 units, Var 2 has 0 units
      const var1 = (await sql.unsafe(
        `INSERT INTO "product_variants" ("store_id", "product_id", "sku", "price_cents", "status")
         VALUES ($1, $2, 'T047-STOCK-1', 1000, 'active') RETURNING "id";`,
        [storeId, prod[0]!.id],
      )) as unknown as Array<{ id: string }>;

      const var2 = (await sql.unsafe(
        `INSERT INTO "product_variants" ("store_id", "product_id", "sku", "price_cents", "status")
         VALUES ($1, $2, 'T047-STOCK-2', 1000, 'active') RETURNING "id";`,
        [storeId, prod[0]!.id],
      )) as unknown as Array<{ id: string }>;

      await sql.unsafe(
        `INSERT INTO "inventory" ("variant_id", "store_id", "on_hand", "reserved") VALUES
           ($1, $2, 5, 0),
           ($3, $4, 0, 0);`,
        [var1[0]!.id, storeId, var2[0]!.id, storeId],
      );

      const quote = await quoteService.calculateQuote({
        channelKey: `${prefix}-channel`,
        items: [
          { variantId: var1[0]!.id, qty: 1 },
          { variantId: var2[0]!.id, qty: 1 },
        ],
      });

      const key = '99999999-9999-4999-8999-999999999999';

      await expect(
        checkoutService.initiateCheckout({
          userId: customerId,
          channelKey: `${prefix}-channel`,
          addressId,
          acceptedQuoteToken: quote.quoteToken,
          idempotencyKey: key,
        }),
      ).rejects.toThrow(InsufficientStockError);

      // Verify Var 1 reservation was NOT retained (reserved is still 0)
      const invVar1 = (await sql.unsafe(
        `SELECT "reserved" FROM "inventory" WHERE "variant_id" = $1;`,
        [var1[0]!.id],
      )) as unknown as Array<{ reserved: number }>;

      expect(invVar1[0]!.reserved).toBe(0);

      // Verify no orders exist in DB
      const orders = (await sql.unsafe(
        `SELECT "id" FROM "orders" WHERE "channel_key" = $1;`,
        [`${prefix}-channel`],
      )) as unknown as Array<{ id: string }>;

      expect(orders).toHaveLength(0);
    } finally {
      await cleanup(sql, prefix);
      await sql.end();
    }
  });
});
