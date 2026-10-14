// @shopscale/backend/catalog/schema - Drizzle source of truth, catalog tables.
// Reviewed SQL in db/migrations/0006-catalog.sql is canonical (CHECKS, the
// composite variant FK, partial indexes, and ALL cross-module FKs).
//
// Same-module relationships (categories self-FK, products→categories,
// variants→products composite, publications→products) ARE expressed here so
// `db:generate` diffs them; the products→stores FK is cross-module and lives
// in reviewed SQL only (standing rule: no import specifier satisfies both
// drizzle-kit's CJS loader and Node ESM — see db/schema.ts).

import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    parentId: uuid('parent_id'),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    // Materialized path ('/root/child/'); service code maintains it.
    path: text('path').notNull().default('/'),
  },
  (t) => ({
    parentFk: foreignKey({
      name: 'categories_parent_id_fk',
      columns: [t.parentId],
      foreignColumns: [t.id],
    }).onDelete('restrict'),
    slugUniq: unique('categories_slug_uniq').on(t.slug),
    noSelfParent: check('categories_no_self_parent', sql`${t.parentId} IS NULL OR ${t.parentId} <> ${t.id}`),
    parentIdx: index('categories_parent_id_idx').on(t.parentId),
    pathIdx: index('categories_path_idx').on(t.path),
  }),
);

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Cross-module FK (→ stores.id, ON DELETE RESTRICT) lives in reviewed SQL.
    storeId: uuid('store_id').notNull(),
    categoryId: uuid('category_id'),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    brand: text('brand'),
    status: text('status').notNull().default('draft'),
    attributes: jsonb('attributes').notNull().default({}),
    // Derived from active variants by service code (T020); sort input only.
    minPriceCents: bigint('min_price_cents', { mode: 'number' }).notNull().default(0),
    currency: text('currency').notNull().default('usd'),
    ratingSum: integer('rating_sum').notNull().default(0),
    ratingCount: integer('rating_count').notNull().default(0),
    salesCount: integer('sales_count').notNull().default(0),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    categoryFk: foreignKey({
      name: 'products_category_id_fk',
      columns: [t.categoryId],
      foreignColumns: [categories.id],
    }).onDelete('restrict'),
    // Pair lets variants FK (store_id, product_id) and isolates slugs.
    storeIdUniq: unique('products_store_id_id_uniq').on(t.storeId, t.id),
    storeSlugUniq: unique('products_store_slug_uniq').on(t.storeId, t.slug),
    statusCheck: check('products_status_check', sql`${t.status} IN ('draft','active','archived')`),
    minPriceCheck: check('products_min_price_check', sql`${t.minPriceCents} >= 0`),
    currencyCheck: check('products_currency_check', sql`char_length(${t.currency}) = 3`),
    ratingSumCheck: check('products_rating_sum_check', sql`${t.ratingSum} >= 0`),
    ratingCountCheck: check('products_rating_count_check', sql`${t.ratingCount} >= 0`),
    salesCountCheck: check('products_sales_count_check', sql`${t.salesCount} >= 0`),
    versionCheck: check('products_version_check', sql`${t.version} >= 1`),
    // Index MIRROR is partial on purpose: drizzle-orm 0.30 cannot express
    // DESC ordering or partial-index WHERE clauses, so the two DESC indexes
    // and the active-only filter live in reviewed 0006-catalog.sql only
    // (canonical). This ascending twin keeps `db:generate` from silently
    // DROPPING the index family on a future regen.
    storeCreatedIdx: index('products_store_created_idx').on(t.storeId, t.createdAt, t.id),
    categoryPriceIdx: index('products_category_price_idx').on(t.categoryId, t.minPriceCents, t.id),
  }),
);

export const productVariants = pgTable(
  'product_variants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id').notNull(),
    // Same-module composite FK twin; the SQL-side constraint is canonical.
    storeId: uuid('store_id').notNull(),
    sku: text('sku').notNull(),
    priceCents: bigint('price_cents', { mode: 'number' }).notNull(),
    attributes: jsonb('attributes').notNull().default({}),
    status: text('status').notNull().default('active'),
  },
  (t) => ({
    // The cross-store rejection boundary, mirrored for generate-diff only.
    productFk: foreignKey({
      name: 'product_variants_product_fk',
      columns: [t.storeId, t.productId],
      foreignColumns: [products.storeId, products.id],
    }).onDelete('restrict'),
    storeIdUniq: unique('product_variants_store_id_id_uniq').on(t.storeId, t.id),
    storeSkuUniq: unique('product_variants_store_sku_uniq').on(t.storeId, t.sku),
    statusCheck: check('product_variants_status_check', sql`${t.status} IN ('active','inactive')`),
    priceCheck: check('product_variants_price_check', sql`${t.priceCents} >= 0`),
    productIdx: index('product_variants_product_id_idx').on(t.productId),
  }),
);

export const productPublications = pgTable('product_publications', {
  productId: uuid('product_id')
    .primaryKey()
    .references(() => products.id, { onDelete: 'cascade' }),
  marketplaceEnabled: boolean('marketplace_enabled').notNull().default(false),
  storeEnabled: boolean('store_enabled').notNull().default(false),
  publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' }),
});

export type CategoryRow = typeof categories.$inferSelect;
export type ProductRow = typeof products.$inferSelect;
export type ProductVariantRow = typeof productVariants.$inferSelect;
export type ProductPublicationRow = typeof productPublications.$inferSelect;
