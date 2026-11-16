// packages/backend/tests/integration/checkout-expiry-race.spec.ts - Integration test for checkout expiry race (T053).
// Proves the critical commerce race condition:
// 1. Customer 1 initiates checkout with stock = 1; reservation locks the single unit.
// 2. Reservation expires via background sweep; available stock is restored to 1.
// 3. Customer 2 purchases and completes payment for the restored unit; stock drops to 0.
// 4. Delayed payment arrives for Customer 1.
// 5. System detects expired reservation, triggers automated refund compensation,
//    and guarantees zero overselling (on_hand remains exactly 0).

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

describe('Checkout Expiry Race Condition & Automated Compensation Proof (T053)', () => {
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

  it('safely compensates late payment after reservation was expired and sold to competitor without overselling', async () => {
    if (!sql) return;

    const prefix = `race_${Date.now()}`;

    // 1. Seed store, catalog, and variant with physical on_hand = 1
    const [user1] = await sql`
      INSERT INTO "users" ("email_normalized", "password_hash", "status")
      VALUES (${`cust1_${prefix}@test.com`}, 'hash', 'active')
      RETURNING id;
    `;

    const [user2] = await sql`
      INSERT INTO "users" ("email_normalized", "password_hash", "status")
      VALUES (${`cust2_${prefix}@test.com`}, 'hash', 'active')
      RETURNING id;
    `;

    const [biz] = await sql`
      INSERT INTO "businesses" ("owner_user_id", "legal_name")
      VALUES (${user1.id}, ${`Biz ${prefix}`})
      RETURNING id;
    `;

    const [store] = await sql`
      INSERT INTO "stores" ("business_id", "slug", "name", "status")
      VALUES (${biz.id}, ${`store-${prefix}`}, ${`Store ${prefix}`}, 'active')
      RETURNING id;
    `;

    const [cat] = await sql`
      INSERT INTO "categories" ("slug", "name", "path")
      VALUES (${`cat-${prefix}`}, 'Race Cat', ${`cat-${prefix}`})
      RETURNING id;
    `;

    const [prod] = await sql`
      INSERT INTO "products" ("store_id", "category_id", "slug", "title", "description", "currency")
      VALUES (${store.id}, ${cat.id}, ${`prod-${prefix}`}, 'Last Item in Stock', 'Race Test Item', 'USD')
      RETURNING id;
    `;

    const [variant] = await sql`
      INSERT INTO "product_variants" ("product_id", "store_id", "sku", "price_cents")
      VALUES (${prod.id}, ${store.id}, ${`sku-${prefix}`}, 5000)
      RETURNING id;
    `;

    // Only 1 physical unit in warehouse!
    await sql`
      INSERT INTO "inventory" ("variant_id", "store_id", "on_hand", "reserved")
      VALUES (${variant.id}, ${store.id}, 1, 0);
    `;

    // 2. Step 2: Customer 1 initiates checkout for the 1 unit
    const order1Id = randomUUID();
    const sellerOrder1Id = randomUUID();

    await sql`
      INSERT INTO "orders" (
        "id", "user_id", "channel_key", "store_id", "payment_status", "fulfillment_status",
        "subtotal_cents", "shipping_cents", "discount_cents", "total_cents", "currency",
        "address_snapshot", "version"
      ) VALUES (
        ${order1Id}, ${user1.id}, ${prefix}, ${store.id}, 'PENDING', 'PENDING',
        5000, 0, 0, 5000, 'USD', '{}'::jsonb, 1
      );
    `;

    await sql`
      INSERT INTO "seller_orders" (
        "id", "order_id", "store_id", "fulfillment_status",
        "subtotal_cents", "shipping_cents", "discount_cents", "total_cents"
      ) VALUES (
        ${sellerOrder1Id}, ${order1Id}, ${store.id}, 'PENDING',
        5000, 0, 0, 5000
      );
    `;

    const reserve1 = await inventoryService.reserve(sql, {
      checkoutId: order1Id,
      items: [{ variantId: variant.id, qty: 1 }],
      ttlSeconds: 60,
    });
    expect(reserve1.ok).toBe(true);

    // Stock check after Customer 1: on_hand = 1, reserved = 1, available = 0
    const [invAfterCust1] = await sql`
      SELECT on_hand, reserved FROM inventory WHERE variant_id = ${variant.id};
    `;
    expect(invAfterCust1.on_hand).toBe(1);
    expect(invAfterCust1.reserved).toBe(1);

    // 3. Step 3: Artificially expire Customer 1's reservation
    await sql`
      UPDATE "stock_reservations"
      SET "expires_at" = NOW() - INTERVAL '10 seconds'
      WHERE "cart_id" = ${order1Id};
    `;

    // Trigger expiry sweep
    const sweepResult = await inventoryService.releaseExpiredReservations(100, sql);
    expect(sweepResult.releasedCount).toBeGreaterThanOrEqual(1);

    // Reservation is now expired; available stock restored to 1!
    const [reservation1] = await sql`
      SELECT status FROM stock_reservations WHERE cart_id = ${order1Id};
    `;
    expect(reservation1.status).toBe('expired');

    const [invAfterExpiry] = await sql`
      SELECT on_hand, reserved FROM inventory WHERE variant_id = ${variant.id};
    `;
    expect(invAfterExpiry.on_hand).toBe(1);
    expect(invAfterExpiry.reserved).toBe(0);

    // 4. Step 4: Customer 2 snaps up the released unit and completes payment!
    const order2Id = randomUUID();
    const sellerOrder2Id = randomUUID();

    await sql`
      INSERT INTO "orders" (
        "id", "user_id", "channel_key", "store_id", "payment_status", "fulfillment_status",
        "subtotal_cents", "shipping_cents", "discount_cents", "total_cents", "currency",
        "address_snapshot", "version"
      ) VALUES (
        ${order2Id}, ${user2.id}, ${prefix}, ${store.id}, 'PENDING', 'PENDING',
        5000, 0, 0, 5000, 'USD', '{}'::jsonb, 1
      );
    `;

    await sql`
      INSERT INTO "seller_orders" (
        "id", "order_id", "store_id", "fulfillment_status",
        "subtotal_cents", "shipping_cents", "discount_cents", "total_cents"
      ) VALUES (
        ${sellerOrder2Id}, ${order2Id}, ${store.id}, 'PENDING',
        5000, 0, 0, 5000
      );
    `;

    const reserve2 = await inventoryService.reserve(sql, {
      checkoutId: order2Id,
      items: [{ variantId: variant.id, qty: 1 }],
    });
    expect(reserve2.ok).toBe(true);

    // Customer 2 pays immediately
    const cust2PaidResult = await sagaService.handlePaymentObserved({
      aggregateId: order2Id,
      payload: {
        status: 'PAID',
        type: 'payment.succeeded',
        amountCents: '5000',
      },
    });
    expect(cust2PaidResult.status).toBe('confirmed');

    // Customer 2 got the item! Inventory is completely SOLD OUT (0 on_hand, 0 reserved)
    const [invAfterCust2] = await sql`
      SELECT on_hand, reserved FROM inventory WHERE variant_id = ${variant.id};
    `;
    expect(invAfterCust2.on_hand).toBe(0);
    expect(invAfterCust2.reserved).toBe(0);

    // 5. Step 5: Delayed payment arrives for Customer 1!
    const lateEventId = randomUUID();
    const cust1LateResult = await sagaService.handlePaymentObserved({
      aggregateId: order1Id,
      payload: {
        eventId: lateEventId,
        status: 'PAID',
        type: 'payment.succeeded',
        amountCents: '5000',
        effectKey: `eff_late_${order1Id}`,
      },
      causationId: lateEventId,
    });

    // 6. Step 6: INVARIANT PROOFS
    // Proof A: System refused to confirm Order 1, compensating via refund instead!
    expect(cust1LateResult.status).toBe('compensated');
    expect(cust1LateResult.orderId).toBe(order1Id);

    // Proof B: Order 1 is marked REFUNDED and CANCELLED
    const [order1Row] = await sql`
      SELECT payment_status, fulfillment_status FROM orders WHERE id = ${order1Id};
    `;
    expect(order1Row.payment_status).toBe('REFUNDED');
    expect(order1Row.fulfillment_status).toBe('CANCELLED');

    // Proof C: Seller order 1 is marked CANCELLED
    const [sellerOrder1Row] = await sql`
      SELECT fulfillment_status FROM seller_orders WHERE id = ${sellerOrder1Id};
    `;
    expect(sellerOrder1Row.fulfillment_status).toBe('CANCELLED');

    // Proof D: Outbox table has order.refund_requested event for payment processor refund
    const [outboxRefund] = await sql`
      SELECT event_type, payload FROM outbox WHERE causation_id = ${lateEventId};
    `;
    expect(outboxRefund).toBeDefined();
    expect(outboxRefund.event_type).toBe('order.refund_requested');
    expect((outboxRefund.payload as { reason: string }).reason).toBe('RESERVATION_EXPIRED');

    // Proof E: ABSOLUTE ZERO OVERSELLING - on_hand is exactly 0, NEVER negative!
    const [finalInv] = await sql`
      SELECT on_hand, reserved FROM inventory WHERE variant_id = ${variant.id};
    `;
    expect(finalInv.on_hand).toBe(0);
    expect(finalInv.reserved).toBe(0);

    // Proof F: Customer 2's Order 2 was not harmed or corrupted
    const [order2Row] = await sql`
      SELECT payment_status, fulfillment_status FROM orders WHERE id = ${order2Id};
    `;
    expect(order2Row.payment_status).toBe('PAID');
    expect(order2Row.fulfillment_status).toBe('PENDING');
  });
});
