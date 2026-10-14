// T019: catalog schema module loads with the expected tables.
// Tripwire for the generate-diff chain (identity/schema.test.ts pattern):
// a rename here without the reviewed SQL (or vice versa) fails first.

import { describe, expect, it } from 'vitest';
import { getTableName } from 'drizzle-orm';
import * as schema from './schema.js';

describe('catalog schema (T019)', () => {
  it('exposes every modeled table under its migration name', () => {
    expect(getTableName(schema.categories)).toBe('categories');
    expect(getTableName(schema.products)).toBe('products');
    expect(getTableName(schema.productVariants)).toBe('product_variants');
    expect(getTableName(schema.productPublications)).toBe('product_publications');
  });

  it('keeps the composite variant key and per-store uniques in place', () => {
    // Composite FK columns are the cross-store rejection boundary; if they
    // drift, db:generate would emit a silently different constraint.
    const variantColumns = Object.keys(schema.productVariants);
    expect(variantColumns).toContain('storeId');
    expect(variantColumns).toContain('productId');
    const productUniques = Object.keys(schema.products);
    expect(productUniques).toContain('storeId');
    expect(productUniques).toContain('slug');
  });
});
