// @shopscale/backend/catalog/read.service - Channel-aware public reads
// (T021a, keyset pagination T022b). Every read RECHECKS the full
// visibility chain IN SQL (business active → store active → product
// status → channel publication flag) via the single WHERE shape owned by
// list-query.ts. No cached projection, no trust in write-time state.
//
// List pagination is keyset-based: the query fetches limit+1 rows and the
// next cursor is derived from the last RETURNED row's sort tuple, so pages
// never overlap and never skip on a fixed dataset. Detail shares the same
// visibility WHERE, so a detail 404 is indistinguishable from an unknown
// slug to an outsider.

import type { Sql } from 'postgres';
import { getDb } from '../db/client.js';
import { CATALOG_SORTS, encodeCursor, filterFingerprint } from './cursor.js';
import type { CatalogChannel, CatalogSort } from './cursor.js';
import { VISIBILITY_WHERE, buildListQuery, cursorTupleForRow, visibilityArgs } from './list-query.js';

export { CATALOG_SORTS };
export type { CatalogChannel, CatalogSort };

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
  /** Opaque keyset cursor from a previous page's `nextCursor`. */
  cursor?: string | undefined;
}

interface SummaryRow {
  id: string;
  slug: string;
  title: string;
  brand: string | null;
  min_price_cents: string | number;
  currency: string;
  rating_count: number;
  created_at: Date;
  sales_count: number;
}

interface DetailRow extends SummaryRow {
  description: string;
  attributes: unknown;
  status: string;
  store_slug: string;
  store_name: string;
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
 * Public list with keyset pagination. `limit` caps rows (default 20, hard
 * max 100). `nextCursor` is null on the last page; otherwise it encodes the
 * last returned row's (sort value, id) under a channel+filter fingerprint,
 * so it cannot be replayed against a different query.
 */
export async function listChannelProducts(
  query: ChannelListQuery,
  sql: Sql = getDb(),
): Promise<{ items: ChannelProductSummary[]; nextCursor: string | null }> {
  const built = buildListQuery(query);
  const rows = (await sql.unsafe(built.text, built.args as never[])) as unknown as SummaryRow[];
  const page = rows.slice(0, built.limit);
  const hasMore = rows.length > built.limit;
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeCursor({
          v: 1,
          sort: built.sort,
          f: filterFingerprint(query),
          k: cursorTupleForRow(built.sort, last as unknown as Record<string, unknown>),
        })
      : null;
  return { items: page.map(toSummary), nextCursor };
}

/**
 * Public detail. Unknown slug, unpublished product, draft/archived row,
 * suspended store, and malformed input ALL return null — one outcome, no
 * oracle.
 */
export async function getChannelProduct(
  query: ChannelListQuery & { productSlug: string },
  sql: Sql = getDb(),
): Promise<ChannelProductDetail | null> {
  const rows = (await sql.unsafe(
    `SELECT "p"."id","p"."slug","p"."title","p"."brand","p"."min_price_cents","p"."currency",
            "p"."rating_count","p"."created_at","p"."sales_count","p"."description","p"."attributes","p"."status",
            "s"."slug" AS "store_slug","s"."name" AS "store_name"
     ${VISIBILITY_WHERE}
     LIMIT 1;`,
    visibilityArgs(query, query.productSlug) as never[],
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
