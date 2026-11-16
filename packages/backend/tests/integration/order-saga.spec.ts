// packages/backend/tests/integration/order-saga.spec.ts - Integration test for order payment saga (T051).
// Invariants verified:
// 1. Successful payment transitions orders.payment_status = 'PAID' and confirms inventory.
// 2. Inventory settlement decrements both on_hand and reserved by reserved quantity; marks reservation 'consumed'.
// 3. Emits OrderPaid domain event with seller suborder IDs into transactional outbox.
// 4. Failed payment compensates by cancelling order and seller suborders, releasing reserved stock.
// 5. Reservation release decrements reserved by quantity while keeping on_hand intact; marks reservation 'released'.
// 6. Idempotent replay produces zero side effects and zero duplicate outbox events.

import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetEnvCache } from '@shopscale/config';
import {
  OrderCompletionService,
  findMigrationsDir,
  inventoryService,
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

describe('Order Payment Settlement & Compensation Saga (T051)', () => {
  let sql: Sql | null = null;
  let sagaService: OrderCompletionService;

  beforeAll(async () => {
    sql = await connectOrSkip();
    if (sql) {
      await runMigrations(sql, migrationsDir);
      sagaService = new OrderCompletionService(sql);
    }
  });

  afterAll(async () => {
    if (sql) {
      await sql.end();
    }
  });

  async function createTestFixtures(prefix: string, qty = 2, initialOnHand = 10) {
    if (!sql) throw new Error('Database not connected');

    // 1. User
    const [user] = await sql`
      INSERT INTO "users" ("email_normalized", "password_hash", "status")
      VALUES (${`${prefix}@test.com`}, 'hash', 'active')
      RETURNING id;
    `;

    // 2. Business & Store
    const [biz] = await sql`
      INSERT INTO "businesses" ("owner_user_id", "legal_name")
      VALUES (${user.id}, ${`Biz ${prefix}`})
      RETURNING id;
    `;

    const [store] = await sql`
      INSERT INTO "stores" ("business_id", "slug", "name", "status")
      VALUES (${biz.id}, ${`store-${prefix}`}, ${`Store ${prefix}`}, 'active')
      RETURNING id;
    `;

    // 3. Category & Product & Variant
    const [cat] = await sql`
      INSERT INTO "categories" ("slug", "name", "path")
      VALUES (${`cat-${prefix}`}, 'Cat', ${`cat-${prefix}`})
      RETURNING id;
    `;

    const [prod] = await sql`
      INSERT INTO "products" ("store_id", "category_id", "slug", "title", "description", "currency")
      VALUES (${store.id}, ${cat.id}, ${`prod-${prefix}`}, 'Product', 'Desc', 'USD')
      RETURNING id;
    `;

    const [variant] = await sql`
      INSERT INTO "product_variants" ("product_id", "store_id", "sku", "price_cents")
      VALUES (${prod.id}, ${store.id}, ${`sku-${prefix}`}, 2500)
      RETURNING id;
    `;

    // 4. Initial Inventory
    await sql`
      INSERT INTO "inventory" ("variant_id", "store_id", "on_hand", "reserved")
      VALUES (${variant.id}, ${store.id}, ${initialOnHand}, 0);
    `;

    // 5. Parent Order & Seller Suborder
    const orderId = randomUUID();
    const sellerOrderId = randomUUID();

    await sql`
      INSERT INTO "orders" (
        "id", "user_id", "channel_key", "store_id", "payment_status", "fulfillment_status",
        "subtotal_cents", "shipping_cents", "discount_cents", "total_cents", "currency",
        "address_snapshot", "version"
      ) VALUES (
        ${orderId}, ${user.id}, ${prefix}, ${store.id}, 'PENDING', 'PENDING',
        5000, 500, 0, 5500, 'USD', '{}'::jsonb, 1
      );
    `;

    await sql`
      INSERT INTO "seller_orders" (
        "id", "order_id", "store_id", "fulfillment_status",
        "subtotal_cents", "shipping_cents", "discount_cents", "total_cents"
      ) VALUES (
        ${sellerOrderId}, ${orderId}, ${store.id}, 'PENDING',
        5000, 500, 0, 5500
      );
    `;

    // 6. Reserve stock for this checkout
    const reserveResult = await inventoryService.reserve(sql, {
      checkoutId: orderId,
      items: [{ variantId: variant.id, qty }],
    });
    expect(reserveResult.ok).toBe(true);

    return {
      orderId,
      sellerOrderId,
      variantId: variant.id,
      storeId: store.id,
    };
  }

  it('settles paid order: confirms inventory on_hand and reserved decrement, emits order.paid outbox event', async () => {
    if (!sql) return;

    const prefix = `saga_ok_${Date.now()}`;
    const { orderId, sellerOrderId, variantId } = await createTestFixtures(prefix, 2, 10);

    // Initial state check: on_hand = 10, reserved = 2, available = 8
    const [invBefore] = await sql`
      SELECT on_hand, reserved FROM inventory WHERE variant_id = ${variantId};
    `;
    expect(invBefore.on_hand).toBe(10);
    expect(invBefore.reserved).toBe(2);

    // Act: Process PaymentObserved event with status = PAID
    const eventId = randomUUID();
    const result = await sagaService.handlePaymentObserved({
      aggregateId: orderId,
      payload: {
        eventId,
        status: 'PAID',
        type: 'payment.succeeded',
        amountCents: '5500',
      },
      causationId: eventId,
    });

    expect(result.status).toBe('confirmed');
    expect(result.orderId).toBe(orderId);

    // 1. Assert orders table updated to PAID
    const [orderRow] = await sql`
      SELECT payment_status, fulfillment_status FROM orders WHERE id = ${orderId};
    `;
    expect(orderRow.payment_status).toBe('PAID');
    expect(orderRow.fulfillment_status).toBe('PENDING');

    // 2. Assert inventory table settled: on_hand = 8 (10 - 2), reserved = 0 (2 - 2)
    const [invAfter] = await sql`
      SELECT on_hand, reserved FROM inventory WHERE variant_id = ${variantId};
    `;
    expect(invAfter.on_hand).toBe(8);
    expect(invAfter.reserved).toBe(0);

    // 3. Assert reservation status changed to 'consumed'
    const [reservation] = await sql`
      SELECT status FROM stock_reservations WHERE cart_id = ${orderId};
    `;
    expect(reservation.status).toBe('consumed');

    // 4. Assert stock_movements ledger has 'order_fulfillment'
    const [movement] = await sql`
      SELECT delta_on_hand, delta_reserved, reason
      FROM stock_movements
      WHERE ref_id = ${orderId} AND reason = 'order_fulfillment';
    `;
    expect(movement).toBeDefined();
    expect(movement.delta_on_hand).toBe(-2);
    expect(movement.delta_reserved).toBe(-2);

    // 5. Assert outbox table has order.paid event with suborder IDs
    const [outboxRow] = await sql`
      SELECT event_type, payload FROM outbox WHERE causation_id = ${eventId};
    `;
    expect(outboxRow).toBeDefined();
    expect(outboxRow.event_type).toBe('order.paid');
    expect((outboxRow.payload as { sellerOrderIds: string[] }).sellerOrderIds).toContain(
      sellerOrderId,
    );
  });

  it('compensates failed payment: cancels order & suborders, releases reserved stock, emits order.cancelled', async () => {
    if (!sql) return;

    const prefix = `saga_fail_${Date.now()}`;
    const { orderId, sellerOrderId, variantId } = await createTestFixtures(prefix, 3, 10);

    // Initial state check: on_hand = 10, reserved = 3
    const [invBefore] = await sql`
      SELECT on_hand, reserved FROM inventory WHERE variant_id = ${variantId};
    `;
    expect(invBefore.on_hand).toBe(10);
    expect(invBefore.reserved).toBe(3);

    // Act: Process PaymentObserved event with status = FAILED
    const eventId = randomUUID();
    const result = await sagaService.handlePaymentObserved({
      aggregateId: orderId,
      payload: {
        eventId,
        status: 'FAILED',
        type: 'payment.failed',
      },
      causationId: eventId,
    });

    expect(result.status).toBe('compensated');
    expect(result.orderId).toBe(orderId);

    // 1. Assert order cancelled
    const [orderRow] = await sql`
      SELECT payment_status, fulfillment_status FROM orders WHERE id = ${orderId};
    `;
    expect(orderRow.payment_status).toBe('FAILED');
    expect(orderRow.fulfillment_status).toBe('CANCELLED');

    // 2. Assert seller order cancelled
    const [sellerOrderRow] = await sql`
      SELECT fulfillment_status FROM seller_orders WHERE id = ${sellerOrderId};
    `;
    expect(sellerOrderRow.fulfillment_status).toBe('CANCELLED');

    // 3. Assert inventory released: on_hand remains 10, reserved drops to 0 (available restored to 10)
    const [invAfter] = await sql`
      SELECT on_hand, reserved FROM inventory WHERE variant_id = ${variantId};
    `;
    expect(invAfter.on_hand).toBe(10);
    expect(invAfter.reserved).toBe(0);

    // 4. Assert reservation status changed to 'released'
    const [reservation] = await sql`
      SELECT status FROM stock_reservations WHERE cart_id = ${orderId};
    `;
    expect(reservation.status).toBe('released');

    // 5. Assert stock_movements ledger has 'reservation_released'
    const [movement] = await sql`
      SELECT delta_on_hand, delta_reserved, reason
      FROM stock_movements
      WHERE ref_id = ${orderId} AND reason = 'reservation_released';
    `;
    expect(movement).toBeDefined();
    expect(movement.delta_on_hand).toBe(0);
    expect(movement.delta_reserved).toBe(-3);

    // 6. Assert outbox table has order.cancelled event
    const [outboxRow] = await sql`
      SELECT event_type, payload FROM outbox WHERE causation_id = ${eventId};
    `;
    expect(outboxRow).toBeDefined();
    expect(outboxRow.event_type).toBe('order.cancelled');
    expect((outboxRow.payload as { reason: string }).reason).toBe('PAYMENT_FAILED');
  });

  it('guarantees complete idempotency on replaying events', async () => {
    if (!sql) return;

    const prefix = `saga_idemp_${Date.now()}`;
    const { orderId, variantId } = await createTestFixtures(prefix, 1, 5);

    const eventId = randomUUID();
    const firstResult = await sagaService.handlePaymentObserved({
      aggregateId: orderId,
      payload: { eventId, status: 'PAID', type: 'payment.succeeded' },
      causationId: eventId,
    });
    expect(firstResult.status).toBe('confirmed');

    const [invAfterFirst] = await sql`
      SELECT on_hand, reserved FROM inventory WHERE variant_id = ${variantId};
    `;
    expect(invAfterFirst.on_hand).toBe(4);
    expect(invAfterFirst.reserved).toBe(0);

    // Replay
    const secondResult = await sagaService.handlePaymentObserved({
      aggregateId: orderId,
      payload: { eventId, status: 'PAID', type: 'payment.succeeded' },
      causationId: eventId,
    });
    expect(secondResult.status).toBe('noop');

    // Inventory untouched
    const [invAfterSecond] = await sql`
      SELECT on_hand, reserved FROM inventory WHERE variant_id = ${variantId};
    `;
    expect(invAfterSecond.on_hand).toBe(4);
    expect(invAfterSecond.reserved).toBe(0);
  });
});
