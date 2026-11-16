// @shopscale/backend/inventory/schema - Drizzle schema for inventory, reservations, and movement ledger (T037).
// Invariants:
// 1. on_hand >= 0
// 2. reserved >= 0 AND reserved <= on_hand
// 3. available = on_hand - reserved
// 4. stock_movements is append-only with unique (operation_key, variant_id, reason)

import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const inventory = pgTable(
  'inventory',
  {
    variantId: uuid('variant_id').primaryKey(),
    storeId: uuid('store_id').notNull(),
    onHand: integer('on_hand').notNull().default(0),
    reserved: integer('reserved').notNull().default(0),
    version: integer('version').notNull().default(1),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    storeIdx: index('inventory_store_idx').on(t.storeId),
  }),
);

export type InventoryRow = typeof inventory.$inferSelect;

export const stockReservations = pgTable(
  'stock_reservations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cartId: uuid('cart_id').notNull(),
    variantId: uuid('variant_id').notNull(),
    storeId: uuid('store_id').notNull(),
    quantity: integer('quantity').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    cartIdx: index('stock_reservations_cart_idx').on(t.cartId),
    statusExpiresIdx: index('stock_reservations_status_expires_idx').on(t.status, t.expiresAt),
  }),
);

export type StockReservationRow = typeof stockReservations.$inferSelect;

export const stockMovements = pgTable(
  'stock_movements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storeId: uuid('store_id').notNull(),
    variantId: uuid('variant_id').notNull(),
    deltaOnHand: integer('delta_on_hand').notNull().default(0),
    deltaReserved: integer('delta_reserved').notNull().default(0),
    reason: text('reason').notNull(),
    operationKey: text('operation_key').notNull(),
    refId: text('ref_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    variantCreatedIdx: index('stock_movements_variant_idx').on(t.variantId, t.createdAt),
    storeCreatedIdx: index('stock_movements_store_idx').on(t.storeId, t.createdAt),
    dedupUniq: uniqueIndex('stock_movements_dedup_uniq').on(t.operationKey, t.variantId, t.reason),
  }),
);

export type StockMovementRow = typeof stockMovements.$inferSelect;

export class InventoryConstraintError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'InventoryConstraintError';
  }
}

export function computeAvailableStock(onHand: number, reserved: number): number {
  return Math.max(0, onHand - reserved);
}
