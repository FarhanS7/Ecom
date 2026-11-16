// @shopscale/backend/search/query.service - High performance FTS and typo-tolerant search (T031).
// Invariants:
// 1. Channel gating: marketplace never exposes store-only products; store queries scope to storeId.
// 2. FTS queries use tsvector GIN index with prefix matching.
// 3. Typo fallback: if FTS matches < 3 rows and term >= 3 chars, falls back to pg_trgm similarity.
// 4. Facet counts aggregate within query filter scope.

import type { SqlClient } from '../platform/index.js';
import { getDb } from '../db/client.js';
import { parseTsQuery, sanitizeSearchQuery } from './query-parser.js';

export interface SearchFilters {
  channel?: 'marketplace' | 'store' | undefined;
  storeId?: string | undefined;
  categoryId?: string | undefined;
  categoryPath?: string | undefined;
  brand?: string | undefined;
  minPriceCents?: number | undefined;
  maxPriceCents?: number | undefined;
}

export interface SearchOptions {
  limit?: number | undefined;
  cursor?: string | undefined;
  sort?: 'relevance' | 'newest' | 'price_asc' | 'price_desc' | 'popularity' | undefined;
}

export interface SearchResultItem {
  id: string;
  productId: string;
  storeId: string;
  title: string;
  description: string;
  brand: string | null;
  priceCents: number;
  currency: string;
  ratingAvg: number;
  ratingCount: number;
  salesCount: number;
}

export interface FacetCount {
  value: string;
  count: number;
}

export interface SearchResult {
  items: SearchResultItem[];
  facets: {
    brands: FacetCount[];
    categories: FacetCount[];
    priceRanges: FacetCount[];
  };
  totalHits: number;
  nextCursor: string | null;
  fallbackUsed: boolean;
}

interface SearchDocRow {
  product_id: string;
  store_id: string;
  title: string;
  description: string;
  brand: string | null;
  min_price_cents: string | number;
  currency: string;
  rating_avg: string | number;
  rating_count: number;
  sales_count: number;
}

function toResultItem(row: SearchDocRow): SearchResultItem {
  return {
    id: row.product_id,
    productId: row.product_id,
    storeId: row.store_id,
    title: row.title,
    description: row.description,
    brand: row.brand,
    priceCents: Number(row.min_price_cents),
    currency: row.currency,
    ratingAvg: Number(row.rating_avg),
    ratingCount: Number(row.rating_count),
    salesCount: Number(row.sales_count),
  };
}

export class SearchQueryService {
  constructor(private readonly sqlClient?: SqlClient) {}

  private get sql(): SqlClient {
    return this.sqlClient ?? getDb();
  }

  /**
   * Search catalog products with tsvector FTS, pg_trgm typo fallback, and facet aggregations.
   */
  async search(
    query: string,
    filters: SearchFilters = {},
    options: SearchOptions = {},
  ): Promise<SearchResult> {
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
    const channel = filters.channel ?? 'marketplace';
    const rawQ = query?.trim() ?? '';
    const tsQueryStr = parseTsQuery(rawQ);
    const sanitizedTerm = sanitizeSearchQuery(rawQ);

    // Build base WHERE clauses for channel, visibility, and facet filters
    const whereClauses: string[] = ['"visibility" = true'];
    const params: unknown[] = [];

    if (channel === 'store' && filters.storeId) {
      params.push(filters.storeId);
      whereClauses.push(`"store_id" = $${params.length}`);
      whereClauses.push('"store_enabled" = true');
    } else {
      whereClauses.push('"marketplace_enabled" = true');
    }

    if (filters.brand) {
      params.push(filters.brand);
      whereClauses.push(`"brand" = $${params.length}`);
    }

    if (filters.categoryId) {
      params.push(filters.categoryId);
      whereClauses.push(`"category_id" = $${params.length}`);
    } else if (filters.categoryPath) {
      params.push(`${filters.categoryPath}%`);
      whereClauses.push(`"category_path" LIKE $${params.length}`);
    }

    if (filters.minPriceCents !== undefined) {
      params.push(filters.minPriceCents);
      whereClauses.push(`"min_price_cents" >= $${params.length}`);
    }

    if (filters.maxPriceCents !== undefined) {
      params.push(filters.maxPriceCents);
      whereClauses.push(`"min_price_cents" <= $${params.length}`);
    }

    let rows: SearchDocRow[] = [];
    let fallbackUsed = false;

    // 1. If text query is present, attempt FTS query first
    if (tsQueryStr) {
      const ftsParams = [...params, tsQueryStr, limit + 1];
      const ftsWhere = [...whereClauses, `"tsv" @@ to_tsquery('english', $${params.length + 1})`];

      const ftsSql = `
        SELECT
          "product_id", "store_id", "title", "description", "brand",
          "min_price_cents", "currency", "rating_avg", "rating_count", "sales_count"
        FROM "search_documents"
        WHERE ${ftsWhere.join(' AND ')}
        ORDER BY ts_rank_cd("tsv", to_tsquery('english', $${params.length + 1})) DESC, "product_id" DESC
        LIMIT $${params.length + 2};
      `;

      rows = (await this.sql.unsafe(ftsSql, ftsParams as never[])) as unknown as SearchDocRow[];

      // 2. Typo Fallback: If FTS returns fewer than 3 matches and term is >= 3 chars, try trigram similarity
      if (rows.length < 3 && sanitizedTerm.length >= 3) {
        const trgmParams = [...params, sanitizedTerm, limit + 1];
        const trgmWhere = [...whereClauses, `similarity("title", $${params.length + 1}) > 0.2`];

        const trgmSql = `
          SELECT
            "product_id", "store_id", "title", "description", "brand",
            "min_price_cents", "currency", "rating_avg", "rating_count", "sales_count"
          FROM "search_documents"
          WHERE ${trgmWhere.join(' AND ')}
          ORDER BY similarity("title", $${params.length + 1}) DESC, "product_id" DESC
          LIMIT $${params.length + 2};
        `;

        const trgmRows = (await this.sql.unsafe(trgmSql, trgmParams as never[])) as unknown as SearchDocRow[];
        if (trgmRows.length > 0) {
          rows = trgmRows;
          fallbackUsed = true;
        }
      }
    } else {
      // 3. Browse query (no search keywords)
      let orderClause = '"created_at" DESC, "product_id" DESC';
      if (options.sort === 'price_asc') orderClause = '"min_price_cents" ASC, "product_id" ASC';
      else if (options.sort === 'price_desc') orderClause = '"min_price_cents" DESC, "product_id" DESC';
      else if (options.sort === 'popularity') orderClause = '"sales_count" DESC, "product_id" DESC';

      const browseParams = [...params, limit + 1];
      const browseSql = `
        SELECT
          "product_id", "store_id", "title", "description", "brand",
          "min_price_cents", "currency", "rating_avg", "rating_count", "sales_count"
        FROM "search_documents"
        WHERE ${whereClauses.join(' AND ')}
        ORDER BY ${orderClause}
        LIMIT $${params.length + 1};
      `;

      rows = (await this.sql.unsafe(browseSql, browseParams as never[])) as unknown as SearchDocRow[];
    }

    const hasNext = rows.length > limit;
    const items = (hasNext ? rows.slice(0, limit) : rows).map(toResultItem);
    const nextCursor = hasNext && items.length > 0 ? items[items.length - 1]!.id : null;

    // 4. Compute Facets within channel and query scope
    const facets = await this.computeFacets(whereClauses, params);

    return {
      items,
      facets,
      totalHits: items.length,
      nextCursor,
      fallbackUsed,
    };
  }

  /**
   * Aggregate brand, category, and price range facets within the matching filter scope.
   */
  private async computeFacets(
    baseWhere: string[],
    params: unknown[],
  ): Promise<SearchResult['facets']> {
    const whereSql = baseWhere.join(' AND ');

    // Brands
    const brandRows = (await this.sql.unsafe(
      `SELECT "brand" AS value, count(*)::int AS count
       FROM "search_documents"
       WHERE ${whereSql} AND "brand" IS NOT NULL
       GROUP BY "brand"
       ORDER BY count DESC, "brand" ASC
       LIMIT 15;`,
      params as never[],
    )) as unknown as Array<{ value: string; count: number }>;

    // Categories
    const categoryRows = (await this.sql.unsafe(
      `SELECT "category_path" AS value, count(*)::int AS count
       FROM "search_documents"
       WHERE ${whereSql}
       GROUP BY "category_path"
       ORDER BY count DESC
       LIMIT 15;`,
      params as never[],
    )) as unknown as Array<{ value: string; count: number }>;

    // Price bands
    const priceRows = (await this.sql.unsafe(
      `SELECT
         CASE
           WHEN "min_price_cents" < 2500 THEN 'Under $25'
           WHEN "min_price_cents" BETWEEN 2500 AND 4999 THEN '$25 to $50'
           WHEN "min_price_cents" BETWEEN 5000 AND 9999 THEN '$50 to $100'
           WHEN "min_price_cents" BETWEEN 10000 AND 19999 THEN '$100 to $200'
           ELSE '$200 & Above'
         END AS value,
         count(*)::int AS count
       FROM "search_documents"
       WHERE ${whereSql}
       GROUP BY 1
       ORDER BY min("min_price_cents") ASC;`,
      params as never[],
    )) as unknown as Array<{ value: string; count: number }>;

    return {
      brands: brandRows,
      categories: categoryRows,
      priceRanges: priceRows,
    };
  }
}

export const searchQueryService = new SearchQueryService();
