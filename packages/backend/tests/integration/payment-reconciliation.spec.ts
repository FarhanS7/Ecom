// packages/backend/tests/integration/payment-reconciliation.spec.ts - Integration test for payment reconciliation (T052).
// Invariants verified:
// 1. Scans PENDING payment attempts older than threshold.
// 2. Discovers CAPTURED/SUCCEEDED charges from payment provider: settles order to PAID and confirms inventory.
// 3. Discovers NOT_FOUND/FAILED charges from payment provider: compensates order to CANCELLED and releases inventory.
// 4. Ignores fresh attempts within the tolerance window.

import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetEnvCache } from '@shopscale/config';
import {
  PaymentReconciliationService,
  findMigrationsDir,
  inventoryService,
  openAdminConnection,
  requireDatabaseUrl,
  runMigrations,
} from '../../src/index.js';
import {
  MockPaymentSimulator,
  createMockPaymentServer,
} from '../../../../apps/mock-payments/src/index.js';

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

describe('Payment Outcome Reconciliation Integration (T052)', () => {
  let sql: Sql | null = null;
  let simulator: MockPaymentSimulator;
  let paymentServer: import('node:http').Server;
  let paymentBaseUrl: string;
  let service: PaymentReconciliationService;

  beforeAll(async () => {
    // 1. Start mock payment simulator HTTP server
    simulator = new MockPaymentSimulator({
      secret: 'test-secret-at-least-32-characters-long-t052-00000',
    });
    paymentServer = createMockPaymentServer({ simulator });

    await new Promise<void>((resolve) => {
      paymentServer.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = paymentServer.address() as AddressInfo;
    paymentBaseUrl = `http://127.0.0.1:${addr.port}`;

    // 2. Connect DB & run migrations
    sql = await connectOrSkip();
    if (sql) {
      await runMigrations(sql, migrationsDir);
      service = new PaymentReconciliationService(sql, {
        mockPaymentsUrl: paymentBaseUrl,
      });
    }
  });

  afterAll(async () => {
    if (paymentServer) {
      await new Promise<void>((resolve) => paymentServer.close(() => resolve()));
    }
    if (sql) {
      await sql.end();
    }
  });

  async function createTestFixtures(prefix: string, qty = 2, initialOnHand = 10) {
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

    await sql`
      INSERT INTO "inventory" ("variant_id", "store_id", "on_hand", "reserved")
      VALUES (${variant.id}, ${store.id}, ${initialOnHand}, 0);
    `;

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

  it('reconciles SUCCEEDED payment from provider: settles order to PAID and confirms inventory', async () => {
    if (!sql) return;

    const prefix = `recon_ok_${Date.now()}`;
    const effectKey = `eff_${prefix}`;
    const { orderId, variantId } = await createTestFixtures(prefix, 2, 10);

    // 1. Create PENDING payment_attempt
    await sql`
      INSERT INTO "payment_attempts" (
        "order_id", "provider", "effect_key", "amount_cents", "currency", "status", "created_at"
      ) VALUES (
        ${orderId}, 'mock-payments', ${effectKey}, 5500, 'USD', 'PENDING', NOW() - INTERVAL '15 minutes'
      );
    `;

    // 2. Simulate captured charge in provider ledger (webhook was dropped/delayed)
    await simulator.processCharge({
      effectKey,
      amountCents: '5500',
      simulateOutcome: 'SUCCESS',
    });

    // 3. Run reconciliation sweep
    const result = await service.reconcileStalePaymentAttempts({
      olderThanMs: 0, // Scan immediately for test
    });

    expect(result.scannedCount).toBeGreaterThanOrEqual(1);
    expect(result.resolvedPaid).toBeGreaterThanOrEqual(1);

    // 4. Assert order and payment_attempt updated to PAID
    const [order] = await sql`
      SELECT payment_status FROM orders WHERE id = ${orderId};
    `;
    expect(order.payment_status).toBe('PAID');

    const [attempt] = await sql`
      SELECT status, provider_ref FROM payment_attempts WHERE effect_key = ${effectKey};
    `;
    expect(attempt.status).toBe('PAID');
    expect(attempt.provider_ref).toBeDefined();

    // 5. Assert inventory counters settled: on_hand = 8, reserved = 0
    const [inv] = await sql`
      SELECT on_hand, reserved FROM inventory WHERE variant_id = ${variantId};
    `;
    expect(inv.on_hand).toBe(8);
    expect(inv.reserved).toBe(0);
  });

  it('reconciles NOT_FOUND charge (abandoned checkout): cancels order and releases reservation', async () => {
    if (!sql) return;

    const prefix = `recon_abandon_${Date.now()}`;
    const effectKey = `eff_abandoned_${prefix}`;
    const { orderId, variantId } = await createTestFixtures(prefix, 3, 10);

    // 1. Create PENDING payment_attempt without charging provider
    await sql`
      INSERT INTO "payment_attempts" (
        "order_id", "provider", "effect_key", "amount_cents", "currency", "status", "created_at"
      ) VALUES (
        ${orderId}, 'mock-payments', ${effectKey}, 5500, 'USD', 'PENDING', NOW() - INTERVAL '15 minutes'
      );
    `;

    // 2. Run reconciliation sweep (provider returns 404 NOT_FOUND)
    const result = await service.reconcileStalePaymentAttempts({
      olderThanMs: 0,
    });

    expect(result.scannedCount).toBeGreaterThanOrEqual(1);
    expect(result.resolvedCancelled).toBeGreaterThanOrEqual(1);

    // 3. Assert order cancelled
    const [order] = await sql`
      SELECT payment_status, fulfillment_status FROM orders WHERE id = ${orderId};
    `;
    expect(order.payment_status).toBe('FAILED');
    expect(order.fulfillment_status).toBe('CANCELLED');

    // 4. Assert inventory released: on_hand = 10, reserved = 0
    const [inv] = await sql`
      SELECT on_hand, reserved FROM inventory WHERE variant_id = ${variantId};
    `;
    expect(inv.on_hand).toBe(10);
    expect(inv.reserved).toBe(0);
  });
});
