// @shopscale/backend/payments/schema - Drizzle schema for refunds, refund items, and double-entry financial ledger (T060).
// Invariants:
// 1. Double-entry ledger: immutable append-only financial_entries table where SUM(debits) = SUM(credits) per operation.
// 2. Four core accounts: customer_receivable, seller_payable, platform_commission, payment_gateway_clearing.
// 3. Row-level locks on parent payment records enforce cumulative refund cap <= captured payment amount.
// 4. ON DELETE RESTRICT on all financial foreign keys preserves auditability.
// 5. Non-negative integer cents arithmetic on all debits and credits.

import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { orders, paymentAttempts, orderItems } from '../commerce/schema.js';
import { stores } from '../stores/schema.js';
import { users } from '../identity/schema.js';

export const REFUND_STATUSES = ['PENDING', 'COMPLETED', 'FAILED'] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const FINANCIAL_ACCOUNTS = [
  'customer_receivable',
  'seller_payable',
  'platform_commission',
  'payment_gateway_clearing',
] as const;
export type FinancialAccount = (typeof FINANCIAL_ACCOUNTS)[number];

export const refunds = pgTable(
  'refunds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    paymentAttemptId: uuid('payment_attempt_id')
      .notNull()
      .references(() => paymentAttempts.id, { onDelete: 'restrict' }),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull().default('USD'),
    reason: text('reason').notNull(),
    status: text('status').notNull().default('PENDING'),
    providerRefundRef: text('provider_refund_ref'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    orderCreatedAtIdx: index('refunds_order_created_at_idx').on(t.orderId, t.createdAt),
    paymentAttemptIdIdx: index('refunds_payment_attempt_id_idx').on(t.paymentAttemptId),
    amountCheck: check('refunds_amount_cents_check', sql`${t.amountCents} > 0`),
    statusCheck: check('refunds_status_check', sql`${t.status} IN ('PENDING', 'COMPLETED', 'FAILED')`),
  }),
);

export type RefundRow = typeof refunds.$inferSelect;
export type NewRefundRow = typeof refunds.$inferInsert;

export const refundItems = pgTable(
  'refund_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    refundId: uuid('refund_id')
      .notNull()
      .references(() => refunds.id, { onDelete: 'restrict' }),
    orderItemId: uuid('order_item_id')
      .notNull()
      .references(() => orderItems.id, { onDelete: 'restrict' }),
    qty: integer('qty').notNull(),
    amountCents: integer('amount_cents').notNull(),
    restock: boolean('restock').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    refundIdIdx: index('refund_items_refund_id_idx').on(t.refundId),
    orderItemIdIdx: index('refund_items_order_item_id_idx').on(t.orderItemId),
    qtyCheck: check('refund_items_qty_check', sql`${t.qty} > 0`),
    amountCheck: check('refund_items_amount_cents_check', sql`${t.amountCents} >= 0`),
  }),
);

export type RefundItemRow = typeof refundItems.$inferSelect;
export type NewRefundItemRow = typeof refundItems.$inferInsert;

export const SELLER_PAYOUT_STATUSES = ['PENDING', 'COMPLETED', 'CARRIED_FORWARD', 'FAILED'] as const;
export type SellerPayoutStatus = (typeof SELLER_PAYOUT_STATUSES)[number];

export const sellerPayouts = pgTable(
  'seller_payouts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    periodStart: timestamp('period_start', { withTimezone: true, mode: 'date' }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true, mode: 'date' }).notNull(),
    grossSalesCents: bigint('gross_sales_cents', { mode: 'number' }).notNull().default(0),
    refundDeductionsCents: bigint('refund_deductions_cents', { mode: 'number' }).notNull().default(0),
    netSalesCents: bigint('net_sales_cents', { mode: 'number' }).notNull().default(0),
    commissionBps: integer('commission_bps').notNull().default(1000),
    commissionCents: bigint('commission_cents', { mode: 'number' }).notNull().default(0),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull().default(0),
    carriedForwardCents: bigint('carried_forward_cents', { mode: 'number' }).notNull().default(0),
    status: text('status').notNull().default('COMPLETED'),
    effectKey: text('effect_key').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    storeCreatedAtIdx: index('seller_payouts_store_created_at_idx').on(t.storeId, t.createdAt),
    periodIdx: index('seller_payouts_period_idx').on(t.storeId, t.periodStart, t.periodEnd),
    statusCheck: check(
      'seller_payouts_status_check',
      sql`${t.status} IN ('PENDING', 'COMPLETED', 'CARRIED_FORWARD', 'FAILED')`,
    ),
  }),
);

export type SellerPayoutRow = typeof sellerPayouts.$inferSelect;
export type NewSellerPayoutRow = typeof sellerPayouts.$inferInsert;

export const financialEntries = pgTable(
  'financial_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    operationKey: text('operation_key').notNull(),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'restrict' }),
    payoutId: uuid('payout_id').references(() => sellerPayouts.id, { onDelete: 'restrict' }),
    refundId: uuid('refund_id').references(() => refunds.id, { onDelete: 'restrict' }),
    storeId: uuid('store_id').references(() => stores.id, { onDelete: 'restrict' }),
    account: text('account').notNull(),
    debitCents: bigint('debit_cents', { mode: 'number' }).notNull().default(0),
    creditCents: bigint('credit_cents', { mode: 'number' }).notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    operationKeyIdx: index('financial_entries_operation_key_idx').on(t.operationKey),
    orderCreatedAtIdx: index('financial_entries_order_created_at_idx').on(t.orderId, t.createdAt),
    payoutIdIdx: index('financial_entries_payout_id_idx').on(t.payoutId),
    storeCreatedAtIdx: index('financial_entries_store_created_at_idx').on(t.storeId, t.createdAt),
    accountCreatedAtIdx: index('financial_entries_account_created_at_idx').on(t.account, t.createdAt),
    accountCheck: check(
      'financial_entries_account_check',
      sql`${t.account} IN ('customer_receivable', 'seller_payable', 'platform_commission', 'payment_gateway_clearing')`,
    ),
    debitPositiveCheck: check('financial_entries_debit_cents_check', sql`${t.debitCents} >= 0`),
    creditPositiveCheck: check('financial_entries_credit_cents_check', sql`${t.creditCents} >= 0`),
    debitOrCreditCheck: check(
      'financial_entries_debit_or_credit_positive',
      sql`${t.debitCents} > 0 OR ${t.creditCents} > 0`,
    ),
  }),
);

export type FinancialEntryRow = typeof financialEntries.$inferSelect;
export type NewFinancialEntryRow = typeof financialEntries.$inferInsert;
