// T019b: pure category helpers without a database.
// The DB-boundary proofs (cycle under lock, composite FK rejection) live in
// apps/api/tests/integration/catalog-schema.spec.ts and run live in CI.

import { describe, expect, it } from 'vitest';
import { buildCategoryPath, chainContains } from './category.service.js';

describe('category paths (T019b)', () => {
  it('builds rooted materialized paths', () => {
    expect(buildCategoryPath(null, 'electronics')).toBe('/electronics/');
    expect(buildCategoryPath('/electronics/', 'phones')).toBe('/electronics/phones/');
    // Prefix safety: a sibling whose slug extends another slug can never
    // inherit its subtree because paths end with '/'.
    expect(buildCategoryPath('/electronics/', 'electronics-hardware')).toBe('/electronics/electronics-hardware/');
  });
});

describe('cycle walk decision (T019b)', () => {
  it('detects the moving node inside the ancestor chain', () => {
    expect(chainContains(['b', 'a', 'root'], 'a')).toBe(true);
    expect(chainContains(['b', 'a', 'root'], 'root')).toBe(true);
  });

  it('allows moves whose ancestors are disjoint', () => {
    expect(chainContains(['x', 'root'], 'a')).toBe(false);
    expect(chainContains([], 'a')).toBe(false);
  });
});
