// T028b: the catalog plan. These assertions are the ones a seeded catalog can
// actually get wrong: a derived price that does not match its variants, a product
// that cannot be published, a "visible" id that the read path would never return.

import { describe, expect, it } from 'vitest';
import { buildCategoryPath } from '../../catalog/category.service.js';
import { planIdentity, type SeedShape } from './identity.js';
import { planCatalog, type CatalogPlan } from './catalog.js';

const SHAPE: SeedShape = {
  stores: 3,
  emptyStores: 1,
  productsPerStore: 12,
  variantsPerProduct: [2, 3],
  categories: 3,
  staffPerStore: 2,
};

function plan(seed = 42, shape: SeedShape = SHAPE): CatalogPlan {
  return planCatalog(planIdentity({ seed, shape }));
}

describe('catalog determinism (T028b)', () => {
  it('returns the same rows for the same seed and different rows for another', () => {
    expect(plan()).toEqual(plan());
    // Titles are deliberately seed-independent (index-derived), so compare a field
    // the RNG actually drives: the derived prices.
    expect(plan(42).products.map((row) => row.min_price_cents)).not.toEqual(
      plan(43).products.map((row) => row.min_price_cents),
    );
  });

  it('marks every row with the seed marker, ids included', () => {
    const fixture = plan();
    expect(fixture.products.every((row) => row.slug.startsWith('seed-'))).toBe(true);
    expect(fixture.variants.every((row) => row.sku.startsWith('SEED-'))).toBe(true);
    expect(fixture.categories.every((row) => row.slug.startsWith('seed-'))).toBe(true);
  });

  it('covers the Tier S product count when given the Tier S shape', () => {
    const fixture = plan(42, {
      stores: 3,
      emptyStores: 1,
      productsPerStore: 500,
      variantsPerProduct: [2, 3],
      categories: 8,
      staffPerStore: 2,
    });
    expect(fixture.products).toHaveLength(1000);
    expect(fixture.variants.length).toBeGreaterThanOrEqual(2000);
  });
});

describe('categories (T028b)', () => {
  it('builds a real tree with service-identical paths', () => {
    const fixture = plan();
    expect(fixture.categories.length).toBe(SHAPE.categories * 2);
    for (const category of fixture.categories) {
      if (category.parent_id === null) {
        expect(category.path).toBe(buildCategoryPath(null, category.slug));
      } else {
        const parent = fixture.categories.find((row) => row.id === category.parent_id);
        expect(parent).toBeDefined();
        expect(category.path.startsWith(parent!.path)).toBe(true);
      }
    }
  });

  it('keeps category slugs unique', () => {
    const slugs = plan().categories.map((row) => row.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe('derived prices and publishability (T028b)', () => {
  it('sets min_price_cents to the cheapest ACTIVE variant', () => {
    const fixture = plan();
    for (const product of fixture.products) {
      const activePrices = fixture.variants
        .filter((variant) => variant.product_id === product.id && variant.status === 'active')
        .map((variant) => variant.price_cents);
      expect(activePrices.length).toBeGreaterThan(0);
      expect(product.min_price_cents).toBe(Math.min(...activePrices));
    }
  });

  it('gives every product at least one active variant and one publication row', () => {
    const fixture = plan();
    for (const product of fixture.products) {
      expect(fixture.variants.some((v) => v.product_id === product.id && v.status === 'active')).toBe(true);
      expect(fixture.publications.filter((p) => p.product_id === product.id)).toHaveLength(1);
    }
  });

  it('creates some inactive variants, so "cheapest active" is not "cheapest"', () => {
    const fixture = plan();
    expect(fixture.variants.some((variant) => variant.status === 'inactive')).toBe(true);
  });
});

describe('visible vs invisible products (T028b)', () => {
  it('keeps only active products in the visible sets', () => {
    const fixture = plan();
    const statusById = new Map(fixture.products.map((row) => [row.id, row.status]));
    for (const store of fixture.stores) {
      for (const id of [...store.storeProductIds, ...store.marketplaceProductIds]) {
        expect(statusById.get(id)).toBe('active');
      }
    }
  });

  it('keeps the ADR-0010 cases out of the visible sets', () => {
    const fixture = plan();
    expect(fixture.stores.flatMap((store) => store.draftFlaggedProductIds).length).toBeGreaterThan(0);
    expect(fixture.stores.flatMap((store) => store.archivedProductIds).length).toBeGreaterThan(0);
    for (const store of fixture.stores) {
      const visible = new Set([...store.storeProductIds, ...store.marketplaceProductIds]);
      for (const id of [...store.draftFlaggedProductIds, ...store.archivedProductIds]) {
        expect(visible.has(id)).toBe(false);
      }
    }
  });

  it('gives the seeded stores the documented channel shapes', () => {
    const fixture = plan();
    const [alpha, beta, gamma] = fixture.stores;
    expect(alpha?.slug).toBe('seed-alpha');
    // store 0 is the both-channel store: it is the only source of marketplace rows.
    expect(alpha!.marketplaceProductIds.length).toBeGreaterThan(0);
    expect(alpha!.storeProductIds.length).toBeGreaterThan(0);
    // the last catalogued store never appears on the marketplace channel.
    expect(beta!.marketplaceProductIds).toHaveLength(0);
    expect(beta!.storeProductIds.length).toBeGreaterThan(0);
    // the last store is the empty one.
    expect(gamma!.empty).toBe(true);
    expect(gamma!.productIds).toHaveLength(0);
  });

  it('records a draft that carries a channel flag as flagged AND invisible', () => {
    const fixture = plan();
    const statusById = new Map(fixture.products.map((row) => [row.id, row.status]));
    const flagged = fixture.stores.flatMap((store) => store.draftFlaggedProductIds);
    for (const id of flagged) {
      expect(statusById.get(id)).toBe('draft');
      const flags = fixture.publications.find((row) => row.product_id === id)!;
      expect(flags.store_enabled || flags.marketplace_enabled).toBe(true);
      expect(flags.published_at).toBeNull();
    }
  });
});

describe('scoped uniqueness (T028b)', () => {
  it('reuses the same product slug in different stores (the key is scoped, not global)', () => {
    const fixture = plan();
    const bySlug = new Map<string, Set<string>>();
    for (const product of fixture.products) {
      const stores = bySlug.get(product.slug) ?? new Set<string>();
      stores.add(product.store_id);
      bySlug.set(product.slug, stores);
    }
    expect([...bySlug.values()].some((stores) => stores.size > 1)).toBe(true);
  });

  it('never repeats a slug inside one store, or a SKU inside one store', () => {
    const fixture = plan();
    for (const store of fixture.stores) {
      const slugs = fixture.products.filter((row) => row.store_id === store.storeId).map((row) => row.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
      const skus = fixture.variants.filter((row) => row.store_id === store.storeId).map((row) => row.sku);
      expect(new Set(skus).size).toBe(skus.length);
    }
  });

  it('scopes SKUs across stores too, so a duplicate SKU would be a real conflict', () => {
    const skus = plan().variants.map((row) => row.sku);
    expect(new Set(skus).size).toBe(skus.length);
  });

  it('carries the store on every variant, matching its product (the composite FK)', () => {
    const fixture = plan();
    const storeByProduct = new Map(fixture.products.map((row) => [row.id, row.store_id]));
    for (const variant of fixture.variants) {
      expect(variant.store_id).toBe(storeByProduct.get(variant.product_id));
    }
  });

  it('orders products so newest-first pagination is deterministic', () => {
    const fixture = plan();
    for (const store of fixture.stores) {
      const created = fixture.products
        .filter((row) => row.store_id === store.storeId)
        .map((row) => Date.parse(row.created_at));
      expect(created).toEqual([...created].sort((a, b) => a - b));
    }
  });
});
