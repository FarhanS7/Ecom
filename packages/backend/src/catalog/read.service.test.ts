// T021a: channel read pure parts without a database.
// The visibility chain itself (business/store/product/publication) is a
// SQL WHERE shape proven live by catalog-visibility.spec.ts (CI).

import { describe, expect, it } from 'vitest';
import { CATALOG_SORTS, SORT_FRAGMENTS } from './read.service.js';
import { channelListQuery } from '@shopscale/contracts';

describe('catalog sort map (T021a)', () => {
  it('maps every declared sort to a deterministic, id-tiebroken fragment', () => {
    for (const sort of CATALOG_SORTS) {
      const fragment = SORT_FRAGMENTS[sort];
      expect(fragment).toBeTruthy();
      expect(fragment).toContain('"p"."id"'); // total order — no pagination ties
    }
    expect(CATALOG_SORTS).toHaveLength(Object.keys(SORT_FRAGMENTS).length);
  });
});

describe('channel list query contract (T021a)', () => {
  it('coerces query-string limits and prices to bounded ints', () => {
    const parsed = channelListQuery.parse({ limit: '25', minPrice: '100', maxPrice: '9900' });
    expect(parsed.limit).toBe(25);
    expect(parsed.minPrice).toBe(100);
    expect(parsed.maxPrice).toBe(9900);
  });

  it('defaults limit and rejects out-of-range values', () => {
    expect(channelListQuery.parse({}).limit).toBe(20);
    expect(channelListQuery.safeParse({ limit: '0' }).success).toBe(false);
    expect(channelListQuery.safeParse({ limit: '101' }).success).toBe(false);
    expect(channelListQuery.safeParse({ minPrice: '-5' }).success).toBe(false);
    expect(channelListQuery.safeParse({ sort: 'rating' }).success).toBe(false);
  });
});
