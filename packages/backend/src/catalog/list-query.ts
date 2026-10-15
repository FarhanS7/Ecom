// @shopscale/backend/catalog/list-query - Keyset list query builder (T022a).
// Owns the SINGLE visibility WHERE shape shared by the marketplace/store
// list and detail paths (module invariant: public reads recheck the full
// chain), the closed sort orders, and the per-sort keyset predicate.
//
// Keyset (not offset) pagination: the predicate is expressed as a POSTGRES
// ROW COMPARISON on the sort tuple `(a, b) </> ($n, $n+1)`, which matches
// the index order exactly and needs no dynamic arithmetic — so changing
// nothing but the cursor cannot change the result set (no duplicate or
// skipped rows under concurrent writes on a fixed dataset).
//
// Column-type casts on the keyset params keep Postgres from guessing:
// `$7::timestamptz,$8::uuid`, `$7::bigint,$8::uuid`, `$7::int,$8::uuid`.

import { decodeCursor, filterFingerprint } from './cursor.js';
import type { CursorFilterInput, CursorPayload, CatalogSort } from './cursor.js';

export class CursorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CursorError';
  }
}

/**
 * Visibility predicate shared by list and detail. Parameters:
 * $1 channel ('marketplace'|'store'), $2 storeSlug ('' = marketplace),
 * $3 categorySlug ('' = any), $4 minPrice (-1 = any), $5 maxPrice
 * (-1 = any), $6 productSlug ('' = list-all / detail-by-slug).
 */
export const VISIBILITY_WHERE = `
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

/** Positional args for VISIBILITY_WHERE with an explicit product slug. */
export function visibilityArgs(input: CursorFilterInput, productSlug = ''): unknown[] {
  return [
    input.channel,
    input.storeSlug ?? '',
    input.categorySlug ?? '',
    input.minPriceCents ?? -1,
    input.maxPriceCents ?? -1,
    productSlug,
  ];
}

/** Closed sort → ORDER fragment. Every order ends in id: a TOTAL order. */
export const ORDER_FRAGMENTS: Record<CatalogSort, string> = {
  newest: `"p"."created_at" DESC, "p"."id" DESC`,
  price_asc: `"p"."min_price_cents" ASC, "p"."id" ASC`,
  price_desc: `"p"."min_price_cents" DESC, "p"."id" DESC`,
  popularity: `"p"."sales_count" DESC, "p"."id" DESC`,
};

/** Per-sort keyset comparison against ($7, $8): matches ORDER_FRAGMENTS. */
const KEYSET_FRAGMENTS: Record<CatalogSort, string> = {
  newest: `("p"."created_at","p"."id") < ($7::timestamptz,$8::uuid)`,
  price_asc: `("p"."min_price_cents","p"."id") > ($7::bigint,$8::uuid)`,
  price_desc: `("p"."min_price_cents","p"."id") < ($7::bigint,$8::uuid)`,
  popularity: `("p"."sales_count","p"."id") < ($7::int,$8::uuid)`,
};

export interface ListQueryInput extends CursorFilterInput {
  limit?: number | undefined;
  cursor?: string | undefined;
}

export interface BuiltListQuery {
  text: string;
  /** Bound parameters in order (visibility, then keyset tuple). */
  args: unknown[];
  /** Effective page size (after clamping) — rows to return, not to fetch. */
  limit: number;
  /** Sort actually used (defaults applied). */
  sort: CatalogSort;
}

/** Pure: derive the cursor tuple for a row of a given sort. */
export function cursorTupleForRow(sort: CatalogSort, row: Record<string, unknown>): [string | number, string] {
  switch (sort) {
    case 'newest': {
      const value = row['created_at'];
      return [value instanceof Date ? value.toISOString() : String(value), String(row['id'])];
    }
    case 'price_asc':
    case 'price_desc':
      return [Number(row['min_price_cents']), String(row['id'])];
    case 'popularity':
      return [Number(row['sales_count']), String(row['id'])];
  }
}

/**
 * Build the list SQL. Fetch `limit + 1` rows so the caller can tell whether
 * a further page exists without a second query. A cursor whose sort or
 * filter fingerprint disagrees with the request is a CursorError.
 */
export function buildListQuery(input: ListQueryInput): BuiltListQuery {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
  const sort = input.sort ?? 'newest';
  const args: unknown[] = visibilityArgs(input);
  let keyset = '';
  if (input.cursor !== undefined && input.cursor !== '') {
    const decoded: CursorPayload | null = decodeCursor(input.cursor);
    if (!decoded) throw new CursorError('Malformed cursor.');
    if (decoded.sort !== sort) throw new CursorError('Cursor was issued for a different sort.');
    if (decoded.f !== filterFingerprint(input)) {
      throw new CursorError('Cursor was issued for a different channel or filter set.');
    }
    keyset = `\n    AND ${KEYSET_FRAGMENTS[sort]}`;
    args.push(decoded.k[0], decoded.k[1]);
  }
  const text =
    `SELECT "p"."id","p"."slug","p"."title","p"."brand","p"."min_price_cents","p"."currency",` +
    `"p"."rating_count","p"."created_at","p"."sales_count"` +
    `${VISIBILITY_WHERE}${keyset}\n    ORDER BY ${ORDER_FRAGMENTS[sort]}\n    LIMIT ${limit + 1};`;
  return { text, args, limit, sort };
}
