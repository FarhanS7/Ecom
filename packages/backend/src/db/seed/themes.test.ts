// T028b: themes and homepage content. The load-bearing assertion is the first
// one — every seeded theme must satisfy the SAME contract the read path validates
// against, or the storefront would fall back to defaults and look broken.

import { describe, expect, it } from 'vitest';
import { themeTokensSchema } from '@shopscale/contracts';
import { planIdentity, type SeedShape } from './identity.js';
import { planCatalog } from './catalog.js';
import { planThemes } from './themes.js';

const SHAPE: SeedShape = {
  stores: 3,
  emptyStores: 1,
  productsPerStore: 8,
  variantsPerProduct: [2, 3],
  categories: 2,
  staffPerStore: 1,
};

function bundle(seed = 42) {
  const identity = planIdentity({ seed, shape: SHAPE });
  const catalog = planCatalog(identity);
  return { identity, catalog, themes: planThemes(identity, catalog) };
}

describe('themes (T028b)', () => {
  it('validates every theme against the shared closed-token contract', () => {
    const { themes } = bundle();
    expect(themes.themes).toHaveLength(SHAPE.stores);
    for (const row of themes.themes) {
      expect(() => themeTokensSchema.parse(row.approved_tokens)).not.toThrow();
      expect(row.approved_tokens.background).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('gives each store a distinct accent, so a storefront can tell them apart', () => {
    const accents = bundle().themes.themes.map((row) => row.approved_tokens.accent);
    expect(new Set(accents).size).toBe(accents.length);
  });

  it('writes one theme and one content row per store', () => {
    const { themes, identity } = bundle();
    expect(themes.themes.map((row) => row.store_id).sort()).toEqual(identity.stores.map((row) => row.id).sort());
    expect(themes.content).toHaveLength(SHAPE.stores);
  });

  it('is deterministic', () => {
    expect(bundle(42).themes).toEqual(bundle(42).themes);
  });
});

describe('featured products (T028b)', () => {
  it('features only products of THAT store, and none for the empty store', () => {
    const { catalog, themes } = bundle();
    for (const store of catalog.stores) {
      const content = themes.content.find((row) => row.store_id === store.storeId)!;
      expect(content.featured_ids.length).toBeLessThanOrEqual(4);
      for (const id of content.featured_ids) {
        expect(store.productIds).toContain(id);
      }
      if (store.empty) expect(content.featured_ids).toEqual([]);
    }
  });

  it('features only products the store channel can actually show', () => {
    const { catalog, themes } = bundle();
    for (const store of catalog.stores) {
      const content = themes.content.find((row) => row.store_id === store.storeId)!;
      for (const id of content.featured_ids) {
        expect(store.storeProductIds).toContain(id);
      }
    }
  });

  it('does not invent a socials/swatches shape before the contract that owns it', () => {
    const { themes } = bundle();
    expect(themes.content.every((row) => Object.keys(row.socials).length === 0)).toBe(true);
    expect(themes.content.every((row) => Object.keys(row.swatches).length === 0)).toBe(true);
    expect(themes.content.every((row) => (row.headline ?? '').length > 0)).toBe(true);
  });
});
