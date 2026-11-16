// @shopscale/backend/commerce/schema - Drizzle schema for orders, seller suborders, order items, and payment attempts (T046).
// Invariants:
// 1. Unified customer checkout: parent order references user and captures immutable address snapshot.
// 2. Immediate vendor splitting (DEC-011): child seller_orders created atomically per vendor.
// 3. Composite foreign key: order_items strictly bound to (store_id, seller_order_id).
// 4. ON DELETE RESTRICT on all financial and fulfillment tables preserves audit trail.
// 5. Integer cents arithmetic and non-negative constraints on all monetary columns.

import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const ORDER_PAYMENT_STATUSES = ['PENDING', 'PAID', 'FAILED', 'REFUNDED'] as const;
export type OrderPaymentStatus = (typeof ORDER_PAYMENT_STATUSES)[number];

export const ORDER_FULFILLMENT_STATUSES = [
  'PENDING',
  'PACKED',
  'PARTIALLY_SHIPPED',
  'SHIPPED',
  'PARTIALLY_DELIVERED',
  'DELIVERED',
  'CANCELLED',
] as const;
export type OrderFulfillmentStatus = (typeof ORDER_FULFILLMENT_STATUSES)[number];

export interface AddressSnapshot {
  fullName: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone?: string | null;
}

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Cross-module FK (-> users.id, ON DELETE RESTRICT) in reviewed SQL.
    userId: uuid('user_id').notNull(),
    channelKey: text('channel_key').notNull(),
    // Cross-module FK (-> stores.id, ON DELETE RESTRICT) in reviewed SQL.
    storeId: uuid('store_id'),
    paymentStatus: text('payment_status').notNull().default('PENDING'),
    fulfillmentStatus: text('fulfillment_status').notNull().default('PENDING'),
    subtotalCents: integer('subtotal_cents').notNull(),
    shippingCents: integer('shipping_cents').notNull(),
    discountCents: integer('discount_cents').notNull().default(0),
    totalCents: integer('total_cents').notNull(),
    currency: text('currency').notNull().default('USD'),
    addressSnapshot: jsonb('address_snapshot').$type<AddressSnapshot>().notNull(),
    couponCode: text('coupon_code'),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    userCreatedAtIdx: index('orders_user_created_at_idx').on(t.userId, t.createdAt, t.id),
    storeCreatedAtIdx: index('orders_store_created_at_idx').on(t.storeId, t.createdAt, t.id),
    paymentStatusCheck: check('orders_payment_status_check', sql`${t.paymentStatus} IN ('PENDING', 'PAID', 'FAILED', 'REFUNDED')`),
    fulfillmentStatusCheck: check('orders_fulfillment_status_check', sql`${t.fulfillmentStatus} IN ('PENDING', 'PACKED', 'PARTIALLY_SHIPPED', 'SHIPPED', 'PARTIALLY_DELIVERED', 'DELIVERED', 'CANCELLED')`),
    subtotalNonNeg: check('orders_subtotal_cents_nonneg', sql`${t.subtotalCents} >= 0`),
    shippingNonNeg: check('orders_shipping_cents_nonneg', sql`${t.shippingCents} >= 0`),
    discountNonNeg: check('orders_discount_cents_nonneg', sql`${t.discountCents} >= 0`),
    totalNonNeg: check('orders_total_cents_nonneg', sql`${t.totalCents} >= 0`),
    versionCheck: check('orders_version_check', sql`${t.version} >= 1`),
  }),
);

export type OrderRow = typeof orders.$inferSelect;
export type NewOrderRow = typeof orders.$inferInsert;

export const sellerOrders = pgTable(
  'seller_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id').notNull(),
    // Cross-module FK (-> stores.id, ON DELETE RESTRICT) in reviewed SQL.
    storeId: uuid('store_id').notNull(),
    fulfillmentStatus: text('fulfillment_status').notNull().default('PENDING'),
    subtotalCents: integer('subtotal_cents').notNull(),
    shippingCents: integer('shipping_cents').notNull(),
    discountCents: integer('discount_cents').notNull().default(0),
    totalCents: integer('total_cents').notNull(),
    commissionBpsSnapshot: integer('commission_bps_snapshot').notNull().default(1000),
    trackingRef: text('tracking_ref'),
    carrier: text('carrier'),
    shippedAt: timestamp('shipped_at', { withTimezone: true, mode: 'date' }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    orderFk: foreignKey({
      name: 'seller_orders_order_id_fk',
      columns: [t.orderId],
      foreignColumns: [orders.id],
    }).onDelete('restrict'),
    orderStoreUniq: unique('seller_orders_order_store_uniq').on(t.orderId, t.storeId),
    storeIdUniq: unique('seller_orders_store_id_uniq').on(t.storeId, t.id),
    storeCreatedAtIdx: index('seller_orders_store_created_at_idx').on(t.storeId, t.createdAt, t.id),
    orderIdIdx: index('seller_orders_order_id_idx').on(t.orderId),
    fulfillmentStatusCheck: check('seller_orders_fulfillment_status_check', sql`${t.fulfillmentStatus} IN ('PENDING', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED')`),
    subtotalNonNeg: check('seller_orders_subtotal_cents_nonneg', sql`${t.subtotalCents} >= 0`),
    shippingNonNeg: check('seller_orders_shipping_cents_nonneg', sql`${t.shippingCents} >= 0`),
    discountNonNeg: check('seller_orders_discount_cents_nonneg', sql`${t.discountCents} >= 0`),
    totalNonNeg: check('seller_orders_total_cents_nonneg', sql`${t.totalCents} >= 0`),
    commissionBpsNonNeg: check('seller_orders_commission_bps_nonneg', sql`${t.commissionBpsSnapshot} >= 0`),
  }),
);

export type SellerOrderRow = typeof sellerOrders.$inferSelect;
export type NewSellerOrderRow = typeof sellerOrders.$inferInsert;

export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id').notNull(),
    sellerOrderId: uuid('seller_order_id').notNull(),
    storeId: uuid('store_id').notNull(),
    // Cross-module FK (-> product_variants.id, ON DELETE RESTRICT) in reviewed SQL.
    variantId: uuid('variant_id').notNull(),
    titleSnapshot: text('title_snapshot').notNull(),
    skuSnapshot: text('sku_snapshot').notNull(),
    qty: integer('qty').notNull(),
    unitPriceCents: integer('unit_price_cents').notNull(),
    totalCents: integer('total_cents').notNull(),
    discountCents: integer('discount_cents').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    orderFk: foreignKey({
      name: 'order_items_order_id_fk',
      columns: [t.orderId],
      foreignColumns: [orders.id],
    }).onDelete('restrict'),
    sellerOrderCompositeFk: foreignKey({
      name: 'order_items_seller_order_fk',
      columns: [t.storeId, t.sellerOrderId],
      foreignColumns: [sellerOrders.storeId, sellerOrders.id],
    }).onDelete('restrict'),
    storeCreatedAtIdx: index('order_items_store_created_at_idx').on(t.storeId, t.createdAt, t.id),
    orderIdIdx: index('order_items_order_id_idx').on(t.orderId),
    sellerOrderIdIdx: index('order_items_seller_order_id_idx').on(t.sellerOrderId),
    variantIdIdx: index('order_items_variant_id_idx').on(t.variantId),
    qtyPositive: check('order_items_qty_positive', sql`${t.qty} > 0`),
    unitPriceNonNeg: check('order_items_unit_price_cents_nonneg', sql`${t.unitPriceCents} >= 0`),
    totalNonNeg: check('order_items_total_cents_nonneg', sql`${t.totalCents} >= 0`),
    discountNonNeg: check('order_items_discount_cents_nonneg', sql`${t.discountCents} >= 0`),
  }),
);

export type OrderItemRow = typeof orderItems.$inferSelect;
export type NewOrderItemRow = typeof orderItems.$inferInsert;

export const paymentAttempts = pgTable(
  'payment_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id').notNull(),
    provider: text('provider').notNull().default('mock'),
    effectKey: text('effect_key').notNull(),
    providerRef: text('provider_ref'),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull().default('USD'),
    status: text('status').notNull().default('PENDING'),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    orderFk: foreignKey({
      name: 'payment_attempts_order_id_fk',
      columns: [t.orderId],
      foreignColumns: [orders.id],
    }).onDelete('restrict'),
    providerEffectKeyUniq: unique('payment_attempts_provider_effect_key_uniq').on(t.provider, t.effectKey),
    providerRefIdx: uniqueIndex('payment_attempts_provider_ref_uniq').on(t.provider, t.providerRef),
    orderIdIdx: index('payment_attempts_order_id_idx').on(t.orderId),
    statusCheck: check('payment_attempts_status_check', sql`${t.status} IN ('PENDING', 'PAID', 'FAILED', 'REFUNDED')`),
    amountNonNeg: check('payment_attempts_amount_cents_nonneg', sql`${t.amountCents} >= 0`),
  }),
);

export type PaymentAttemptRow = typeof paymentAttempts.$inferSelect;
export type NewPaymentAttemptRow = typeof paymentAttempts.$inferInsert;

export const idempotencyRequests = pgTable(
  'idempotency_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    operation: text('operation').notNull(),
    channelKey: text('channel_key').notNull(),
    key: text('key').notNull(),
    requestHash: text('request_hash').notNull(),
    status: text('status').notNull().default('PROCESSING'),
    responseStatus: integer('response_status'),
    responseBody: jsonb('response_body'),
    orderId: uuid('order_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    userOpChannelKeyUniq: unique('idempotency_requests_user_op_channel_key_uniq').on(
      t.userId,
      t.operation,
      t.channelKey,
      t.key,
    ),
    orderIdIdx: index('idempotency_requests_order_id_idx').on(t.orderId),
    statusCheck: check(
      'idempotency_requests_status_check',
      sql`${t.status} IN ('PROCESSING', 'COMPLETED', 'FAILED')`,
    ),
  }),
);

export type IdempotencyRequestRow = typeof idempotencyRequests.$inferSelect;
export type NewIdempotencyRequestRow = typeof idempotencyRequests.$inferInsert;

export const fulfillmentEvents = pgTable(
  'fulfillment_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id').notNull(),
    sellerOrderId: uuid('seller_order_id').notNull(),
    storeId: uuid('store_id').notNull(),
    fromStatus: text('from_status').notNull(),
    toStatus: text('to_status').notNull(),
    trackingRef: text('tracking_ref'),
    carrier: text('carrier'),
    actorId: uuid('actor_id'),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    orderFk: foreignKey({
      name: 'fulfillment_events_order_id_fk',
      columns: [t.orderId],
      foreignColumns: [orders.id],
    }).onDelete('restrict'),
    orderIdIdx: index('fulfillment_events_order_id_idx').on(t.orderId),
    sellerOrderIdIdx: index('fulfillment_events_seller_order_id_idx').on(t.sellerOrderId),
    storeCreatedAtIdx: index('fulfillment_events_store_created_at_idx').on(t.storeId, t.createdAt),
  }),
);

export type FulfillmentEventRow = typeof fulfillmentEvents.$inferSelect;
export type NewFulfillmentEventRow = typeof fulfillmentEvents.$inferInsert;

export const RETURN_REQUEST_STATUSES = ['PENDING_INSPECTION', 'APPROVED', 'REJECTED'] as const;
export type ReturnRequestStatus = (typeof RETURN_REQUEST_STATUSES)[number];

export const returnRequests = pgTable(
  'return_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id').notNull(),
    sellerOrderId: uuid('seller_order_id').notNull(),
    storeId: uuid('store_id').notNull(),
    orderItemId: uuid('order_item_id').notNull(),
    userId: uuid('user_id').notNull(),
    qty: integer('qty').notNull(),
    reason: text('reason').notNull(),
    customerNotes: text('customer_notes'),
    status: text('status').notNull().default('PENDING_INSPECTION'),
    inspectionNotes: text('inspection_notes'),
    inspectedBy: uuid('inspected_by'),
    inspectedAt: timestamp('inspected_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    orderFk: foreignKey({
      name: 'return_requests_order_id_fk',
      columns: [t.orderId],
      foreignColumns: [orders.id],
    }).onDelete('restrict'),
    orderItemFk: foreignKey({
      name: 'return_requests_order_item_id_fk',
      columns: [t.orderItemId],
      foreignColumns: [orderItems.id],
    }).onDelete('restrict'),
    orderIdIdx: index('return_requests_order_id_idx').on(t.orderId),
    orderItemIdIdx: index('return_requests_order_item_id_idx').on(t.orderItemId),
    storeCreatedAtIdx: index('return_requests_store_created_at_idx').on(t.storeId, t.createdAt),
    userCreatedAtIdx: index('return_requests_user_created_at_idx').on(t.userId, t.createdAt),
    statusCheck: check('return_requests_status_check', sql`${t.status} IN ('PENDING_INSPECTION', 'APPROVED', 'REJECTED')`),
    qtyPositive: check('return_requests_qty_check', sql`${t.qty} > 0`),
  }),
);

export type ReturnRequestRow = typeof returnRequests.$inferSelect;
export type NewReturnRequestRow = typeof returnRequests.$inferInsert;


