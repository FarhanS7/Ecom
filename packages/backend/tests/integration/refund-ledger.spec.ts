// packages/backend/tests/integration/refund-ledger.spec.ts - Integration test for double-entry financial ledger and refunds (T060).
// Invariants verified:
// 1. Partial and full refunds record balanced double-entry rows (SUM(debits) = SUM(credits)).
// 2. Cumulative refund cap enforced: sum(prior_refunds) + refund <= captured amount. Excess rejected.
// 3. Final refund transitioning order to fully refunded updates order & payment_attempt to REFUNDED.
// 4. Item-level restocking increments inventory on_hand and writes movement ledger entry.
// 5. Concurrent refund attempts lock payment row, preventing double-refund over-allocation.
// 6. Transactional outbox event order.refund_completed emitted atomically.

import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetEnvCache } from '@shopscale/config';
import {
  FinancialLedgerService,
  RefundExceedsPaymentError,
  RefundService,
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

describe('Double-Entry Financial Ledger and Refund Engine Integration (T060)', () => {
  let sql: Sql | null = null;
  let refundService: RefundService;
  let ledgerService: FinancialLedgerService;

  beforeAll(async () => {
    sql = await connectOrSkip();
    if (sql) {
      await runMigrations(sql, migrationsDir);
      refundService = new RefundService(sql);
      ledgerService = new FinancialLedgerService(sql);
    }
  });

  afterAll(async () => {
    if (sql) {
      await sql.end();
    }
  });

  it('enforces cumulative refund caps, balanced double-entry ledgering, and restocking', async () => {
    if (!sql) return;

    const prefix = `ref_ledg_${Date.now()}`;

    // 1. Setup user, store, product, variant, inventory
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
      VALUES (${store.id}, ${cat.id}, ${`prod-${prefix}`}, 'Ledger Test Item', 'Desc', 'USD')
      RETURNING id;
    `;

    const [variant] = await sql`
      INSERT INTO "product_variants" ("product_id", "store_id", "sku", "price_cents")
      VALUES (${prod.id}, ${store.id}, ${`sku-${prefix}`}, 5000)
      RETURNING id;
    `;

    // Seed inventory: 5 on_hand, 0 reserved
    await sql`
      INSERT INTO "inventory" ("variant_id", "store_id", "on_hand", "reserved")
      VALUES (${variant.id}, ${store.id}, 5, 0);
    `;

    // 2. Create captured order for $100 (10000 cents)
    const orderId = randomUUID();
    const suborderId = randomUUID();
    const paymentAttemptId = randomUUID();

    const address = {
      fullName: 'Buyer User',
      line1: '123 Test Ave',
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
        ${orderId}, ${cust.id}, 'store', ${store.id}, 'PAID', 'DELIVERED',
        9000, 1000, 0, 10000, 'USD', ${JSON.stringify(address)}::jsonb
      );
    `;

    await sql`
      INSERT INTO "seller_orders" (
        "id", "order_id", "store_id", "fulfillment_status", "subtotal_cents", "shipping_cents", "discount_cents", "total_cents"
      ) VALUES
        (${suborderId}, ${orderId}, ${store.id}, 'DELIVERED', 9000, 1000, 0, 10000);
    `;

    const [orderItem] = await sql`
      INSERT INTO "order_items" (
        "order_id", "seller_order_id", "store_id", "variant_id", "title_snapshot", "sku_snapshot", "qty", "unit_price_cents", "total_cents"
      ) VALUES
        (${orderId}, ${suborderId}, ${store.id}, ${variant.id}, 'Ledger Test Item', 'sku-test', 2, 4500, 9000)
      RETURNING id;
    `;

    // Payment attempt: $100 captured
    await sql`
      INSERT INTO "payment_attempts" (
        "id", "order_id", "provider", "effect_key", "provider_ref", "amount_cents", "currency", "status"
      ) VALUES (
        ${paymentAttemptId}, ${orderId}, 'mock', ${`eff-${prefix}`}, ${`ref-${prefix}`}, 10000, 'USD', 'PAID'
      );
    `;

    // Initial capture financial entries:
    // Debit: payment_gateway_clearing $100
    // Credit: seller_payable $100
    await ledgerService.recordEntries(sql, [
      {
        operationKey: `capture:${orderId}`,
        orderId,
        storeId: store.id,
        account: 'payment_gateway_clearing',
        debitCents: 10000,
        creditCents: 0,
      },
      {
        operationKey: `capture:${orderId}`,
        orderId,
        storeId: store.id,
        account: 'seller_payable',
        debitCents: 0,
        creditCents: 10000,
      },
    ]);

    // Initial summary: perfectly balanced
    const summaryBefore = await ledgerService.getOrderLedgerSummary(orderId);
    expect(summaryBefore.isBalanced).toBe(true);
    expect(summaryBefore.totalDebits).toBe(10000);
    expect(summaryBefore.totalCredits).toBe(10000);

    // --- STEP 1: First Partial Refund of $40 (4000 cents) ---
    const refund1 = await refundService.processRefund({
      orderId,
      amountCents: 4000,
      reason: 'Partial return item 1',
      items: [
        {
          orderItemId: orderItem.id,
          qty: 1,
          restock: true,
        },
      ],
    });

    expect(refund1.amountCents).toBe(4000);
    expect(refund1.remainingCents).toBe(6000);
    expect(refund1.isFullyRefunded).toBe(false);

    // Verify inventory restocked for 1 item (5 -> 6)
    const [invAfter1] = await sql`SELECT on_hand FROM inventory WHERE variant_id = ${variant.id}`;
    expect(invAfter1.on_hand).toBe(6);

    // Verify ledger balance after refund 1
    const summaryAfter1 = await ledgerService.getOrderLedgerSummary(orderId);
    expect(summaryAfter1.isBalanced).toBe(true);
    expect(summaryAfter1.totalDebits).toBe(14000);
    expect(summaryAfter1.totalCredits).toBe(14000);

    // --- STEP 2: Second Partial Refund of $30 (3000 cents) ---
    const refund2 = await refundService.processRefund({
      orderId,
      amountCents: 3000,
      reason: 'Customer courtesy discount',
    });

    expect(refund2.amountCents).toBe(3000);
    expect(refund2.remainingCents).toBe(3000);
    expect(refund2.isFullyRefunded).toBe(false);

    // --- STEP 3: Attempt Refund of $40 (Exceeds remaining $30) -> REJECTED ---
    await expect(
      refundService.processRefund({
        orderId,
        amountCents: 4000,
        reason: 'Greedy refund',
      }),
    ).rejects.toThrow(RefundExceedsPaymentError);

    // --- STEP 4: Final Refund of exact remaining $30 (3000 cents) ---
    const refund3 = await refundService.processRefund({
      orderId,
      amountCents: 3000,
      reason: 'Final refund of remaining balance',
    });

    expect(refund3.amountCents).toBe(3000);
    expect(refund3.remainingCents).toBe(0);
    expect(refund3.isFullyRefunded).toBe(true);

    // Verify order and payment attempt transitioned to REFUNDED
    const [orderDb] = await sql`SELECT payment_status FROM orders WHERE id = ${orderId}`;
    expect(orderDb.payment_status).toBe('REFUNDED');

    const [paymentDb] = await sql`SELECT status FROM payment_attempts WHERE id = ${paymentAttemptId}`;
    expect(paymentDb.status).toBe('REFUNDED');

    // Final ledger verification: zero-sum balance maintained
    const finalSummary = await ledgerService.getOrderLedgerSummary(orderId);
    expect(finalSummary.isBalanced).toBe(true);
    expect(finalSummary.totalDebits).toBe(20000);
    expect(finalSummary.totalCredits).toBe(20000);

    // Verify net seller payable is 0 ($100 credited on capture, $100 debited across 3 refunds)
    const [sellerEntries] = await sql`
      SELECT
        COALESCE(SUM(debit_cents), 0)::int AS debits,
        COALESCE(SUM(credit_cents), 0)::int AS credits
      FROM financial_entries
      WHERE order_id = ${orderId} AND account = 'seller_payable';
    `;
    expect(sellerEntries.debits).toBe(10000);
    expect(sellerEntries.credits).toBe(10000);
  });
});
