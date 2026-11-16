// packages/backend/tests/integration/idempotency-concurrency.spec.ts - Integration test for concurrency idempotency storms (T054).
// Invariants verified (G3, OR-1, OR-3):
// 1. 20 concurrent identical checkout requests produce exactly 1 order, 1 seller suborder, and 1 stock reservation.
// 2. All 20 callers receive identical orderId and paymentEffectKey without race corruption.
// 3. 20 concurrent identical payment webhooks resolve with 200 OK and insert exactly 1 webhook_events row.
// 4. Exactly 1 order.payment_observed domain event is emitted to transactional outbox.
// 5. Zero duplicate charges, zero overselling, zero deadlocks.

import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetEnvCache } from '@shopscale/config';
import {
  CheckoutService,
  WebhookService,
  findMigrationsDir,
  generateWebhookSignature,
  openAdminConnection,
  quoteService,
  requireDatabaseUrl,
  runMigrations,
} from '../../src/index.js';
import type { PaymentWebhookPayload } from '@shopscale/contracts';

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

describe('Idempotency Storm & Duplicate Webhook Safety (T054)', () => {
  const SECRET = 'test-secret-at-least-32-chars-long-t054-000000000';
  let sql: Sql | null = null;
  let checkoutService: CheckoutService;
  let webhookService: WebhookService;

  beforeAll(async () => {
    sql = await connectOrSkip();
    if (sql) {
      await runMigrations(sql, migrationsDir);
      checkoutService = new CheckoutService(sql);
      webhookService = new WebhookService(sql);
    }
  });

  afterAll(async () => {
    if (sql) {
      await sql.end();
    }
  });

  async function createTestWorld(prefix: string) {
    if (!sql) throw new Error('Database not connected');

    const [user] = await sql`
      INSERT INTO "users" ("email_normalized", "password_hash", "status")
      VALUES (${`${prefix}@test.com`}, 'hash', 'active')
      RETURNING id;
    `;

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

    const [cat] = await sql`
      INSERT INTO "categories" ("slug", "name", "path")
      VALUES (${`cat-${prefix}`}, 'Storm Cat', ${`cat-${prefix}`})
      RETURNING id;
    `;

    const [prod] = await sql`
      INSERT INTO "products" ("store_id", "category_id", "slug", "title", "description", "currency")
      VALUES (${store.id}, ${cat.id}, ${`prod-${prefix}`}, 'Storm Item', 'Desc', 'USD')
      RETURNING id;
    `;

    const [variant] = await sql`
      INSERT INTO "product_variants" ("product_id", "store_id", "sku", "price_cents")
      VALUES (${prod.id}, ${store.id}, ${`sku-${prefix}`}, 2000)
      RETURNING id;
    `;

    await sql`
      INSERT INTO "inventory" ("variant_id", "store_id", "on_hand", "reserved")
      VALUES (${variant.id}, ${store.id}, 10, 0);
    `;

    const [address] = await sql`
      INSERT INTO "addresses" ("user_id", "fields")
      VALUES (${user.id}, '{"street":"123 Main St","city":"Metropolis"}'::jsonb)
      RETURNING id;
    `;

    return {
      userId: user.id,
      storeId: store.id,
      variantId: variant.id,
      addressId: address.id,
    };
  }

  it('20 concurrent identical checkout requests produce exactly 1 order, 1 reservation, and 1 outbox event (G3, OR-1)', async () => {
    if (!sql) return;

    const prefix = `storm_chk_${Date.now()}`;
    const world = await createTestWorld(prefix);

    // Calculate valid signed quote token for 2 units
    const quote = await quoteService.calculateQuote({
      channelKey: 'marketplace',
      items: [{ variantId: world.variantId, qty: 2 }],
    });

    const sharedIdempotencyKey = `idem_key_${prefix}`;
    const CONCURRENCY_BURST = 20;

    // Fire 20 concurrent requests simultaneously with the same Idempotency-Key
    const promises = Array.from({ length: CONCURRENCY_BURST }, () =>
      checkoutService.initiateCheckout({
        userId: world.userId,
        channelKey: 'marketplace',
        quoteToken: quote.quoteToken,
        addressId: world.addressId,
        idempotencyKey: sharedIdempotencyKey,
      }),
    );

    const results = await Promise.all(promises);

    // 1. All 20 callers must receive identical orderId and paymentEffectKey
    const firstOrderId = results[0]!.orderId;
    const firstEffectKey = results[0]!.paymentEffectKey;

    for (const r of results) {
      expect(r.orderId).toBe(firstOrderId);
      expect(r.paymentEffectKey).toBe(firstEffectKey);
      expect(r.totalCents).toBe(4000); // 2 units * 2000 cents
    }

    // 2. Database Assertions: Exactly 1 parent order created
    const orderCount = (await sql`
      SELECT COUNT(*)::int as count FROM orders WHERE id = ${firstOrderId};
    `)[0].count;
    expect(orderCount).toBe(1);

    // 3. Exactly 1 seller suborder created
    const suborderCount = (await sql`
      SELECT COUNT(*)::int as count FROM seller_orders WHERE order_id = ${firstOrderId};
    `)[0].count;
    expect(suborderCount).toBe(1);

    // 4. Exactly 1 reservation created for 2 units (no duplicate reservations)
    const reservationRows = await sql`
      SELECT id, quantity, status FROM stock_reservations WHERE cart_id = ${firstOrderId};
    `;
    expect(reservationRows).toHaveLength(1);
    expect(reservationRows[0]!.quantity).toBe(2);
    expect(reservationRows[0]!.status).toBe('active');

    // 5. Inventory counters: reserved must be 2, on_hand must be 10 (available = 8)
    const [inv] = await sql`
      SELECT on_hand, reserved FROM inventory WHERE variant_id = ${world.variantId};
    `;
    expect(inv.on_hand).toBe(10);
    expect(inv.reserved).toBe(2);

    // 6. Outbox table: exactly 1 order.checkout_reserved domain event
    const outboxCount = (await sql`
      SELECT COUNT(*)::int as count
      FROM outbox
      WHERE aggregate_id = ${firstOrderId} AND event_type = 'order.checkout_reserved';
    `)[0].count;
    expect(outboxCount).toBe(1);

    // 7. Idempotency table: exactly 1 COMPLETED request with cached response
    const [idemRow] = await sql`
      SELECT status, response_status FROM idempotency_requests
      WHERE user_id = ${world.userId} AND idempotency_key = ${sharedIdempotencyKey};
    `;
    expect(idemRow.status).toBe('COMPLETED');
    expect(idemRow.response_status).toBe(201);
  });

  it('20 concurrent identical payment webhook deliveries produce exactly 1 confirmation and 1 outbox event (G3, OR-3)', async () => {
    if (!sql) return;

    const prefix = `storm_wh_${Date.now()}`;
    const effectKey = `eff_${prefix}`;
    const eventId = randomUUID();

    // 1. Seed order and pending attempt
    const [order] = await sql`
      INSERT INTO "orders" (
        "user_id", "channel_key", "payment_status", "fulfillment_status",
        "subtotal_cents", "shipping_cents", "discount_cents", "total_cents",
        "currency", "address_snapshot", "version"
      ) VALUES (
        gen_random_uuid(), ${prefix}, 'PENDING', 'PENDING',
        3000, 300, 0, 3300,
        'USD', '{}'::jsonb, 1
      ) RETURNING id;
    `;

    await sql`
      INSERT INTO "payment_attempts" (
        "order_id", "provider", "effect_key", "amount_cents", "currency", "status"
      ) VALUES (
        ${order.id}, 'mock-payments', ${effectKey}, 3300, 'USD', 'PENDING'
      );
    `;

    // 2. Prepare signed webhook payload
    const now = Math.floor(Date.now() / 1000);
    const payload: PaymentWebhookPayload = {
      eventId,
      type: 'payment.succeeded',
      effectKey,
      amountCents: '3300',
      providerRef: `ref_storm_${prefix}`,
      timestamp: now,
    };
    const rawBody = JSON.stringify(payload);
    const signature = generateWebhookSignature(rawBody, SECRET, now);

    // 3. Fire 20 identical webhook deliveries simultaneously
    const CONCURRENCY_BURST = 20;
    const promises = Array.from({ length: CONCURRENCY_BURST }, () =>
      webhookService.ingestPaymentWebhook({
        provider: 'mock-payments',
        rawBody,
        signatureHeader: signature,
        timestampHeader: String(now),
        secret: SECRET,
      }),
    );

    const results = await Promise.all(promises);

    // 4. Assert all 20 calls succeeded (at least one processed, the rest duplicate)
    for (const r of results) {
      expect(r.eventId).toBe(eventId);
      expect(['processed', 'duplicate']).toContain(r.status);
    }

    const processedCount = results.filter((r) => r.status === 'processed').length;
    expect(processedCount).toBe(1);

    const duplicateCount = results.filter((r) => r.status === 'duplicate').length;
    expect(duplicateCount).toBe(CONCURRENCY_BURST - 1);

    // 5. Database Assertions: Exactly 1 webhook_events row
    const eventCount = (await sql`
      SELECT COUNT(*)::int as count
      FROM webhook_events
      WHERE provider = 'mock-payments' AND event_id = ${eventId};
    `)[0].count;
    expect(eventCount).toBe(1);

    // 6. Payment attempt status updated to PAID exactly once
    const [attempt] = await sql`
      SELECT status, provider_ref FROM payment_attempts WHERE effect_key = ${effectKey};
    `;
    expect(attempt.status).toBe('PAID');
    expect(attempt.provider_ref).toBe(`ref_storm_${prefix}`);

    // 7. Transactional outbox has exactly 1 order.payment_observed domain event
    const outboxCount = (await sql`
      SELECT COUNT(*)::int as count FROM outbox WHERE causation_id = ${eventId};
    `)[0].count;
    expect(outboxCount).toBe(1);
  });
});
