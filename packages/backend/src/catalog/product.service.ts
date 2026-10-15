// @shopscale/backend/catalog/product.service - Seller catalog mutations
// (T020a). Every mutation is store-scoped IN THE STATEMENT (store_id in the
// WHERE), versioned with optimistic concurrency: two writers submitting the
// same expectedVersion produce exactly one success — the loser's UPDATE
// matches zero rows because the winner already bumped the version.
//
// min_price_cents is DERIVED from active variants after every variant or
// product-status change (module invariant: not a second editable price).
// Publication toggles live in product_publications and bump the product
// version in the SAME transaction so read projections never see a version
// without its visibility state.

import type { Sql } from 'postgres';
import { getDb } from '../db/client.js';
import type { Queryable } from '../identity/auth.service.js';

export type CatalogFailure = 'NOT_FOUND' | 'VERSION_CONFLICT' | 'CONFLICT';

export class CatalogError extends Error {
  readonly failure: CatalogFailure;

  constructor(failure: CatalogFailure, message: string) {
    super(message);
    this.failure = failure;
  }
}

export interface ProductMutateInput {
  storeId: string;
  productId: string;
  expectedVersion: number;
}

export interface ProductCreateInput {
  storeId: string;
  categoryId: string | null;
  slug: string;
  title: string;
  description: string;
  brand: string | null;
  attributes: Record<string, unknown>;
  currency: string;
}

export interface ProductState {
  id: string;
  storeId: string;
  categoryId: string | null;
  slug: string;
  title: string;
  description: string;
  brand: string | null;
  status: 'draft' | 'active' | 'archived';
  attributes: Record<string, unknown>;
  minPriceCents: number;
  currency: string;
  version: number;
  marketplaceEnabled: boolean;
  storeEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VariantState {
  id: string;
  productId: string;
  sku: string;
  priceCents: number;
  attributes: Record<string, unknown>;
  status: 'active' | 'inactive';
}

const PRODUCT_COLUMNS = `"id","store_id","category_id","slug","title","description","brand","status",
  "attributes","min_price_cents","currency","version","created_at","updated_at"`;

interface ProductRow {
  id: string;
  store_id: string;
  category_id: string | null;
  slug: string;
  title: string;
  description: string;
  brand: string | null;
  status: string;
  attributes: unknown;
  min_price_cents: string | number;
  currency: string;
  version: number;
  created_at: Date;
  updated_at: Date;
}

interface JoinedRow extends ProductRow {
  marketplace_enabled: boolean | null;
  store_enabled: boolean | null;
}

function toProduct(row: JoinedRow): ProductState {
  return {
    id: row.id,
    storeId: row.store_id,
    categoryId: row.category_id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    brand: row.brand,
    status: row.status as ProductState['status'],
    attributes: row.attributes as Record<string, unknown>,
    minPriceCents: Number(row.min_price_cents),
    currency: row.currency,
    version: row.version,
    marketplaceEnabled: row.marketplace_enabled ?? false,
    storeEnabled: row.store_enabled ?? false,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function toVariant(row: {
  id: string;
  product_id: string;
  sku: string;
  price_cents: string | number;
  attributes: unknown;
  status: string;
}): VariantState {
  return {
    id: row.id,
    productId: row.product_id,
    sku: row.sku,
    priceCents: Number(row.price_cents),
    attributes: row.attributes as Record<string, unknown>,
    status: row.status as VariantState['status'],
  };
}

/** Recompute the product's derived min price from its ACTIVE variants. */
async function refreshMinPrice(tx: Queryable, storeId: string, productId: string): Promise<void> {
  await tx.unsafe(
    `UPDATE "products" p SET "min_price_cents" = COALESCE(
       (SELECT min("price_cents") FROM "product_variants" v
        WHERE v."store_id" = p."store_id" AND v."product_id" = p."id" AND v."status" = 'active'), 0)
     WHERE p."store_id" = $1 AND p."id" = $2;`,
    [storeId, productId],
  );
}

async function readProductScoped(tx: Queryable, storeId: string, productId: string): Promise<ProductState> {
  const rows = (await tx.unsafe(
    `SELECT ${PRODUCT_COLUMNS}, pub."marketplace_enabled", pub."store_enabled"
     FROM "products" p LEFT JOIN "product_publications" pub ON pub."product_id" = p."id"
     WHERE p."store_id" = $1 AND p."id" = $2;`,
    [storeId, productId],
  )) as unknown as JoinedRow[];
  const row = rows[0];
  // Foreign-store and unknown IDs share one outcome (no existence oracle).
  if (!row) throw new CatalogError('NOT_FOUND', 'Product not found.');
  return toProduct(row);
}

export async function createProduct(input: ProductCreateInput, sql: Sql = getDb()): Promise<ProductState> {
  return sql.begin(async (tx) => {
    let rows: ProductRow[];
    try {
      rows = (await tx.unsafe(
        `INSERT INTO "products" ("store_id","category_id","slug","title","description","brand","attributes","currency")
         VALUES ($1,$2,$3,$4,$5,$6,$7::text::jsonb,$8)
         RETURNING ${PRODUCT_COLUMNS};`,
        [
          input.storeId,
          input.categoryId,
          input.slug,
          input.title,
          input.description,
          input.brand,
          // Serialized here and parsed by the database via ::text::jsonb. A bare
          // ::jsonb (or an uncast parameter against a jsonb column) makes Postgres
          // infer the parameter as jsonb, and the driver then JSON-encodes this
          // string a second time, storing a JSON STRING instead of an object.
          // Proven live in T028c.
          JSON.stringify(input.attributes),
          input.currency,
        ],
      )) as unknown as ProductRow[];
    } catch (err) {
      // A duplicate slug is an ordinary seller mistake (T027's console), not a
      // server fault: map the scoped unique index to the same 409 shape as a
      // duplicate SKU instead of letting the constraint surface as a 500.
      const message = err instanceof Error ? err.message : '';
      if (message.includes('products_store_slug_uniq')) {
        throw new CatalogError('CONFLICT', 'Slug already exists in this store.');
      }
      throw err;
    }
    const row = rows[0];
    if (!row) throw new Error('Product insert returned no row.');
    await tx.unsafe(`INSERT INTO "product_publications" ("product_id") VALUES ($1);`, [row.id]);
    return readProductScoped(tx, input.storeId, row.id);
  });
}

const UPDATABLE = {
  title: 'title',
  description: 'description',
  brand: 'brand',
  categoryId: 'category_id',
  attributes: 'attributes',
  status: 'status',
} as const;

export interface ProductPatch {
  title?: string | undefined;
  description?: string | undefined;
  brand?: string | null | undefined;
  categoryId?: string | null | undefined;
  attributes?: Record<string, unknown> | undefined;
  /** Lifecycle transition (T027a): draft <-> active only; archive is its own route. */
  status?: 'draft' | 'active' | undefined;
}

/**
 * Versioned update. The WHERE clause carries the expected version: zero
 * matched rows means someone else won the race (or the product vanished) —
 * both collapse to VERSION_CONFLICT/NOT_FOUND by re-reading once.
 */
export async function updateProduct(input: ProductMutateInput & { patch: ProductPatch }, sql: Sql = getDb()): Promise<ProductState> {
  const status = input.patch.status;
  // Defense in depth: the HTTP boundary rejects an unknown status as malformed
  // input, but the column carries a CHECK constraint — an unvalidated value
  // would surface as a 500 instead of a typed refusal.
  if (status !== undefined && status !== 'draft' && status !== 'active') {
    throw new CatalogError('CONFLICT', 'Invalid product status.');
  }
  return sql.begin(async (tx) => {
    const sets: string[] = [];
    const values: unknown[] = [input.storeId, input.productId, input.expectedVersion];
    for (const [key, column] of Object.entries(UPDATABLE)) {
      const value = (input.patch as Record<string, unknown>)[key];
      if (value !== undefined) {
        // jsonb values are serialized and cast through text (see createProduct).
        values.push(key === 'attributes' ? JSON.stringify(value) : value);
        sets.push(`"${column}" = $${values.length}${column === 'attributes' ? '::text::jsonb' : ''}`);
      }
    }
    if (sets.length === 0) {
      // Nothing to change still verifies the version (read-your-write).
      return readProductScoped(tx, input.storeId, input.productId);
    }
    const rows = (await tx.unsafe(
      `UPDATE "products" SET ${sets.join(', ')}, "updated_at" = now(), "version" = "version" + 1
       WHERE "store_id" = $1 AND "id" = $2 AND "version" = $3
       RETURNING "id";`,
      values as never[],
    )) as unknown as Array<{ id: string }>;
    if (rows.length === 0) {
      // Distinguish "stale version" from "unknown/foreign product".
      await readProductScoped(tx, input.storeId, input.productId); // throws NOT_FOUND if gone
      throw new CatalogError('VERSION_CONFLICT', 'Product was modified by another writer.');
    }
    // Activation precondition runs AFTER the versioned UPDATE: scope and version
    // are already proven (a foreign product failed above), and a refusal here
    // rolls the whole transaction back, so no version bump survives a rejected
    // publish.
    if (status === 'active') await assertHasActiveVariant(tx, input.storeId, input.productId);
    // A status change can change which variants count toward the derived price.
    if (status !== undefined) await refreshMinPrice(tx, input.storeId, input.productId);
    return readProductScoped(tx, input.storeId, input.productId);
  });
}

/**
 * Activation precondition (T027a / ADR-0010): a published product must have at
 * least one ACTIVE variant, because prices and the derived minimum come from
 * variant records — publishing without one would advertise a $0 product.
 */
async function assertHasActiveVariant(tx: Queryable, storeId: string, productId: string): Promise<void> {
  const rows = (await tx.unsafe(
    `SELECT 1 FROM "product_variants"
     WHERE "store_id" = $1 AND "product_id" = $2 AND "status" = 'active' LIMIT 1;`,
    [storeId, productId],
  )) as unknown as unknown[];
  if (rows.length === 0) {
    throw new CatalogError('CONFLICT', 'Add an active variant before publishing this product.');
  }
}

/** Archive: status flip + version bump; rows/variants stay (RESTRICT). */
export async function archiveProduct(input: ProductMutateInput, sql: Sql = getDb()): Promise<ProductState> {
  return sql.begin(async (tx) => {
    const rows = (await tx.unsafe(
      `UPDATE "products" SET "status" = 'archived', "updated_at" = now(), "version" = "version" + 1
       WHERE "store_id" = $1 AND "id" = $2 AND "version" = $3 RETURNING "id";`,
      [input.storeId, input.productId, input.expectedVersion],
    )) as unknown as Array<{ id: string }>;
    if (rows.length === 0) {
      await readProductScoped(tx, input.storeId, input.productId);
      throw new CatalogError('VERSION_CONFLICT', 'Product was modified by another writer.');
    }
    return readProductScoped(tx, input.storeId, input.productId);
  });
}

export async function listStoreProducts(storeId: string, sql: Sql = getDb()): Promise<ProductState[]> {
  const rows = (await sql.unsafe(
    `SELECT ${PRODUCT_COLUMNS}, pub."marketplace_enabled", pub."store_enabled"
     FROM "products" p LEFT JOIN "product_publications" pub ON pub."product_id" = p."id"
     WHERE p."store_id" = $1 ORDER BY p."created_at" DESC, p."id" DESC;`,
    [storeId],
  )) as unknown as JoinedRow[];
  return rows.map(toProduct);
}

export async function getStoreProduct(storeId: string, productId: string, sql: Sql = getDb()): Promise<ProductState> {
  return readProductScoped(sql, storeId, productId);
}

export async function createVariant(
  input: { storeId: string; productId: string; sku: string; priceCents: number; attributes: Record<string, unknown> },
  sql: Sql = getDb(),
): Promise<VariantState> {
  return sql.begin(async (tx) => {
    // Presence check gives NOT_FOUND (not an FK violation oracle).
    await readProductScoped(tx, input.storeId, input.productId);
    let inserted: Array<{ id: string }>;
    try {
      inserted = (await tx.unsafe(
        `INSERT INTO "product_variants" ("product_id","store_id","sku","price_cents","attributes")
         VALUES ($1,$2,$3,$4,$5::text::jsonb) RETURNING "id";`,
        [input.productId, input.storeId, input.sku, input.priceCents, JSON.stringify(input.attributes)],
      )) as unknown as Array<{ id: string }>;
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message.includes('product_variants_store_sku_uniq')) {
        throw new CatalogError('CONFLICT', 'SKU already exists in this store.');
      }
      throw err;
    }
    await tx.unsafe(`UPDATE "products" SET "updated_at" = now(), "version" = "version" + 1 WHERE "store_id" = $1 AND "id" = $2;`, [
      input.storeId,
      input.productId,
    ]);
    await refreshMinPrice(tx, input.storeId, input.productId);
    const rows = (await tx.unsafe(
      `SELECT "id","product_id","sku","price_cents","attributes","status" FROM "product_variants" WHERE "id" = $1;`,
      [inserted[0]!.id],
    )) as unknown as Array<{
      id: string;
      product_id: string;
      sku: string;
      price_cents: string | number;
      attributes: unknown;
      status: string;
    }>;
    return toVariant(rows[0]!);
  });
}

export async function updateVariant(
  input: {
    storeId: string;
    productId: string;
    variantId: string;
    expectedVersion: number;
    patch: { priceCents?: number | undefined; attributes?: Record<string, unknown> | undefined; status?: 'active' | 'inactive' | undefined };
  },
  sql: Sql = getDb(),
): Promise<VariantState> {
  return sql.begin(async (tx) => {
    const sets: string[] = [];
    // Scope and version occupy $1-$4 so the WHERE clause below stays fixed while
    // the SET list grows with the patch. (They used to be appended after the patch
    // values, which shifted the placeholders and made every call fail.)
    const values: unknown[] = [input.storeId, input.variantId, input.productId, input.expectedVersion];
    if (input.patch.priceCents !== undefined) {
      values.push(input.patch.priceCents);
      sets.push(`"price_cents" = $${values.length}`);
    }
    if (input.patch.attributes !== undefined) {
      values.push(JSON.stringify(input.patch.attributes));
      sets.push(`"attributes" = $${values.length}::text::jsonb`);
    }
    if (input.patch.status !== undefined) {
      values.push(input.patch.status);
      sets.push(`"status" = $${values.length}`);
    }
    if (sets.length === 0) {
      throw new CatalogError('CONFLICT', 'Empty variant patch.');
    }
    // Product version gates the variant edit (one optimistic counter per
    // product keeps seller screens simple); the variant row itself is
    // scoped by (store_id, id).
    const rows = (await tx.unsafe(
      `UPDATE "product_variants" v SET ${sets.join(', ')}
       FROM "products" p
       WHERE v."store_id" = $1 AND v."id" = $2 AND p."store_id" = v."store_id"
         AND p."id" = v."product_id" AND p."id" = $3 AND p."version" = $4
       RETURNING v."id", v."product_id", v."sku", v."price_cents", v."attributes", v."status";`,
      values as never[],
    )) as unknown as Array<{
      id: string;
      product_id: string;
      sku: string;
      price_cents: string | number;
      attributes: unknown;
      status: string;
    }>;
    const row = rows[0];
    if (!row) {
      const still = (await tx.unsafe(
        `SELECT 1 FROM "product_variants" v JOIN "products" p ON p."store_id" = v."store_id" AND p."id" = v."product_id"
         WHERE v."store_id" = $1 AND v."id" = $2 AND p."id" = $3;`,
        [input.storeId, input.variantId, input.productId],
      )) as unknown as unknown[];
      if (still.length === 0) throw new CatalogError('NOT_FOUND', 'Variant not found.');
      throw new CatalogError('VERSION_CONFLICT', 'Product was modified by another writer.');
    }
    await tx.unsafe(`UPDATE "products" SET "updated_at" = now(), "version" = "version" + 1 WHERE "store_id" = $1 AND "id" = $2;`, [
      input.storeId,
      input.productId,
    ]);
    await refreshMinPrice(tx, input.storeId, input.productId);
    return toVariant(row);
  });
}

export async function listVariants(storeId: string, productId: string, sql: Sql = getDb()): Promise<VariantState[]> {
  const rows = (await sql.unsafe(
    `SELECT v."id","product_id","sku","price_cents","attributes","status"
     FROM "product_variants" v JOIN "products" p ON p."store_id" = v."store_id" AND p."id" = v."product_id"
     WHERE v."store_id" = $1 AND v."product_id" = $2 ORDER BY v."sku";`,
    [storeId, productId],
  )) as unknown as Array<{
    id: string;
    product_id: string;
    sku: string;
    price_cents: string | number;
    attributes: unknown;
    status: string;
  }>;
  return rows.map(toVariant);
}

/**
 * Publication toggles: independent flags, version bumped in the same
 * transaction (module spec: unlisting from marketplace keeps store
 * visibility when store_enabled stays true).
 */
export async function setPublication(
  input: {
    storeId: string;
    productId: string;
    marketplaceEnabled?: boolean | undefined;
    storeEnabled?: boolean | undefined;
  },
  sql: Sql = getDb(),
): Promise<ProductState> {
  return sql.begin(async (tx) => {
    await readProductScoped(tx, input.storeId, input.productId); // scoped presence
    const sets: string[] = [];
    const values: unknown[] = [input.productId];
    if (input.marketplaceEnabled !== undefined) {
      values.push(input.marketplaceEnabled);
      sets.push(`"marketplace_enabled" = $${values.length}`);
    }
    if (input.storeEnabled !== undefined) {
      values.push(input.storeEnabled);
      sets.push(`"store_enabled" = $${values.length}`);
    }
    if (sets.length === 0) throw new CatalogError('CONFLICT', 'Empty publication patch.');
    // published_at reflects "visible on at least one channel".
    await tx.unsafe(
      `UPDATE "product_publications" SET ${sets.join(', ')}
       WHERE "product_id" = $1
       RETURNING "marketplace_enabled","store_enabled";`,
      values as never[],
    );
    await tx.unsafe(
      `UPDATE "product_publications" SET "published_at" = CASE
         WHEN "marketplace_enabled" OR "store_enabled" THEN COALESCE("published_at", now())
         ELSE NULL END
       WHERE "product_id" = $1;`,
      [input.productId],
    );
    await tx.unsafe(`UPDATE "products" SET "updated_at" = now(), "version" = "version" + 1 WHERE "store_id" = $1 AND "id" = $2;`, [
      input.storeId,
      input.productId,
    ]);
    return readProductScoped(tx, input.storeId, input.productId);
  });
}
