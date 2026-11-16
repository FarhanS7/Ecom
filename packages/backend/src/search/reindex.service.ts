// @shopscale/backend/search/reindex.service - Zero-downtime full search reindexing (T034).
// Invariants:
// 1. Keyset cursor batching (p.id > lastId ORDER BY p.id ASC LIMIT batchSize) prevents deep OFFSET overhead.
// 2. Zero-downtime: UPSERT preserves search availability throughout the reindex process.
// 3. Concurrency-safe: ON CONFLICT DO UPDATE WHERE search_documents.source_version <= EXCLUDED.source_version
//    prevents overwriting newer live edits with older snapshot state.
// 4. Import-safe: lazily connects to DB.

import type { SqlClient } from '../platform/index.js';
import { getDb } from '../db/client.js';
import { redisCacheService } from '../platform/cache.service.js';

export interface ReindexOptions {
  batchSize?: number;
  storeSlug?: string;
  onProgress?: (progress: { processed: number; total: number; batchCount: number }) => void;
}

export interface ReindexResult {
  totalProducts: number;
  reindexedCount: number;
  batches: number;
  durationMs: number;
}

interface ProductReindexRow {
  id: string;
  store_id: string;
  version: number;
  title: string;
  description: string;
  brand: string | null;
  category_id: string | null;
  category_path: string | null;
  attributes: unknown;
  min_price_cents: string | number;
  currency: string;
  status: 'draft' | 'active' | 'archived';
  rating_sum: number;
  rating_count: number;
  sales_count: number;
  marketplace_enabled: boolean | null;
  store_enabled: boolean | null;
}

export class ReindexService {
  constructor(private readonly sqlClient?: SqlClient) {}

  private get sql(): SqlClient {
    return this.sqlClient ?? getDb();
  }

  async reindex(options: ReindexOptions = {}): Promise<ReindexResult> {
    const startTime = Date.now();
    const batchSize = Math.max(1, options.batchSize ?? 500);
    const storeSlug = options.storeSlug;

    // 1. Count total matching products
    let totalProducts = 0;
    if (storeSlug) {
      const countRows = (await this.sql.unsafe(
        `SELECT count(*)::int AS count
         FROM "products" p
         JOIN "stores" s ON s."id" = p."store_id"
         WHERE s."slug" = $1;`,
        [storeSlug],
      )) as unknown as Array<{ count: number }>;
      totalProducts = Number(countRows[0]?.count ?? 0);
    } else {
      const countRows = (await this.sql.unsafe(
        `SELECT count(*)::int AS count FROM "products";`,
      )) as unknown as Array<{ count: number }>;
      totalProducts = Number(countRows[0]?.count ?? 0);
    }

    let processedCount = 0;
    let batchCount = 0;
    let lastId = '';
    let hasMore = true;

    // 2. Process products in bounded keyset batches
    while (hasMore) {
      let rows: ProductReindexRow[];

      if (storeSlug) {
        rows = (await this.sql.unsafe(
          `SELECT
             p."id", p."store_id", p."version", p."title", p."description",
             p."brand", p."category_id", c."path" AS "category_path",
             p."attributes", p."min_price_cents", p."currency", p."status",
             p."rating_sum", p."rating_count", p."sales_count",
             pub."marketplace_enabled", pub."store_enabled"
           FROM "products" p
           JOIN "stores" s ON s."id" = p."store_id"
           LEFT JOIN "product_publications" pub ON pub."product_id" = p."id"
           LEFT JOIN "categories" c ON c."id" = p."category_id"
           WHERE p."id" > $1 AND s."slug" = $2
           ORDER BY p."id" ASC
           LIMIT $3;`,
          [lastId, storeSlug, batchSize],
        )) as unknown as ProductReindexRow[];
      } else {
        rows = (await this.sql.unsafe(
          `SELECT
             p."id", p."store_id", p."version", p."title", p."description",
             p."brand", p."category_id", c."path" AS "category_path",
             p."attributes", p."min_price_cents", p."currency", p."status",
             p."rating_sum", p."rating_count", p."sales_count",
             pub."marketplace_enabled", pub."store_enabled"
           FROM "products" p
           LEFT JOIN "product_publications" pub ON pub."product_id" = p."id"
           LEFT JOIN "categories" c ON c."id" = p."category_id"
           WHERE p."id" > $1
           ORDER BY p."id" ASC
           LIMIT $2;`,
          [lastId, batchSize],
        )) as unknown as ProductReindexRow[];
      }

      if (rows.length === 0) {
        hasMore = false;
        break;
      }

      batchCount++;

      // Upsert batch inside transaction
      await this.sql.begin(async (tx) => {
        for (const product of rows) {
          const marketplaceEnabled = Boolean(product.marketplace_enabled);
          const storeEnabled = Boolean(product.store_enabled);
          const isVisible = product.status === 'active' && (marketplaceEnabled || storeEnabled);
          const ratingAvg =
            product.rating_count > 0
              ? (Number(product.rating_sum) / Number(product.rating_count)).toFixed(2)
              : '0.00';

          await tx.unsafe(
            `INSERT INTO "search_documents" (
               "product_id", "store_id", "source_version", "title", "description",
               "brand", "category_id", "category_path", "attributes", "min_price_cents",
               "currency", "marketplace_enabled", "store_enabled", "visibility", "available",
               "rating_avg", "rating_count", "sales_count", "updated_at"
             ) VALUES (
               $1, $2, $3, $4, $5,
               $6, $7, $8, $9::text::jsonb, $10,
               $11, $12, $13, $14, $15,
               $16, $17, $18, now()
             )
             ON CONFLICT ("product_id") DO UPDATE SET
               "store_id" = EXCLUDED."store_id",
               "source_version" = EXCLUDED."source_version",
               "title" = EXCLUDED."title",
               "description" = EXCLUDED."description",
               "brand" = EXCLUDED."brand",
               "category_id" = EXCLUDED."category_id",
               "category_path" = EXCLUDED."category_path",
               "attributes" = EXCLUDED."attributes",
               "min_price_cents" = EXCLUDED."min_price_cents",
               "currency" = EXCLUDED."currency",
               "marketplace_enabled" = EXCLUDED."marketplace_enabled",
               "store_enabled" = EXCLUDED."store_enabled",
               "visibility" = EXCLUDED."visibility",
               "available" = EXCLUDED."available",
               "rating_avg" = EXCLUDED."rating_avg",
               "rating_count" = EXCLUDED."rating_count",
               "sales_count" = EXCLUDED."sales_count",
               "updated_at" = now()
             WHERE search_documents.source_version <= EXCLUDED.source_version;`,
            [
              product.id,
              product.store_id,
              product.version,
              product.title,
              product.description,
              product.brand,
              product.category_id,
              product.category_path ?? '/',
              JSON.stringify(product.attributes ?? {}),
              Number(product.min_price_cents),
              product.currency,
              marketplaceEnabled,
              storeEnabled,
              isVisible,
              true,
              ratingAvg,
              Number(product.rating_count),
              Number(product.sales_count),
            ],
          );
        }
      });

      processedCount += rows.length;
      lastId = rows[rows.length - 1]!.id;

      if (options.onProgress) {
        options.onProgress({
          processed: processedCount,
          total: totalProducts,
          batchCount,
        });
      }
    }

    // Invalidate PDP cache after reindex
    try {
      await redisCacheService.invalidatePattern('cache:pdp:*');
    } catch {
      // Degrade gracefully
    }

    const durationMs = Date.now() - startTime;

    return {
      totalProducts,
      reindexedCount: processedCount,
      batches: batchCount,
      durationMs,
    };
  }
}

export const reindexService = new ReindexService();
