// packages/backend/tests/integration/settlements.spec.ts - Integration test for simulated seller settlements (T070).
// Invariants verified:
// 1. Delivered orders aggregate into gross sales for the period.
// 2. Completed refunds for the store deduct from gross sales before commission calculation.
// 3. Platform commission applied based on business commission_bps (e.g. 1000 = 10.00%).
// 4. Double-entry financial ledger records balanced entries (Debit seller_payable, Credit platform_commission, Credit payment_gateway_clearing).
// 5. Idempotent settlement generation prevents duplicate disbursements.
// 6. Negative balances from excessive refunds carry forward to subsequent periods.

import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetEnvCache } from '@shopscale/config';
import {
  SettlementService,
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

describe('Simulated Seller Settlement Integration (T070)', () => {
  let sql: Sql | null = null;
  let settlementService: SettlementService;

  beforeAll(async () => {
    sql = await connectOrSkip();
    if (sql) {
      await runMigrations(sql, migrationsDir);
      settlementService = new SettlementService(sql);
    }
  });

  afterAll(async () => {
    if (sql) {
      await sql.end();
    }
  });

  it('calculates periodic net sales, commission split, balanced financial ledger, and idempotency', async () => {
    if (!sql) return;

    const prefix = `stl_${Date.now()}`;

    // 1. Setup buyer, seller, business (1000 bps = 10%), store, category, product, variant
    const [buyer] = await sql`
      INSERT INTO "users" ("email_normalized", "password_hash", "status")
      VALUES (${`buyer_${prefix}@test.com`}, 'hash', 'active')
      RETURNING id;
    `;

    const [seller] = await sql`
      INSERT INTO "users" ("email_normalized", "password_hash", "status")
      VALUES (${`seller_${prefix}@test.com`}, 'hash', 'active')
      RETURNING id;
    `;

    const [biz] = await sql`
      INSERT INTO "businesses" ("owner_user_id", "legal_name", "commission_bps")
      VALUES (${seller.id}, ${`Settlement Biz ${prefix}`}, 1000)
      RETURNING id;
    `;

    const [store] = await sql`
      INSERT INTO "stores" ("business_id", "slug", "name", "status")
      VALUES (${biz.id}, ${`store-${prefix}`}, ${`Store ${prefix}`}, 'active')
      RETURNING id;
    `;

    const [cat] = await sql`
      INSERT INTO "categories" ("slug", "name", "path")
      VALUES (${`cat-${prefix}`}, 'Category', ${`cat-${prefix}`})
      RETURNING id;
    `;

    const [prod] = await sql`
      INSERT INTO "products" ("store_id", "category_id", "slug", "title", "description", "currency")
      VALUES (${store.id}, ${cat.id}, ${`prod-${prefix}`}, 'Settlement Product', 'Desc', 'USD')
      RETURNING id;
    `;

    const [variant] = await sql`
      INSERT INTO "product_variants" ("product_id", "store_id", "sku", "price_cents")
      VALUES (${prod.id}, ${store.id}, ${`sku-${prefix}`}, 5000)
      RETURNING id;
    `;

    const address = {
      fullName: 'Settlement Buyer',
      line1: '123 Main St',
      city: 'Austin',
      state: 'TX',
      postalCode: '78701',
      country: 'USA',
    };

    // Period 1 window
    const p1Start = new Date('2026-03-01T00:00:00.000Z');
    const p1Delivered = new Date('2026-03-03T12:00:00.000Z');
    const p1End = new Date('2026-03-08T00:00:00.000Z');

    // 2. Create Order 1 ($60 subtotal = 6000 cents)
    const o1Id = randomUUID();
    const s1Id = randomUUID();
    await sql`
      INSERT INTO "orders" (
        "id", "user_id", "channel_key", "store_id", "payment_status", "fulfillment_status",
        "subtotal_cents", "shipping_cents", "discount_cents", "total_cents", "currency", "address_snapshot"
      ) VALUES (
        ${o1Id}, ${buyer.id}, 'store', ${store.id}, 'PAID', 'DELIVERED',
        6000, 500, 0, 6500, 'USD', ${JSON.stringify(address)}::jsonb
      );
    `;
    await sql`
      INSERT INTO "seller_orders" (
        "id", "order_id", "store_id", "fulfillment_status", "subtotal_cents", "shipping_cents",
        "discount_cents", "total_cents", "commission_bps_snapshot", "delivered_at"
      ) VALUES (
        ${s1Id}, ${o1Id}, ${store.id}, 'DELIVERED', 6000, 500, 0, 6500, 1000, ${p1Delivered}
      );
    `;
    const [oi1] = await sql`
      INSERT INTO "order_items" (
        "order_id", "seller_order_id", "store_id", "variant_id", "title_snapshot",
        "sku_snapshot", "price_cents_snapshot", "qty", "subtotal_cents", "total_cents"
      ) VALUES (
        ${o1Id}, ${s1Id}, ${store.id}, ${variant.id}, 'Item 1',
        'SKU1', 6000, 1, 6000, 6000
      ) RETURNING id;
    `;

    // 3. Create Order 2 ($40 subtotal = 4000 cents)
    const o2Id = randomUUID();
    const s2Id = randomUUID();
    await sql`
      INSERT INTO "orders" (
        "id", "user_id", "channel_key", "store_id", "payment_status", "fulfillment_status",
        "subtotal_cents", "shipping_cents", "discount_cents", "total_cents", "currency", "address_snapshot"
      ) VALUES (
        ${o2Id}, ${buyer.id}, 'store', ${store.id}, 'PAID', 'DELIVERED',
        4000, 500, 0, 4500, 'USD', ${JSON.stringify(address)}::jsonb
      );
    `;
    await sql`
      INSERT INTO "seller_orders" (
        "id", "order_id", "store_id", "fulfillment_status", "subtotal_cents", "shipping_cents",
        "discount_cents", "total_cents", "commission_bps_snapshot", "delivered_at"
      ) VALUES (
        ${s2Id}, ${o2Id}, ${store.id}, 'DELIVERED', 4000, 500, 0, 4500, 1000, ${p1Delivered}
      );
    `;
    await sql`
      INSERT INTO "order_items" (
        "order_id", "seller_order_id", "store_id", "variant_id", "title_snapshot",
        "sku_snapshot", "price_cents_snapshot", "qty", "subtotal_cents", "total_cents"
      ) VALUES (
        ${o2Id}, ${s2Id}, ${store.id}, ${variant.id}, 'Item 2',
        'SKU2', 4000, 1, 4000, 4000
      );
    `;

    // 4. Create a refund for $10 (1000 cents) on Order 1 item
    const paymentAttemptId = randomUUID();
    await sql`
      INSERT INTO "payment_attempts" (
        "id", "order_id", "amount_cents", "currency", "status"
      ) VALUES (
        ${paymentAttemptId}, ${o1Id}, 6500, 'USD', 'PAID'
      );
    `;
    const [refund] = await sql`
      INSERT INTO "refunds" (
        "order_id", "payment_attempt_id", "amount_cents", "currency", "reason", "status", "created_at"
      ) VALUES (
        ${o1Id}, ${paymentAttemptId}, 1000, 'USD', 'Customer return', 'COMPLETED', ${p1Delivered}
      ) RETURNING id;
    `;
    await sql`
      INSERT INTO "refund_items" (
        "refund_id", "order_item_id", "qty", "amount_cents", "restock"
      ) VALUES (
        ${refund.id}, ${oi1.id}, 1, 1000, false
      );
    `;

    // 5. Execute settlement for Period 1
    // Gross sales = 6000 + 4000 = 10000 cents ($100)
    // Refunds = 1000 cents ($10)
    // Net sales = 9000 cents ($90)
    // Commission = 10% of 9000 = 900 cents ($9)
    // Payout = 9000 - 900 = 8100 cents ($81)
    const result = await settlementService.settleStorePeriod({
      storeId: store.id,
      periodStart: p1Start,
      periodEnd: p1End,
    });

    expect(result.status).toBe('COMPLETED');
    expect(result.grossSalesCents).toBe(10000);
    expect(result.refundDeductionsCents).toBe(1000);
    expect(result.netSalesCents).toBe(9000);
    expect(result.commissionBps).toBe(1000);
    expect(result.commissionCents).toBe(900);
    expect(result.amountCents).toBe(8100);
    expect(result.carriedForwardCents).toBe(0);

    // 6. Verify seller_payouts table entry in PostgreSQL
    const [payoutRow] = await sql`
      SELECT * FROM "seller_payouts" WHERE "id" = ${result.payoutId};
    `;
    expect(payoutRow).toBeDefined();
    expect(parseInt(payoutRow.gross_sales_cents, 10)).toBe(10000);
    expect(parseInt(payoutRow.refund_deductions_cents, 10)).toBe(1000);
    expect(parseInt(payoutRow.net_sales_cents, 10)).toBe(9000);
    expect(parseInt(payoutRow.commission_cents, 10)).toBe(900);
    expect(parseInt(payoutRow.amount_cents, 10)).toBe(8100);
    expect(payoutRow.status).toBe('COMPLETED');

    // 7. Verify balanced financial_entries rows in PostgreSQL
    const ledgerEntries = await sql`
      SELECT * FROM "financial_entries"
      WHERE "payout_id" = ${result.payoutId}
      ORDER BY "account";
    `;

    expect(ledgerEntries).toHaveLength(3);

    const totalDebits = ledgerEntries.reduce((s, r) => s + parseInt(r.debit_cents, 10), 0);
    const totalCredits = ledgerEntries.reduce((s, r) => s + parseInt(r.credit_cents, 10), 0);
    expect(totalDebits).toBe(9000);
    expect(totalCredits).toBe(9000);

    const payableEntry = ledgerEntries.find((r) => r.account === 'seller_payable');
    expect(parseInt(payableEntry.debit_cents, 10)).toBe(9000);
    expect(parseInt(payableEntry.credit_cents, 10)).toBe(0);

    const commEntry = ledgerEntries.find((r) => r.account === 'platform_commission');
    expect(parseInt(commEntry.debit_cents, 10)).toBe(0);
    expect(parseInt(commEntry.credit_cents, 10)).toBe(900);

    const clearingEntry = ledgerEntries.find((r) => r.account === 'payment_gateway_clearing');
    expect(parseInt(clearingEntry.debit_cents, 10)).toBe(0);
    expect(parseInt(clearingEntry.credit_cents, 10)).toBe(8100);

    // 8. Test Idempotency: re-running settlement for same period returns existing payout
    const replayResult = await settlementService.settleStorePeriod({
      storeId: store.id,
      periodStart: p1Start,
      periodEnd: p1End,
    });

    expect(replayResult.isExisting).toBe(true);
    expect(replayResult.payoutId).toBe(result.payoutId);

    // Confirm no extra entries added
    const entriesAfterReplay = await sql`
      SELECT count(*)::int AS count FROM "financial_entries" WHERE "payout_id" = ${result.payoutId};
    `;
    expect(entriesAfterReplay[0].count).toBe(3);

    // 9. Test Negative Net Sales & Carry Forward
    // Period 2: Gross sales $20 (2000 cents), Refunds $50 (5000 cents) -> Net = -$30 (-3000 cents)
    const p2Start = new Date('2026-03-08T00:00:00.000Z');
    const p2Delivered = new Date('2026-03-10T12:00:00.000Z');
    const p2End = new Date('2026-03-15T00:00:00.000Z');

    const o3Id = randomUUID();
    const s3Id = randomUUID();
    await sql`
      INSERT INTO "orders" (
        "id", "user_id", "channel_key", "store_id", "payment_status", "fulfillment_status",
        "subtotal_cents", "shipping_cents", "discount_cents", "total_cents", "currency", "address_snapshot"
      ) VALUES (
        ${o3Id}, ${buyer.id}, 'store', ${store.id}, 'PAID', 'DELIVERED',
        2000, 0, 0, 2000, 'USD', ${JSON.stringify(address)}::jsonb
      );
    `;
    await sql`
      INSERT INTO "seller_orders" (
        "id", "order_id", "store_id", "fulfillment_status", "subtotal_cents", "shipping_cents",
        "discount_cents", "total_cents", "commission_bps_snapshot", "delivered_at"
      ) VALUES (
        ${s3Id}, ${o3Id}, ${store.id}, 'DELIVERED', 2000, 0, 0, 2000, 1000, ${p2Delivered}
      );
    `;
    const [oi3] = await sql`
      INSERT INTO "order_items" (
        "order_id", "seller_order_id", "store_id", "variant_id", "title_snapshot",
        "sku_snapshot", "price_cents_snapshot", "qty", "subtotal_cents", "total_cents"
      ) VALUES (
        ${o3Id}, ${s3Id}, ${store.id}, ${variant.id}, 'Item 3',
        'SKU3', 2000, 1, 2000, 2000
      ) RETURNING id;
    `;

    // Refund $50 (5000 cents)
    const pa2Id = randomUUID();
    await sql`
      INSERT INTO "payment_attempts" (
        "id", "order_id", "amount_cents", "currency", "status"
      ) VALUES (
        ${pa2Id}, ${o3Id}, 2000, 'USD', 'PAID'
      );
    `;
    const [r2] = await sql`
      INSERT INTO "refunds" (
        "order_id", "payment_attempt_id", "amount_cents", "currency", "reason", "status", "created_at"
      ) VALUES (
        ${o3Id}, ${pa2Id}, 5000, 'USD', 'Defective return', 'COMPLETED', ${p2Delivered}
      ) RETURNING id;
    `;
    await sql`
      INSERT INTO "refund_items" (
        "refund_id", "order_item_id", "qty", "amount_cents", "restock"
      ) VALUES (
        ${r2.id}, ${oi3.id}, 1, 5000, false
      );
    `;

    const p2Result = await settlementService.settleStorePeriod({
      storeId: store.id,
      periodStart: p2Start,
      periodEnd: p2End,
    });

    expect(p2Result.status).toBe('CARRIED_FORWARD');
    expect(p2Result.grossSalesCents).toBe(2000);
    expect(p2Result.refundDeductionsCents).toBe(5000);
    expect(p2Result.netSalesCents).toBe(-3000);
    expect(p2Result.commissionCents).toBe(0);
    expect(p2Result.amountCents).toBe(0);
    expect(p2Result.carriedForwardCents).toBe(3000);

    // Verify no payout financial entries created for CARRIED_FORWARD
    const p2Entries = await sql`
      SELECT count(*)::int AS count FROM "financial_entries" WHERE "payout_id" = ${p2Result.payoutId};
    `;
    expect(p2Entries[0].count).toBe(0);

    // 10. Test subsequent period offsets prior carried forward balance
    // Period 3: Gross sales $100 (10000 cents), 0 new refunds, 3000 prior carried forward
    // Total deductions = 3000 -> Net = 7000 cents ($70)
    // Commission = 10% of 7000 = 700 cents ($7)
    // Payout = 6300 cents ($63)
    const p3Start = new Date('2026-03-15T00:00:00.000Z');
    const p3Delivered = new Date('2026-03-17T12:00:00.000Z');
    const p3End = new Date('2026-03-22T00:00:00.000Z');

    const o4Id = randomUUID();
    const s4Id = randomUUID();
    await sql`
      INSERT INTO "orders" (
        "id", "user_id", "channel_key", "store_id", "payment_status", "fulfillment_status",
        "subtotal_cents", "shipping_cents", "discount_cents", "total_cents", "currency", "address_snapshot"
      ) VALUES (
        ${o4Id}, ${buyer.id}, 'store', ${store.id}, 'PAID', 'DELIVERED',
        10000, 0, 0, 10000, 'USD', ${JSON.stringify(address)}::jsonb
      );
    `;
    await sql`
      INSERT INTO "seller_orders" (
        "id", "order_id", "store_id", "fulfillment_status", "subtotal_cents", "shipping_cents",
        "discount_cents", "total_cents", "commission_bps_snapshot", "delivered_at"
      ) VALUES (
        ${s4Id}, ${o4Id}, ${store.id}, 'DELIVERED', 10000, 0, 0, 10000, 1000, ${p3Delivered}
      );
    `;

    const p3Result = await settlementService.settleStorePeriod({
      storeId: store.id,
      periodStart: p3Start,
      periodEnd: p3End,
    });

    expect(p3Result.status).toBe('COMPLETED');
    expect(p3Result.grossSalesCents).toBe(10000);
    expect(p3Result.refundDeductionsCents).toBe(3000); // 3000 carried forward
    expect(p3Result.netSalesCents).toBe(7000);
    expect(p3Result.commissionCents).toBe(700);
    expect(p3Result.amountCents).toBe(6300);
    expect(p3Result.carriedForwardCents).toBe(0);

    // Verify p3 financial entries balance
    const p3LedgerEntries = await sql`
      SELECT * FROM "financial_entries" WHERE "payout_id" = ${p3Result.payoutId};
    `;
    expect(p3LedgerEntries).toHaveLength(3);
    const p3Debits = p3LedgerEntries.reduce((s, r) => s + parseInt(r.debit_cents, 10), 0);
    const p3Credits = p3LedgerEntries.reduce((s, r) => s + parseInt(r.credit_cents, 10), 0);
    expect(p3Debits).toBe(7000);
    expect(p3Credits).toBe(7000);
  });
});
