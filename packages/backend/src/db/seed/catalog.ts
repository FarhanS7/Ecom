// @shopscale/backend/db/seed/catalog - T028b catalog generators.
//
// Same split as identity.ts: planCatalog() is pure (so determinism, slug/SKU
// scope, and the derived-price invariant are unit-testable without a database)
// and writeCatalog() is the batched, idempotent SQL writer.
//
// The plan deliberately produces every storefront state the read path has to
// handle, not just a happy path:
//   * store 0 "seed-alpha" — both channels
//   * store 1 "seed-beta"  — the store channel ONLY (never the marketplace)
//   * store 2 "seed-gamma" — an active store with NO products (the empty state)
// and, inside a catalogued store: active+listed, active+unlisted, draft with a
// channel flag set (the "on (not live)" case), and archived with flags set.
// None of the last three may ever be visible; the T028c spec asserts exactly that.

import type { Sql } from 'postgres';
import { buildCategoryPath } from '../../catalog/category.service.js';
import { insertChunked, orderedStores, type IdentityPlan } from './identity.js';
import {
  canonicalJson,
  idFor,
  intBetween,
  isoAt,
  pick,
  priceCents,
  seedRandom,
  weighted,
} from './random.js';

export interface SeedCategoryRow {
  id: string;
  parent_id: string | null;
  slug: string;
  name: string;
  path: string;
}

export interface SeedProductRow {
  id: string;
  store_id: string;
  category_id: string | null;
  slug: string;
  title: string;
  description: string;
  brand: string | null;
  status: 'draft' | 'active' | 'archived';
  attributes: Record<string, unknown>;
  min_price_cents: number;
  currency: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface SeedVariantRow {
  id: string;
  product_id: string;
  store_id: string;
  sku: string;
  price_cents: number;
  attributes: Record<string, unknown>;
  status: 'active' | 'inactive';
}

export interface SeedPublicationRow {
  product_id: string;
  marketplace_enabled: boolean;
  store_enabled: boolean;
  published_at: string | null;
}

export interface SeededCatalogStore {
  index: number;
  slug: string;
  storeId: string;
  empty: boolean;
  productIds: string[];
  /** Visible on the public marketplace channel. */
  marketplaceProductIds: string[];
  /** Visible on this store's channel. */
  storeProductIds: string[];
  /** Draft products that CARRY a channel flag: must never be visible. */
  draftFlaggedProductIds: string[];
  /** Archived products that carry channel flags: must never be visible. */
  archivedProductIds: string[];
}

export interface CatalogPlan {
  seed: number;
  categories: SeedCategoryRow[];
  products: SeedProductRow[];
  variants: SeedVariantRow[];
  publications: SeedPublicationRow[];
  stores: SeededCatalogStore[];
}

const CATEGORY_NAMES = [
  ['electronics', 'Electronics'],
  ['home', 'Home and Kitchen'],
  ['garden', 'Garden'],
  ['toys', 'Toys'],
  ['books', 'Books'],
  ['sports', 'Sports'],
  ['beauty', 'Beauty'],
  ['pets', 'Pet Supplies'],
] as const;

const ADJECTIVES = ['Aurora', 'Cedar', 'Copper', 'Dune', 'Ember', 'Fjord', 'Glade', 'Harbor', 'Ivory', 'Juniper'] as const;
const NOUNS = ['Lamp', 'Chair', 'Kettle', 'Backpack', 'Speaker', 'Notebook', 'Sneaker', 'Watch', 'Bottle', 'Blanket'] as const;
const COLORS = ['Black', 'Bone', 'Clay', 'Ink', 'Moss', 'Sand', 'Slate', 'Umber'] as const;
const MATERIALS = ['Cotton', 'Oak', 'Recycled Steel', 'Stoneware', 'Walnut', 'Wool'] as const;
const BRANDS = ['Northwind', 'Orbit', 'Ridgeway', 'Stillwater', 'Terrace'] as const;

type ProductKind = 'store' | 'both' | 'nowhere' | 'draft' | 'archived';

/**
 * Full state coverage requires at least this many products per catalogued store.
 * The first four products of every catalogued store are FORCED into the states a
 * storefront has to be able to demonstrate, because a seeded dataset whose whole
 * purpose is verification must not be able to omit the state under test by a lucky
 * (or unlucky) weighted draw. Products beyond the lane are drawn normally.
 */
export const COVERAGE_LANE_LENGTH = 4;

/**
 * The forced lane. Index 0 is the only source of marketplace visibility, so a
 * store that may publish to the marketplace gets `both` and a store-only store
 * gets `store` — which is what keeps the two channels distinguishable.
 */
function coverageKind(productIndex: number, allowMarketplace: boolean): ProductKind | null {
  switch (productIndex) {
    case 0:
      return allowMarketplace ? 'both' : 'store';
    case 1:
      return 'draft';
    case 2:
      return 'archived';
    case 3:
      return 'nowhere';
    default:
      return null;
  }
}

/**
 * Category tree. Categories are GLOBAL in this schema (unique slug, no store
 * column), so the same tree serves every store — which is also why the seed
 * gives every store products in the same categories.
 */
export function planCategories(options: { categories: number; seed: number }): SeedCategoryRow[] {
  const rows: SeedCategoryRow[] = [];
  for (let index = 0; index < options.categories; index += 1) {
    const [slugPart, name] = CATEGORY_NAMES[index % CATEGORY_NAMES.length]!;
    // Past the word list, index-qualify so slugs stay unique and still readable.
    const suffix = index < CATEGORY_NAMES.length ? '' : `-${index}`;
    const slug = `seed-${slugPart}${suffix}`;
    const root: SeedCategoryRow = {
      id: idFor('category', slug),
      parent_id: null,
      slug,
      name,
      path: buildCategoryPath(null, slug),
    };
    rows.push(root);

    const childSlug = `${slug}-deals`;
    rows.push({
      id: idFor('category', childSlug),
      parent_id: root.id,
      slug: childSlug,
      name: `${name} — Deals`,
      path: buildCategoryPath(root.path, childSlug),
    });
  }
  return rows;
}

/**
 * Products, variants, and publication flags for every catalogued store.
 *
 * Invariants enforced BY CONSTRUCTION (and asserted in the unit suite):
 *   * `min_price_cents` is the cheapest ACTIVE variant (never an independent draw)
 *   * every product has at least one active variant, so "publishable" is real data
 *   * a channel flag may be set on a draft (ADR-0010) — and such a product is
 *     recorded as NOT visible
 *   * the same product slug appears in several stores (proving the unique key is
 *     scoped to the store, not the table)
 */
export function planCatalog(identity: IdentityPlan, options?: { seed?: number }): CatalogPlan {
  const seed = options?.seed ?? identity.seed;
  const shape = identity.shape;
  const rng = seedRandom(seed ^ 0x51f3b7);
  const categories = planCategories({ categories: shape.categories, seed });
  const products: SeedProductRow[] = [];
  const variants: SeedVariantRow[] = [];
  const publications: SeedPublicationRow[] = [];
  const stores: SeededCatalogStore[] = [];

  const seededStores = orderedStores(identity);
  const emptyFrom = Math.max(0, seededStores.length - shape.emptyStores);
  const lastCataloguedIndex = emptyFrom - 1;

  for (const store of seededStores) {
    const empty = store.index >= emptyFrom;
    const storeProducts: string[] = [];
    const marketplaceVisible: string[] = [];
    const storeVisible: string[] = [];
    const draftFlagged: string[] = [];
    const archived: string[] = [];
    // One store is deliberately store-channel-only, so the two channels can be
    // told apart in a storefront test instead of always moving together.
    const allowMarketplace = !empty && store.index < lastCataloguedIndex;

    for (let productIndex = 0; !empty && productIndex < shape.productsPerStore; productIndex += 1) {
      const noun = NOUNS[productIndex % NOUNS.length]!;
      const adjective = ADJECTIVES[(productIndex * 3) % ADJECTIVES.length]!;
      const slug = `seed-${noun.toLowerCase()}-${productIndex}`;
      const productId = idFor('product', store.slug, productIndex);
      const category = categories[(productIndex * 2) % categories.length]!;

      const kind =
        coverageKind(productIndex, allowMarketplace) ??
        weighted<ProductKind>(rng, [
          ['store', 64],
          ['both', allowMarketplace ? 16 : 0],
          ['nowhere', 12],
          ['draft', 5],
          ['archived', 3],
        ]);

      const status: SeedProductRow['status'] =
        kind === 'draft' ? 'draft' : kind === 'archived' ? 'archived' : 'active';
      const storeEnabled = kind === 'store' || kind === 'both' || kind === 'draft' || kind === 'archived';
      const marketplaceEnabled = (kind === 'both' || kind === 'archived') && allowMarketplace;

      const variantCount = intBetween(rng, shape.variantsPerProduct[0], shape.variantsPerProduct[1]);
      const prices: number[] = [];
      const activePrices: number[] = [];
      for (let variantIndex = 0; variantIndex < variantCount; variantIndex += 1) {
        // The first variant is always active, so no product is ever unpublishable
        // for a reason the seed cannot explain.
        const variantStatus = variantIndex === 0 ? 'active' : rng() < 0.8 ? 'active' : 'inactive';
        const price = priceCents(rng);
        prices.push(price);
        if (variantStatus === 'active') activePrices.push(price);
        variants.push({
          id: idFor('variant', store.slug, productIndex, variantIndex),
          product_id: productId,
          store_id: store.storeId,
          sku: `SEED-${store.slug.replace('seed-', '').toUpperCase()}-${productIndex}-${variantIndex}`,
          price_cents: price,
          attributes: { color: pick(rng, COLORS) },
          status: variantStatus,
        });
      }

      const minPriceCents = activePrices.length > 0 ? Math.min(...activePrices) : 0;
      const createdAt = isoAt(60 * store.index + productIndex);

      products.push({
        id: productId,
        store_id: store.storeId,
        category_id: category.id,
        slug,
        title: `${adjective} ${noun}`,
        description: `${adjective} ${noun} for everyday use. Variant colours may differ slightly from the photos.`,
        brand: rng() < 0.8 ? pick(rng, BRANDS) : null,
        status,
        attributes: { color: pick(rng, COLORS), material: pick(rng, MATERIALS) },
        min_price_cents: minPriceCents,
        currency: 'usd',
        version: 1,
        created_at: createdAt,
        updated_at: createdAt,
      });

      publications.push({
        product_id: productId,
        marketplace_enabled: marketplaceEnabled,
        store_enabled: storeEnabled,
        published_at: status === 'active' && (marketplaceEnabled || storeEnabled) ? isoAt(60 * store.index + productIndex + 1) : null,
      });

      storeProducts.push(productId);
      if (status === 'active' && storeEnabled) storeVisible.push(productId);
      if (status === 'active' && marketplaceEnabled) marketplaceVisible.push(productId);
      if (status === 'draft' && (storeEnabled || marketplaceEnabled)) draftFlagged.push(productId);
      if (status === 'archived') archived.push(productId);
    }

    stores.push({
      index: store.index,
      slug: store.slug,
      storeId: store.storeId,
      empty,
      productIds: storeProducts,
      marketplaceProductIds: marketplaceVisible,
      storeProductIds: storeVisible,
      draftFlaggedProductIds: draftFlagged,
      archivedProductIds: archived,
    });
  }

  return { seed, categories, products, variants, publications, stores };
}

export interface CatalogWriteReport {
  category: number;
  product: number;
  variant: number;
  publication: number;
}

/** Write the catalog plan in FK order. Idempotent per row. */
export async function writeCatalog(sql: Sql, plan: CatalogPlan): Promise<CatalogWriteReport> {
  const categories = await insertChunked(sql, {
    table: 'categories',
    columns: ['id', 'parent_id', 'slug', 'name', 'path'],
    rows: plan.categories,
    valuesOf: (row) => {
      const item = row as SeedCategoryRow;
      return [item.id, item.parent_id, item.slug, item.name, item.path];
    },
  });

  const products = await insertChunked(sql, {
    table: 'products',
    columns: [
      'id',
      'store_id',
      'category_id',
      'slug',
      'title',
      'description',
      'brand',
      'status',
      'attributes',
      'min_price_cents',
      'currency',
      'version',
      'created_at',
      'updated_at',
    ],
    casts: { attributes: 'jsonb' },
    rows: plan.products,
    valuesOf: (row) => {
      const item = row as SeedProductRow;
      return [
        item.id,
        item.store_id,
        item.category_id,
        item.slug,
        item.title,
        item.description,
        item.brand,
        item.status,
        canonicalJson(item.attributes),
        item.min_price_cents,
        item.currency,
        item.version,
        item.created_at,
        item.updated_at,
      ];
    },
  });

  const variants = await insertChunked(sql, {
    table: 'product_variants',
    columns: ['id', 'product_id', 'store_id', 'sku', 'price_cents', 'attributes', 'status'],
    casts: { attributes: 'jsonb' },
    rows: plan.variants,
    valuesOf: (row) => {
      const item = row as SeedVariantRow;
      return [
        item.id,
        item.product_id,
        item.store_id,
        item.sku,
        item.price_cents,
        canonicalJson(item.attributes),
        item.status,
      ];
    },
  });

  const publications = await insertChunked(sql, {
    table: 'product_publications',
    columns: ['product_id', 'marketplace_enabled', 'store_enabled', 'published_at'],
    rows: plan.publications,
    valuesOf: (row) => {
      const item = row as SeedPublicationRow;
      return [item.product_id, item.marketplace_enabled, item.store_enabled, item.published_at];
    },
  });

  return { category: categories, product: products, variant: variants, publication: publications };
}
