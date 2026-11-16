// @shopscale/backend/cart/schema - Drizzle schema for channel carts and cart items (T041).
// Invariants:
// 1. Exactly one owner type (user or guest).
// 2. channel_key = 'marketplace' OR store UUID matching store_id.
// 3. quantity > 0 AND quantity <= 99.
// 4. One cart per (channel_key, user_id) or (channel_key, guest_id).

import { bigint, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const carts = pgTable(
  'carts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    channelKey: text('channel_key').notNull(),
    storeId: uuid('store_id'),
    userId: uuid('user_id'),
    guestId: text('guest_id'),
    currency: text('currency').notNull().default('usd'),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    channelUserIdx: uniqueIndex('carts_channel_user_uniq').on(t.channelKey, t.userId),
    channelGuestIdx: uniqueIndex('carts_channel_guest_uniq').on(t.channelKey, t.guestId),
    storeIdx: index('carts_store_id_idx').on(t.storeId),
    userIdx: index('carts_user_id_idx').on(t.userId),
  }),
);

export type CartRow = typeof carts.$inferSelect;

export const cartItems = pgTable(
  'cart_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cartId: uuid('cart_id').notNull(),
    variantId: uuid('variant_id').notNull(),
    quantity: integer('quantity').notNull(),
    unitPriceCents: bigint('unit_price_cents', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    cartVariantUniq: uniqueIndex('cart_items_cart_variant_uniq').on(t.cartId, t.variantId),
    cartIdx: index('cart_items_cart_id_idx').on(t.cartId),
    variantIdx: index('cart_items_variant_id_idx').on(t.variantId),
  }),
);

export type CartItemRow = typeof cartItems.$inferSelect;

export const cartMerges = pgTable(
  'cart_merges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guestCartId: uuid('guest_cart_id').notNull().unique(),
    userId: uuid('user_id').notNull(),
    userCartId: uuid('user_cart_id').notNull(),
    channelKey: text('channel_key').notNull(),
    itemsMergedCount: integer('items_merged_count').notNull().default(0),
    mergedAt: timestamp('merged_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('cart_merges_user_id_idx').on(t.userId),
    guestCartIdx: index('cart_merges_guest_cart_id_idx').on(t.guestCartId),
  }),
);

export type CartMergeRow = typeof cartMerges.$inferSelect;
