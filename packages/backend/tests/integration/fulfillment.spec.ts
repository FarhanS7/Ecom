// packages/backend/tests/integration/fulfillment.spec.ts - Integration test for seller fulfillment transitions (T056).
// Invariants verified:
// 1. Unpaid orders reject fulfillment transitions with OrderNotPaidError.
// 2. Strict tenant isolation: seller cannot transition suborders belonging to another vendor (FulfillmentStoreMismatchError).
// 3. Sequential FSM enforcement: PENDING -> PACKED -> SHIPPED -> DELIVERED; illegal transitions rejected.
// 4. Missing trackingRef on SHIPPED rejected with MissingTrackingRefError.
// 5. Fulfillment event recorded in fulfillment_events audit ledger.
// 6. SuborderTransitioned domain event emitted to transactional outbox.
// 7. Dynamic parent order status derivation (e.g. PARTIALLY_SHIPPED when 1 seller ships, SHIPPED when all ship, DELIVERED when all deliver).

import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetEnvCache } from '@shopscale/config';
import {
  FulfillmentService,
  FulfillmentStoreMismatchError,
  IllegalFulfillmentTransitionError,
  MissingTrackingRefError,
  OrderNotPaidError,
  findMigrationsDir,
  openAdminConnection,
  requireDatabaseUrl,
  runMigrations,
} from '../../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = findMigrationsDir(here);

type Sql = Awaited<ReturnType<typeof openAdminConnection>>;

async function connectOrSkip(): Promise<Sql | null> {
  resetEnvCache();
  let url: string;
  try {
    url = requireDatabaseUrl();
  } catch {
    console.warn('SKIP: DATABASE_URL not configured; start infra first.');
    return null;
  }
  const sql = openAdminConnection(url);
  try {
    await sql`SELECT 1`;
    return sql;
  } catch {
    await sql.end();
    console.warn('SKIP: database unreachable; start infra first.');
    return null;
  }
}

describe('Seller Fulfillment Transitions and Ledger (T056)', () => {
  let sql: Sql | null = null;
  let fulfillmentService: FulfillmentService;

  beforeAll(async () => {
    sql = await connectOrSkip();
    if (sql) {
      await runMigrations(sql, migrationsDir);
      fulfillmentService = new FulfillmentService(sql);
    }
  });

  afterAll(async () => {
    if (sql) {
      await sql.end();
    }
  });

  it('proves multi-seller fulfillment state machine, ledgering, and parent status derivation', async () => {
    if (!sql) return;

    const prefix = `ful_${Date.now()}`;

    // 1. Setup users, stores (Store A and Store B)
    const [cust] = await sql`
      INSERT INTO "users" ("email_normalized", "password_hash", "status")
      VALUES (${`buyer_${prefix}@test.com`}, 'hash', 'active')
      RETURNING id;
    `;
    const [sellerUserA] = await sql`
      INSERT INTO "users" ("email_normalized", "password_hash", "status")
      VALUES (${`seller_a_${prefix}@test.com`}, 'hash', 'active')
      RETURNING id;
    `;
    const [sellerUserB] = await sql`
      INSERT INTO "users" ("email_normalized", "password_hash", "status")
      VALUES (${`seller_b_${prefix}@test.com`}, 'hash', 'active')
      RETURNING id;
    `;

    const [storeA] = await sql`
      INSERT INTO "stores" ("business_id", "slug", "name", "status")
      VALUES (
        (INSERT INTO "businesses" ("owner_user_id", "legal_name") VALUES (${sellerUserA.id}, ${`BizA ${prefix}`}) RETURNING id),
        ${`store-a-${prefix}`}, ${`Store A ${prefix}`}, 'active'
      ) RETURNING id;
    `;

    const [storeB] = await sql`
      INSERT INTO "stores" ("business_id", "slug", "name", "status")
      VALUES (
        (INSERT INTO "businesses" ("owner_user_id", "legal_name") VALUES (${sellerUserB.id}, ${`BizB ${prefix}`}) RETURNING id),
        ${`store-b-${prefix}`}, ${`Store B ${prefix}`}, 'active'
      ) RETURNING id;
    `;

    const [cat] = await sql`
      INSERT INTO "categories" ("slug", "name", "path")
      VALUES (${`cat-${prefix}`}, 'Cat', ${`cat-${prefix}`})
      RETURNING id;
    `;

    const [prodA] = await sql`
      INSERT INTO "products" ("store_id", "category_id", "slug", "title", "description", "currency")
      VALUES (${storeA.id}, ${cat.id}, ${`prod-a-${prefix}`}, 'Prod A', 'Desc A', 'USD')
      RETURNING id;
    `;
    const [varA] = await sql`
      INSERT INTO "product_variants" ("product_id", "store_id", "sku", "price_cents")
      VALUES (${prodA.id}, ${storeA.id}, ${`sku-a-${prefix}`}, 2500)
      RETURNING id;
    `;

    const [prodB] = await sql`
      INSERT INTO "products" ("store_id", "category_id", "slug", "title", "description", "currency")
      VALUES (${storeB.id}, ${cat.id}, ${`prod-b-${prefix}`}, 'Prod B', 'Desc B', 'USD')
      RETURNING id;
    `;
    const [varB] = await sql`
      INSERT INTO "product_variants" ("product_id", "store_id", "sku", "price_cents")
      VALUES (${prodB.id}, ${storeB.id}, ${`sku-b-${prefix}`}, 4500)
      RETURNING id;
    `;

    // 2. Create multi-vendor Order (starts PENDING payment and fulfillment)
    const orderId = randomUUID();
    const suborderAId = randomUUID();
    const suborderBId = randomUUID();

    const address = {
      fullName: 'Customer Express',
      line1: '123 Market St',
      city: 'Portland',
      state: 'OR',
      postalCode: '97201',
      country: 'USA',
    };

    await sql`
      INSERT INTO "orders" (
        "id", "user_id", "channel_key", "store_id", "payment_status", "fulfillment_status",
        "subtotal_cents", "shipping_cents", "discount_cents", "total_cents", "currency", "address_snapshot"
      ) VALUES (
        ${orderId}, ${cust.id}, 'marketplace', NULL, 'PENDING', 'PENDING',
        7000, 1000, 0, 8000, 'USD', ${JSON.stringify(address)}::jsonb
      );
    `;

    await sql`
      INSERT INTO "seller_orders" (
        "id", "order_id", "store_id", "fulfillment_status", "subtotal_cents", "shipping_cents", "discount_cents", "total_cents"
      ) VALUES
        (${suborderAId}, ${orderId}, ${storeA.id}, 'PENDING', 2500, 500, 0, 3000),
        (${suborderBId}, ${orderId}, ${storeB.id}, 'PENDING', 4500, 500, 0, 5000);
    `;

    await sql`
      INSERT INTO "order_items" (
        "order_id", "seller_order_id", "store_id", "variant_id", "title_snapshot", "sku_snapshot", "qty", "unit_price_cents", "total_cents"
      ) VALUES
        (${orderId}, ${suborderAId}, ${storeA.id}, ${varA.id}, 'Prod A', 'sku-a', 1, 2500, 2500),
        (${orderId}, ${suborderBId}, ${storeB.id}, ${varB.id}, 'Prod B', 'sku-b', 1, 4500, 4500);
    `;

    // 3. Invariant 1: Unpaid order rejected
    await expect(
      fulfillmentService.transitionSuborder({
        storeId: storeA.id,
        suborderId: suborderAId,
        toStatus: 'PACKED',
      }),
    ).rejects.toThrow(OrderNotPaidError);

    // Simulate payment confirmation
    await sql`UPDATE "orders" SET "payment_status" = 'PAID' WHERE "id" = ${orderId}`;

    // 4. Invariant 2: Tenant isolation (Seller A cannot transition Seller B suborder)
    await expect(
      fulfillmentService.transitionSuborder({
        storeId: storeA.id,
        suborderId: suborderBId,
        toStatus: 'PACKED',
      }),
    ).rejects.toThrow(FulfillmentStoreMismatchError);

    // 5. Invariant 3: FSM illegal transition jump (PENDING -> SHIPPED)
    await expect(
      fulfillmentService.transitionSuborder({
        storeId: storeA.id,
        suborderId: suborderAId,
        toStatus: 'SHIPPED',
        trackingRef: 'TRACK123',
      }),
    ).rejects.toThrow(IllegalFulfillmentTransitionError);

    // 6. Invariant 4: Seller A transitions PENDING -> PACKED
    const packResult = await fulfillmentService.transitionSuborder({
      storeId: storeA.id,
      suborderId: suborderAId,
      toStatus: 'PACKED',
      actorId: sellerUserA.id,
    });
    expect(packResult.success).toBe(true);
    expect(packResult.suborder.fulfillmentStatus).toBe('PACKED');
    expect(packResult.parentFulfillmentStatus).toBe('PACKED');

    // Verify parent order in DB is now PACKED
    const [orderAfterPack] = await sql`SELECT fulfillment_status FROM "orders" WHERE "id" = ${orderId}`;
    expect(orderAfterPack.fulfillment_status).toBe('PACKED');

    // 7. Invariant 5: PACKED -> SHIPPED requires trackingRef
    await expect(
      fulfillmentService.transitionSuborder({
        storeId: storeA.id,
        suborderId: suborderAId,
        toStatus: 'SHIPPED',
      }),
    ).rejects.toThrow(MissingTrackingRefError);

    // 8. Invariant 6: Seller A transitions PACKED -> SHIPPED with tracking number
    const shipResultA = await fulfillmentService.transitionSuborder({
      storeId: storeA.id,
      suborderId: suborderAId,
      toStatus: 'SHIPPED',
      trackingRef: 'DHL-A-12345',
      carrier: 'DHL',
      actorId: sellerUserA.id,
    });
    expect(shipResultA.success).toBe(true);
    expect(shipResultA.suborder.fulfillmentStatus).toBe('SHIPPED');
    expect(shipResultA.suborder.trackingRef).toBe('DHL-A-12345');
    expect(shipResultA.suborder.carrier).toBe('DHL');
    // Suborder B is still PENDING -> parent order is PARTIALLY_SHIPPED!
    expect(shipResultA.parentFulfillmentStatus).toBe('PARTIALLY_SHIPPED');

    const [orderAfterShipA] = await sql`SELECT fulfillment_status FROM "orders" WHERE "id" = ${orderId}`;
    expect(orderAfterShipA.fulfillment_status).toBe('PARTIALLY_SHIPPED');

    // Verify fulfillment_events ledger has row for Store A
    const eventsA = await sql`
      SELECT * FROM "fulfillment_events"
      WHERE "seller_order_id" = ${suborderAId}
      ORDER BY "created_at" ASC
    `;
    expect(eventsA.length).toBe(2); // PACKED then SHIPPED
    expect(eventsA[1].from_status).toBe('PACKED');
    expect(eventsA[1].to_status).toBe('SHIPPED');
    expect(eventsA[1].tracking_ref).toBe('DHL-A-12345');
    expect(eventsA[1].carrier).toBe('DHL');

    // 9. Seller B transitions PENDING -> PACKED -> SHIPPED
    await fulfillmentService.transitionSuborder({
      storeId: storeB.id,
      suborderId: suborderBId,
      toStatus: 'PACKED',
      actorId: sellerUserB.id,
    });

    const shipResultB = await fulfillmentService.transitionSuborder({
      storeId: storeB.id,
      suborderId: suborderBId,
      toStatus: 'SHIPPED',
      trackingRef: 'FEDEX-B-67890',
      carrier: 'FedEx',
      actorId: sellerUserB.id,
    });
    // Now both Seller A and Seller B have shipped -> parent order is SHIPPED!
    expect(shipResultB.parentFulfillmentStatus).toBe('SHIPPED');

    const [orderAfterShipB] = await sql`SELECT fulfillment_status FROM "orders" WHERE "id" = ${orderId}`;
    expect(orderAfterShipB.fulfillment_status).toBe('SHIPPED');

    // 10. Seller A delivers suborder -> parent order is PARTIALLY_DELIVERED
    const delivResultA = await fulfillmentService.transitionSuborder({
      storeId: storeA.id,
      suborderId: suborderAId,
      toStatus: 'DELIVERED',
      actorId: sellerUserA.id,
    });
    expect(delivResultA.parentFulfillmentStatus).toBe('PARTIALLY_DELIVERED');

    // 11. Seller B delivers suborder -> parent order is DELIVERED
    const delivResultB = await fulfillmentService.transitionSuborder({
      storeId: storeB.id,
      suborderId: suborderBId,
      toStatus: 'DELIVERED',
      actorId: sellerUserB.id,
    });
    expect(delivResultB.parentFulfillmentStatus).toBe('DELIVERED');

    const [orderAfterDelivB] = await sql`SELECT fulfillment_status FROM "orders" WHERE "id" = ${orderId}`;
    expect(orderAfterDelivB.fulfillment_status).toBe('DELIVERED');

    // Verify transactional outbox recorded all SuborderTransitioned events
    const outboxRows = await sql`
      SELECT * FROM "outbox_events"
      WHERE "aggregate_id" = ${orderId} AND "type" = 'order.suborder_transitioned'
    `;
    expect(outboxRows.length).toBeGreaterThanOrEqual(4);
  });
});
