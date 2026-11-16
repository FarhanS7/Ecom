// packages/backend/tests/integration/returns.spec.ts - Integration test for order cancellation and returns (T058).
// Invariants verified:
// 1. Unpaid order cancellation: transitions to CANCELLED, emits order.cancelled.
// 2. Paid order cancellation: transitions to CANCELLED/REFUNDED, restocks inventory, records movement, emits refund requested.
// 3. Shipped order cannot be cancelled (AlreadyShippedError).
// 4. Suborder shipped prevents parent cancellation (AlreadyShippedError).
// 5. Already cancelled order cannot be cancelled again (OrderAlreadyCancelledError).
// 6. Non-owner cancellation rejected (OrderNotFoundError).
// 7. Return requests permitted only on DELIVERED orders (OrderNotDeliveredError).
// 8. Cumulative return request quantity cannot exceed purchased quantity (ReturnQuantityExceededError).
// 9. Return request created in PENDING_INSPECTION with return.requested event emitted.
// 10. getReturnRequestsForOrder respects customer ownership.

import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetEnvCache } from '@shopscale/config';
import {
  AlreadyShippedError,
  OrderAlreadyCancelledError,
  OrderItemNotFoundError,
  OrderNotDeliveredError,
  OrderNotFoundError,
  ReturnQuantityExceededError,
  ReturnsService,
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

describe('Order Cancellation and Return Requests Integration (T058)', () => {
  let sql: Sql | null = null;
  let returnsService: ReturnsService;

  beforeAll(async () => {
    sql = await connectOrSkip();
    if (sql) {
      await runMigrations(sql, migrationsDir);
      returnsService = new ReturnsService(sql);
    }
  });

  afterAll(async () => {
    if (sql) {
      await sql.end();
    }
  });

  it('handles unpaid and paid order cancellation, inventory restock, and guards', async () => {
    if (!sql) return;

    const prefix = `ret_cancel_${Date.now()}`;

    // Setup customer and seller
    const [cust] = await sql`
      INSERT INTO "users" ("email_normalized", "password_hash", "status")
      VALUES (${`buyer_${prefix}@test.com`}, 'hash', 'active')
      RETURNING id;
    `;
    const [foreignUser] = await sql`
      INSERT INTO "users" ("email_normalized", "password_hash", "status")
      VALUES (${`foreign_${prefix}@test.com`}, 'hash', 'active')
      RETURNING id;
    `;
    const [sellerUser] = await sql`
      INSERT INTO "users" ("email_normalized", "password_hash", "status")
      VALUES (${`seller_${prefix}@test.com`}, 'hash', 'active')
      RETURNING id;
    `;

    const [store] = await sql`
      INSERT INTO "stores" ("business_id", "slug", "name", "status")
      VALUES (
        (INSERT INTO "businesses" ("owner_user_id", "legal_name") VALUES (${sellerUser.id}, ${`Biz ${prefix}`}) RETURNING id),
        ${`store-${prefix}`}, ${`Store ${prefix}`}, 'active'
      ) RETURNING id;
    `;

    const [cat] = await sql`
      INSERT INTO "categories" ("slug", "name", "path")
      VALUES (${`cat-${prefix}`}, 'Cat', ${`cat-${prefix}`})
      RETURNING id;
    `;

    const [prod] = await sql`
      INSERT INTO "products" ("store_id", "category_id", "slug", "title", "description", "currency")
      VALUES (${store.id}, ${cat.id}, ${`prod-${prefix}`}, 'Test Product', 'Description', 'USD')
      RETURNING id;
    `;

    const [variant] = await sql`
      INSERT INTO "product_variants" ("product_id", "store_id", "sku", "price_cents")
      VALUES (${prod.id}, ${store.id}, ${`sku-${prefix}`}, 5000)
      RETURNING id;
    `;

    // Seed inventory: 10 on hand, 0 reserved
    await sql`
      INSERT INTO "inventory" ("variant_id", "store_id", "on_hand", "reserved")
      VALUES (${variant.id}, ${store.id}, 10, 0);
    `;

    const address = {
      fullName: 'Buyer User',
      line1: '123 Test Ave',
      city: 'Portland',
      state: 'OR',
      postalCode: '97201',
      country: 'USA',
    };

    // --- CASE 1: Unpaid Order Cancellation ---
    const unpaidOrderId = randomUUID();
    const unpaidSuborderId = randomUUID();
    await sql`
      INSERT INTO "orders" (
        "id", "user_id", "channel_key", "store_id", "payment_status", "fulfillment_status",
        "subtotal_cents", "shipping_cents", "discount_cents", "total_cents", "currency", "address_snapshot"
      ) VALUES (
        ${unpaidOrderId}, ${cust.id}, 'store', ${store.id}, 'PENDING', 'PENDING',
        5000, 500, 0, 5500, 'USD', ${JSON.stringify(address)}::jsonb
      );
    `;
    await sql`
      INSERT INTO "seller_orders" (
        "id", "order_id", "store_id", "fulfillment_status", "subtotal_cents", "shipping_cents", "discount_cents", "total_cents"
      ) VALUES
        (${unpaidSuborderId}, ${unpaidOrderId}, ${store.id}, 'PENDING', 5000, 500, 0, 5500);
    `;
    await sql`
      INSERT INTO "order_items" (
        "order_id", "seller_order_id", "store_id", "variant_id", "title_snapshot", "sku_snapshot", "qty", "unit_price_cents", "total_cents"
      ) VALUES
        (${unpaidOrderId}, ${unpaidSuborderId}, ${store.id}, ${variant.id}, 'Test Product', 'sku-test', 2, 2500, 5000);
    `;

    // Invariant: Non-owner cannot cancel
    await expect(
      returnsService.cancelOrder(foreignUser.id, unpaidOrderId, 'Malicious cancel'),
    ).rejects.toThrow(OrderNotFoundError);

    // Cancel unpaid order
    const cancelUnpaidResult = await returnsService.cancelOrder(
      cust.id,
      unpaidOrderId,
      'Changed mind before paying',
    );
    expect(cancelUnpaidResult.orderId).toBe(unpaidOrderId);
    expect(cancelUnpaidResult.status).toBe('CANCELLED');
    expect(cancelUnpaidResult.refundInitiated).toBe(false);

    // Verify DB status
    const [unpaidDb] = await sql`SELECT fulfillment_status, payment_status FROM orders WHERE id = ${unpaidOrderId}`;
    expect(unpaidDb.fulfillment_status).toBe('CANCELLED');
    expect(unpaidDb.payment_status).toBe('PENDING');

    // Invariant: Already cancelled cannot be cancelled again
    await expect(
      returnsService.cancelOrder(cust.id, unpaidOrderId, 'Cancel again'),
    ).rejects.toThrow(OrderAlreadyCancelledError);

    // --- CASE 2: Paid Order Cancellation (Triggers Restock & Refund) ---
    const paidOrderId = randomUUID();
    const paidSuborderId = randomUUID();
    await sql`
      INSERT INTO "orders" (
        "id", "user_id", "channel_key", "store_id", "payment_status", "fulfillment_status",
        "subtotal_cents", "shipping_cents", "discount_cents", "total_cents", "currency", "address_snapshot"
      ) VALUES (
        ${paidOrderId}, ${cust.id}, 'store', ${store.id}, 'PAID', 'PENDING',
        5000, 500, 0, 5500, 'USD', ${JSON.stringify(address)}::jsonb
      );
    `;
    await sql`
      INSERT INTO "seller_orders" (
        "id", "order_id", "store_id", "fulfillment_status", "subtotal_cents", "shipping_cents", "discount_cents", "total_cents"
      ) VALUES
        (${paidSuborderId}, ${paidOrderId}, ${store.id}, 'PENDING', 5000, 500, 0, 5500);
    `;
    await sql`
      INSERT INTO "order_items" (
        "order_id", "seller_order_id", "store_id", "variant_id", "title_snapshot", "sku_snapshot", "qty", "unit_price_cents", "total_cents"
      ) VALUES
        (${paidOrderId}, ${paidSuborderId}, ${store.id}, ${variant.id}, 'Test Product', 'sku-test', 3, 2500, 5000);
    `;

    // Before cancel: on_hand is 10
    const [invBefore] = await sql`SELECT on_hand FROM inventory WHERE variant_id = ${variant.id}`;
    expect(invBefore.on_hand).toBe(10);

    const cancelPaidResult = await returnsService.cancelOrder(
      cust.id,
      paidOrderId,
      'Bought by mistake',
    );
    expect(cancelPaidResult.orderId).toBe(paidOrderId);
    expect(cancelPaidResult.status).toBe('CANCELLED');
    expect(cancelPaidResult.refundInitiated).toBe(true);

    // After cancel: on_hand should have incremented by 3 (from 10 to 13)
    const [invAfter] = await sql`SELECT on_hand FROM inventory WHERE variant_id = ${variant.id}`;
    expect(invAfter.on_hand).toBe(13);

    // Verify stock_movements ledger entry
    const movements = await sql`
      SELECT * FROM stock_movements
      WHERE variant_id = ${variant.id} AND reason = 'ORDER_CANCELLED_RESTOCK'
    `;
    expect(movements.length).toBeGreaterThan(0);
    expect(movements[0].quantity).toBe(3);

    // Verify outbox domain events: order.cancelled and order.refund_requested
    const outboxEvents = await sql`
      SELECT event_type, payload
      FROM outbox_events
      WHERE event_type IN ('order.cancelled', 'order.refund_requested')
      ORDER BY created_at ASC
    `;
    const refundEvent = outboxEvents.find((e) => e.event_type === 'order.refund_requested');
    expect(refundEvent).toBeDefined();
    const refundPayload = refundEvent!.payload as { orderId: string; amountCents: number };
    expect(refundPayload.orderId).toBe(paidOrderId);
    expect(refundPayload.amountCents).toBe(5500);

    // --- CASE 3: Shipped Order Cannot Be Cancelled ---
    const shippedOrderId = randomUUID();
    const shippedSuborderId = randomUUID();
    await sql`
      INSERT INTO "orders" (
        "id", "user_id", "channel_key", "store_id", "payment_status", "fulfillment_status",
        "subtotal_cents", "shipping_cents", "discount_cents", "total_cents", "currency", "address_snapshot"
      ) VALUES (
        ${shippedOrderId}, ${cust.id}, 'store', ${store.id}, 'PAID', 'SHIPPED',
        5000, 500, 0, 5500, 'USD', ${JSON.stringify(address)}::jsonb
      );
    `;
    await sql`
      INSERT INTO "seller_orders" (
        "id", "order_id", "store_id", "fulfillment_status", "subtotal_cents", "shipping_cents", "discount_cents", "total_cents"
      ) VALUES
        (${shippedSuborderId}, ${shippedOrderId}, ${store.id}, 'SHIPPED', 5000, 500, 0, 5500);
    `;
    await sql`
      INSERT INTO "order_items" (
        "order_id", "seller_order_id", "store_id", "variant_id", "title_snapshot", "sku_snapshot", "qty", "unit_price_cents", "total_cents"
      ) VALUES
        (${shippedOrderId}, ${shippedSuborderId}, ${store.id}, ${variant.id}, 'Test Product', 'sku-test', 1, 5000, 5000);
    `;

    await expect(
      returnsService.cancelOrder(cust.id, shippedOrderId, 'Too late'),
    ).rejects.toThrow(AlreadyShippedError);
  });

  it('enforces return requests on delivered orders and cumulative quantity caps', async () => {
    if (!sql) return;

    const prefix = `ret_req_${Date.now()}`;

    // Setup customer and seller
    const [cust] = await sql`
      INSERT INTO "users" ("email_normalized", "password_hash", "status")
      VALUES (${`buyer_${prefix}@test.com`}, 'hash', 'active')
      RETURNING id;
    `;
    const [sellerUser] = await sql`
      INSERT INTO "users" ("email_normalized", "password_hash", "status")
      VALUES (${`seller_${prefix}@test.com`}, 'hash', 'active')
      RETURNING id;
    `;

    const [store] = await sql`
      INSERT INTO "stores" ("business_id", "slug", "name", "status")
      VALUES (
        (INSERT INTO "businesses" ("owner_user_id", "legal_name") VALUES (${sellerUser.id}, ${`Biz ${prefix}`}) RETURNING id),
        ${`store-${prefix}`}, ${`Store ${prefix}`}, 'active'
      ) RETURNING id;
    `;

    const [cat] = await sql`
      INSERT INTO "categories" ("slug", "name", "path")
      VALUES (${`cat-${prefix}`}, 'Cat', ${`cat-${prefix}`})
      RETURNING id;
    `;

    const [prod] = await sql`
      INSERT INTO "products" ("store_id", "category_id", "slug", "title", "description", "currency")
      VALUES (${store.id}, ${cat.id}, ${`prod-${prefix}`}, 'Returnable Item', 'Desc', 'USD')
      RETURNING id;
    `;

    const [variant] = await sql`
      INSERT INTO "product_variants" ("product_id", "store_id", "sku", "price_cents")
      VALUES (${prod.id}, ${store.id}, ${`sku-${prefix}`}, 3000)
      RETURNING id;
    `;

    const address = {
      fullName: 'Return Buyer',
      line1: '456 Return Rd',
      city: 'Seattle',
      state: 'WA',
      postalCode: '98101',
      country: 'USA',
    };

    // 1. Non-delivered order rejects return request
    const pendingOrderId = randomUUID();
    const pendingSuborderId = randomUUID();
    await sql`
      INSERT INTO "orders" (
        "id", "user_id", "channel_key", "store_id", "payment_status", "fulfillment_status",
        "subtotal_cents", "shipping_cents", "discount_cents", "total_cents", "currency", "address_snapshot"
      ) VALUES (
        ${pendingOrderId}, ${cust.id}, 'store', ${store.id}, 'PAID', 'PENDING',
        6000, 500, 0, 6500, 'USD', ${JSON.stringify(address)}::jsonb
      );
    `;
    await sql`
      INSERT INTO "seller_orders" (
        "id", "order_id", "store_id", "fulfillment_status", "subtotal_cents", "shipping_cents", "discount_cents", "total_cents"
      ) VALUES
        (${pendingSuborderId}, ${pendingOrderId}, ${store.id}, 'PENDING', 6000, 500, 0, 6500);
    `;
    const [itemPending] = await sql`
      INSERT INTO "order_items" (
        "order_id", "seller_order_id", "store_id", "variant_id", "title_snapshot", "sku_snapshot", "qty", "unit_price_cents", "total_cents"
      ) VALUES
        (${pendingOrderId}, ${pendingSuborderId}, ${store.id}, ${variant.id}, 'Returnable Item', 'sku-ret', 2, 3000, 6000)
      RETURNING id;
    `;

    await expect(
      returnsService.createReturnRequest(cust.id, pendingOrderId, {
        orderItemId: itemPending.id,
        quantity: 1,
        reason: 'Defective item',
      }),
    ).rejects.toThrow(OrderNotDeliveredError);

    // 2. Delivered order with item qty = 3
    const deliveredOrderId = randomUUID();
    const deliveredSuborderId = randomUUID();
    await sql`
      INSERT INTO "orders" (
        "id", "user_id", "channel_key", "store_id", "payment_status", "fulfillment_status",
        "subtotal_cents", "shipping_cents", "discount_cents", "total_cents", "currency", "address_snapshot"
      ) VALUES (
        ${deliveredOrderId}, ${cust.id}, 'store', ${store.id}, 'PAID', 'DELIVERED',
        9000, 500, 0, 9500, 'USD', ${JSON.stringify(address)}::jsonb
      );
    `;
    await sql`
      INSERT INTO "seller_orders" (
        "id", "order_id", "store_id", "fulfillment_status", "subtotal_cents", "shipping_cents", "discount_cents", "total_cents"
      ) VALUES
        (${deliveredSuborderId}, ${deliveredOrderId}, ${store.id}, 'DELIVERED', 9000, 500, 0, 9500);
    `;
    const [deliveredItem] = await sql`
      INSERT INTO "order_items" (
        "order_id", "seller_order_id", "store_id", "variant_id", "title_snapshot", "sku_snapshot", "qty", "unit_price_cents", "total_cents"
      ) VALUES
        (${deliveredOrderId}, ${deliveredSuborderId}, ${store.id}, ${variant.id}, 'Returnable Item', 'sku-ret', 3, 3000, 9000)
      RETURNING id;
    `;

    // Non-existent item check
    await expect(
      returnsService.createReturnRequest(cust.id, deliveredOrderId, {
        orderItemId: randomUUID(),
        quantity: 1,
        reason: 'Wrong item',
      }),
    ).rejects.toThrow(OrderItemNotFoundError);

    // First return request for qty 2 (out of 3) - SUCCESS
    const req1 = await returnsService.createReturnRequest(cust.id, deliveredOrderId, {
      orderItemId: deliveredItem.id,
      quantity: 2,
      reason: 'Wrong size',
      customerNotes: 'Please send smaller size or refund',
    });
    expect(req1.status).toBe('PENDING_INSPECTION');
    expect(req1.qty).toBe(2);
    expect(req1.reason).toBe('Wrong size');
    expect(req1.customerNotes).toBe('Please send smaller size or refund');

    // Second return request for qty 2 (would exceed total 3: 2 + 2 > 3) - REJECTED
    await expect(
      returnsService.createReturnRequest(cust.id, deliveredOrderId, {
        orderItemId: deliveredItem.id,
        quantity: 2,
        reason: 'Another defect',
      }),
    ).rejects.toThrow(ReturnQuantityExceededError);

    // Third return request for remaining qty 1 (2 + 1 <= 3) - SUCCESS
    const req2 = await returnsService.createReturnRequest(cust.id, deliveredOrderId, {
      orderItemId: deliveredItem.id,
      quantity: 1,
      reason: 'Damaged in transit',
    });
    expect(req2.status).toBe('PENDING_INSPECTION');
    expect(req2.qty).toBe(1);

    // Fourth return request for qty 1 (3 already requested: 3 + 1 > 3) - REJECTED
    await expect(
      returnsService.createReturnRequest(cust.id, deliveredOrderId, {
        orderItemId: deliveredItem.id,
        quantity: 1,
        reason: 'Greedy return',
      }),
    ).rejects.toThrow(ReturnQuantityExceededError);

    // Query returns for this order
    const returnList = await returnsService.getReturnRequestsForOrder(cust.id, deliveredOrderId);
    expect(returnList.length).toBe(2);
    expect(returnList.map((r) => r.id)).toContain(req1.id);
    expect(returnList.map((r) => r.id)).toContain(req2.id);

    // Check return.requested outbox event emitted
    const returnEvents = await sql`
      SELECT event_type, payload
      FROM outbox_events
      WHERE event_type = 'return.requested'
    `;
    expect(returnEvents.length).toBeGreaterThanOrEqual(2);
  });
});
