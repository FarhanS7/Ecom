// @shopscale/backend/search/projector - Materialized search projection handler (T030).
// Invariants:
// 1. Idempotent receipt deduplication via consumer_receipts.
// 2. Strict version monotonicity: rejects stale out-of-order events (aggregateVersion <= source_version).
// 3. Generates visibility flag (active status + published on at least one channel).
// 4. Sets tombstone (visibility = false) for archived/draft products.

import type { Queryable } from '../identity/auth.service.js';
import { recordConsumerReceipt } from '../platform/consumer.js';

export type ProjectionStatus =
  | 'PROJECTED'
  | 'DUPLICATE_IGNORED'
  | 'STALE_VERSION_IGNORED'
  | 'PRODUCT_NOT_FOUND';

export interface ProjectionOutcome {
  status: ProjectionStatus;
  productId: string;
  version?: number;
  currentVersion?: number;
}

export interface ProjectableEvent {
  id: string;
  aggregateId: string;
  aggregateVersion?: number;
  type: string;
  payload?: unknown;
}

interface CanonicalProductRow {
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

export async function projectProductEvent(
  tx: Queryable,
  event: ProjectableEvent,
): Promise<ProjectionOutcome> {
  const consumerName = 'search-projection';

  // 1. Deduplication via consumer_receipts
  const isNew = await recordConsumerReceipt(tx, consumerName, event.id);
  if (!isNew) {
    return {
      status: 'DUPLICATE_IGNORED',
      productId: event.aggregateId,
    };
  }

  // 2. Monotonicity guard: check existing projection version
  const existingDocs = (await tx.unsafe(
    `SELECT "source_version" FROM "search_documents" WHERE "product_id" = $1;`,
    [event.aggregateId],
  )) as unknown as Array<{ source_version: number }>;

  if (existingDocs.length > 0 && event.aggregateVersion !== undefined) {
    const currentVersion = Number(existingDocs[0]!.source_version);
    if (event.aggregateVersion <= currentVersion) {
      return {
        status: 'STALE_VERSION_IGNORED',
        productId: event.aggregateId,
        currentVersion,
        version: event.aggregateVersion,
      };
    }
  }

  // 3. Fetch canonical product state
  const rows = (await tx.unsafe(
    `SELECT
       p."id", p."store_id", p."version", p."title", p."description",
       p."brand", p."category_id", c."path" AS "category_path",
       p."attributes", p."min_price_cents", p."currency", p."status",
       p."rating_sum", p."rating_count", p."sales_count",
       pub."marketplace_enabled", pub."store_enabled"
     FROM "products" p
     LEFT JOIN "product_publications" pub ON pub."product_id" = p."id"
     LEFT JOIN "categories" c ON c."id" = p."category_id"
     WHERE p."id" = $1;`,
    [event.aggregateId],
  )) as unknown as CanonicalProductRow[];

  const product = rows[0];
  if (!product) {
    return {
      status: 'PRODUCT_NOT_FOUND',
      productId: event.aggregateId,
    };
  }

  // 4. Compute projection fields
  const marketplaceEnabled = Boolean(product.marketplace_enabled);
  const storeEnabled = Boolean(product.store_enabled);
  const isVisible = product.status === 'active' && (marketplaceEnabled || storeEnabled);
  const ratingAvg =
    product.rating_count > 0
      ? (Number(product.rating_sum) / Number(product.rating_count)).toFixed(2)
      : '0.00';

  // 5. Upsert into search_documents
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
       "updated_at" = now();`,
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
      true, // available (active stock evaluated by inventory consumer in T038)
      ratingAvg,
      Number(product.rating_count),
      Number(product.sales_count),
    ],
  );

  return {
    status: 'PROJECTED',
    productId: product.id,
    version: product.version,
  };
}

export interface ProductProjectorPort {
  project(tx: Queryable, event: ProjectableEvent): Promise<ProjectionOutcome>;
}

export const productProjector: ProductProjectorPort = {
  project: projectProductEvent,
};
