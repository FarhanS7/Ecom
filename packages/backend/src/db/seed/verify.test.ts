// T028b: the pure half of the verifier. The DB half needs a live database
// (T028c); what is testable here is the digest's *contract*: it must be stable,
// it must change when domain data changes, and it must NOT change when credential
// material changes — a checksum an operator prints must never be a hash of a
// password, even indirectly.

import { describe, expect, it } from 'vitest';
import { planIdentity, type SeedShape } from './identity.js';
import { planCatalog } from './catalog.js';
import { planThemes } from './themes.js';
import { planChecksum, planChecksums, type SeedPlanBundle } from './verify.js';

const SHAPE: SeedShape = {
  stores: 3,
  emptyStores: 1,
  productsPerStore: 6,
  variantsPerProduct: [2, 2],
  categories: 2,
  staffPerStore: 1,
};

function bundle(seed = 42): SeedPlanBundle {
  const identity = planIdentity({ seed, shape: SHAPE });
  const catalog = planCatalog(identity);
  return { identity, catalog, themes: planThemes(identity, catalog) };
}

describe('plan checksums (T028b)', () => {
  it('digests every seeded table', () => {
    const checksums = planChecksums(bundle());
    expect(Object.keys(checksums).sort()).toEqual([
      'businesses',
      'categories',
      'product_publications',
      'product_variants',
      'products',
      'store_content',
      'store_memberships',
      'store_themes',
      'stores',
      'user_platform_roles',
      'users',
    ]);
    expect(Object.values(checksums).every((digest) => /^[0-9a-f]{32}$/.test(digest))).toBe(true);
  });

  it('is stable for the same seed and sensitive to a different one', () => {
    expect(planChecksum(bundle(42))).toBe(planChecksum(bundle(42)));
    expect(planChecksum(bundle(42))).not.toBe(planChecksum(bundle(43)));
  });

  it('changes when domain data changes', () => {
    const before = bundle();
    const after = bundle();
    after.catalog.products[0]!.title = 'Changed title';
    expect(planChecksum(after)).not.toBe(planChecksum(before));
  });

  it('ignores credential material entirely', () => {
    const before = bundle();
    const after = bundle();
    after.identity.users[0]!.password_hash = '$argon2id$v=19$m=1,t=1,p=1$different$hash';
    expect(planChecksum(after)).toBe(planChecksum(before));
  });

  it('does not depend on row order within a table', () => {
    const ordered = bundle();
    const shuffled = bundle();
    shuffled.catalog.products = [...shuffled.catalog.products].reverse();
    shuffled.catalog.variants = [...shuffled.catalog.variants].reverse();
    expect(planChecksum(shuffled)).toBe(planChecksum(ordered));
  });
});
