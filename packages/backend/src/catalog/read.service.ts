// @shopscale/backend/catalog/read.service - Channel-aware public reads
// (T021a). Every read RECHECKS the full visibility chain IN SQL:
// business active → store active → product status → channel publication
// flag. No cached projection, no trust in write-time state (module
// invariant: "Public reads recheck store/product/publication status").
//
// Marketplace sees marketplace_enabled products from active stores in
// active businesses; the store channel additionally pins store_id to the
// resolved slug. Unpublished, draft, archived, and suspended-store rows
// are INVISIBLE — list and detail share one WHERE shape, so a detail
// 404 can never be distinguished from an unknown slug by an outsider.
//
// Sorts are a closed set of deterministic fragments, each tiebroken by
// id (T022 layers keyset cursors on the same orderings).

import type { Sql } from 'postgres';
import { getDb } from '../db/client.js';

export type CatalogChannel = 'marketplace' | 'store';
export type CatalogSort = 'newest' | 'price_asc' | 'price_desc' | 'popularity';

export const CATALOG_SORTS: readonly CatalogSort[] = ['newest', 'price_asc', 'price_desc', 'popularity'];

/** Pure: closed sort → SQL fragment map (id tiebreak keeps order total). */
export const SORT_FRAGMENTS: Record<CatalogSort, string> = {
  newest: `"p"."created_at" DESC, "p"."id" DESC`,
  price_asc: `"p"."min_price_cents" ASC, "p"."id" ASC`,
  price_desc: `"p"."min_price_cents" DESC, "p"."id" DESC`,
  popularity: `"p"."sales_count" DESC, "p"."id" DESC`,
};

export interface ChannelProductSummary {
  id: string;
  slug: string;
  title: string;
  brand: string | null;
  priceCents: number;
  currency: string;
  ratingCount: number;
}

export interface ChannelProductDetail extends ChannelProductSummary {
  description: string;
  attributes: Record<string, unknown>;
  status: string;
  store: { slug: string; name: string };
  variants: Array<{ id: string; sku: string; priceCents: number; attributes: Record<string, unknown> }>;
}

export interface ChannelListQuery {
  channel: CatalogChannel;
  /** Required for the store channel; ignored for marketplace. */
  storeSlug?: string | undefined;
  categorySlug?: string | undefined;
  minPriceCents?: number | undefined;
  maxPriceCents?: number | undefined;
  sort?: CatalogSort | undefined;
  limit?: number | undefined;
}

interface SummaryRow {
  id: string;
  slug: string;
  title: string;
  brand: string | null;
  min_price_cents: string | number;
  currency: string;
  rating_count: number;
}

interface DetailRow extends SummaryRow {
  description: string;
  attributes: unknown;
  status: string;
  store_slug: string;
  store_name: string;
}

/**
 * Visibility WHERE shared by list and detail. Parameters:
 * $1 channel ('marketplace'|'store'), $2 storeSlug ('' for marketplace),
 * $3 categorySlug ('' = any), $4 minPrice (-1 = any), $5 maxPrice
 * (-1 = any), $6 productSlug ('' = list all).
 */
const VISIBILITY_WHERE = `
  FROM "products" p
  JOIN "stores" s ON s."id" = p."store_id"
  JOIN "businesses" b ON b."id" = s."business_id"
  JOIN "product_publications" pub ON pub."product_id" = p."id"
  LEFT JOIN "categories" c ON c."id" = p."category_id"
  WHERE b."status" = 'active'
    AND s."status" = 'active'
    AND p."status" = 'active'
    AND (($1 = 'marketplace' AND pub."marketplace_enabled" = true)
         OR ($1 = 'store' AND pub."store_enabled" = true AND s."slug" = $2))
    AND ($3 = '' OR c."slug" = $3)
    AND ($4 = -1 OR p."min_price_cents" >= $4)
    AND ($5 = -1 OR p."min_price_cents" <= $5)
    AND ($6 = '' OR p."slug" = $6)`;

function bindArgs(query: ChannelListQuery, productSlug = ''): unknown[] {
  return [
    query.channel,
    query.storeSlug ?? '',
    query.categorySlug ?? '',
    query.minPriceCents ?? -1,
    query.maxPriceCents ?? -1,
    productSlug,
  ];
}

function toSummary(row: SummaryRow): ChannelProductSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    brand: row.brand,
    priceCents: Number(row.min_price_cents),
    currency: row.currency,
    ratingCount: row.rating_count,
  };
}

/**
 * Public list. `limit` caps rows (default 20, hard max 100); `nextCursor`
 * is always null until T022 adds keyset pagination — the DTO shape is
 * final now so clients do not churn.
 */
export async function listChannelProducts(
  query: ChannelListQuery,
  sql: Sql = getDb(),
): Promise<{ items: ChannelProductSummary[]; nextCursor: null }> {
  const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
  const fragment = SORT_FRAGMENTS[query.sort ?? 'newest'];
  const rows = (await sql.unsafe(
    `SELECT "p"."id","p"."slug","p"."title","p"."brand","p"."min_price_cents","p"."currency","p"."rating_count"
     ${VISIBILITY_WHERE}
     ORDER BY ${fragment}
     LIMIT ${limit};`,
    bindArgs(query) as never[],
  )) as unknown as SummaryRow[];
  return { items: rows.map(toSummary), nextCursor: null };
}

/**
 * Public detail. Unknown slug, unpublished product, draft/archived row,
 * suspended store, and malformed input ALL return null — one outcome,
 * no oracle.
 */
export async function getChannelProduct(
  query: ChannelListQuery & { productSlug: string },
  sql: Sql = getDb(),
): Promise<ChannelProductDetail | null> {
  const rows = (await sql.unsafe(
    `SELECT "p"."id","p"."slug","p"."title","p"."brand","p"."min_price_cents","p"."currency",
            "p"."rating_count","p"."description","p"."attributes","p"."status",
            "s"."slug" AS "store_slug","s"."name" AS "store_name"
     ${VISIBILITY_WHERE}
     LIMIT 1;`,
    bindArgs(query, query.productSlug) as never[],
  )) as unknown as DetailRow[];
  const row = rows[0];
  if (!row) return null;
  // Only visible products may expose their active variants.
  const variants = (await sql.unsafe(
    `SELECT "id","sku","price_cents","attributes"
     FROM "product_variants"
     WHERE "store_id" = (SELECT "store_id" FROM "products" WHERE "id" = $1)
       AND "product_id" = $1 AND "status" = 'active'
     ORDER BY "sku";`,
    [row.id],
  )) as unknown as Array<{ id: string; sku: string; price_cents: string | number; attributes: unknown }>;
  return {
    ...toSummary(row),
    description: row.description,
    attributes: row.attributes as Record<string, unknown>,
    status: row.status,
    store: { slug: row.store_slug, name: row.store_name },
    variants: variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      priceCents: Number(v.price_cents),
      attributes: v.attributes as Record<string, unknown>,
    })),
  };
}

/**
 * Store-slug resolution for the store channel: only ACTIVE stores in
 * ACTIVE businesses resolve; everything else shares one false result
 * (channel.service.ts resolveStorefront has the same rule for T016).
 */
export async function resolveActiveStoreSlug(slug: string, sql: Sql = getDb()): Promise<boolean> {
  const rows = (await sql.unsafe(
    `SELECT 1 FROM "stores" s JOIN "businesses" b ON b."id" = s."business_id"
     WHERE s."slug" = $1 AND s."status" = 'active' AND b."status" = 'active' LIMIT 1;`,
    [slug],
  )) as unknown as unknown[];
  return rows.length > 0;
}
