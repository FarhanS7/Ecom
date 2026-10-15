// T025a: URL filter state, request contract, and stale-request guard — pure
// tests, no DOM and no server.

import { describe, expect, it } from 'vitest';
import {
  LatestRequest,
  clearFilters,
  currentCursor,
  formatPrice,
  hasActiveFilters,
  listApiPath,
  listHref,
  listRequestUrl,
  listUpstreamPath,
  pageNumber,
  parseListQuery,
  popCursor,
  productUpstreamPath,
  pushCursor,
  serializeListQuery,
  toApiSearchParams,
} from '@/features/catalog/query-state';

function parse(query: string) {
  return parseListQuery(new URLSearchParams(query));
}

describe('filter parsing (T025a)', () => {
  it('defaults to newest, no filters, page 1', () => {
    const state = parse('');
    expect(state.filters).toEqual({ category: null, minPrice: null, maxPrice: null, sort: 'newest' });
    expect(state.cursors).toEqual([]);
    expect(pageNumber(state)).toBe(1);
    expect(hasActiveFilters(state)).toBe(false);
  });

  it('accepts the closed sort set and falls back on anything else', () => {
    expect(parse('sort=price_desc').filters.sort).toBe('price_desc');
    expect(parse('sort=popularity').filters.sort).toBe('popularity');
    expect(parse('sort=cheapest').filters.sort).toBe('newest');
    expect(parse('sort=DROP%20TABLE').filters.sort).toBe('newest');
  });

  it('normalizes the category slug and drops anything that is not one', () => {
    expect(parse('category=Audio').filters.category).toBe('audio');
    expect(parse('category=head-phones').filters.category).toBe('head-phones');
    expect(parse('category=../etc/passwd').filters.category).toBeNull();
    expect(parse('category=a%20b').filters.category).toBeNull();
    expect(parse(`category=${'a'.repeat(81)}`).filters.category).toBeNull();
  });

  it('accepts only plain decimal prices in major units', () => {
    expect(parse('min=10&max=99.99').filters).toMatchObject({ minPrice: 10, maxPrice: 99.99 });
    expect(parse('min=abc').filters.minPrice).toBeNull();
    expect(parse('min=-5').filters.minPrice).toBeNull();
    expect(parse('min=1e3').filters.minPrice).toBeNull();
    expect(parse('min=1.234').filters.minPrice).toBeNull();
    expect(parse('max=%20').filters.maxPrice).toBeNull();
  });

  it('swaps a reversed price range instead of returning nothing', () => {
    expect(parse('min=99&max=10').filters).toMatchObject({ minPrice: 10, maxPrice: 99 });
  });

  it('keeps a valid cursor stack and drops the whole stack when one entry is bad', () => {
    expect(parse('after=c1,c2').cursors).toEqual(['c1', 'c2']);
    expect(parse('after=c1,%2E%2E').cursors).toEqual([]);
    expect(parse('after=c1,,c2').cursors).toEqual(['c1', 'c2']);
    expect(parse('after=').cursors).toEqual([]);
  });

  it('caps the cursor stack and keeps the newest pages', () => {
    const many = Array.from({ length: 25 }, (_, index) => `c${index}`).join(',');
    const state = parse(`after=${many}`);
    expect(state.cursors).toHaveLength(20);
    expect(state.cursors[state.cursors.length - 1]).toBe('c24');
  });
});

describe('canonical serialization (T025a)', () => {
  it('omits defaults and round-trips a populated state', () => {
    expect(serializeListQuery(parse('')).toString()).toBe('');
    expect(serializeListQuery(parse('sort=newest&min=abc')).toString()).toBe('');

    const state = parse('sort=price_asc&category=audio&min=10&max=10.5&after=c1');
    const round = serializeListQuery(state);
    expect(round.toString()).toBe('category=audio&min=10&max=10.5&sort=price_asc&after=c1');
    expect(parseListQuery(round)).toEqual(state);
  });

  it('trims trailing zeros in price labels', () => {
    expect(formatPrice(10)).toBe('10');
    expect(formatPrice(10.5)).toBe('10.5');
    expect(formatPrice(10.99)).toBe('10.99');
  });

  it('builds a base-path href, with and without a query', () => {
    expect(listHref('/products', parse(''))).toBe('/products');
    expect(listHref('/products', parse('sort=popularity'))).toBe('/products?sort=popularity');
    expect(listHref('/stores/alpha/products', parse('max=5'))).toBe('/stores/alpha/products?max=5');
  });
});

describe('pagination state (T025a)', () => {
  it('derives the page number and current cursor from the stack', () => {
    const page1 = parse('');
    const page2 = pushCursor(page1, 'c1');
    const page3 = pushCursor(page2, 'c2');
    expect([pageNumber(page1), pageNumber(page2), pageNumber(page3)]).toEqual([1, 2, 3]);
    expect(currentCursor(page1)).toBeUndefined();
    expect(currentCursor(page3)).toBe('c2');
    expect(popCursor(page3).cursors).toEqual(['c1']);
    expect(popCursor(page1).cursors).toEqual([]);
    // Pushing a page does not disturb the filters (back/forward keeps them).
    const filtered = parse('sort=popularity&category=audio');
    expect(pushCursor(filtered, 'c1').filters).toEqual(filtered.filters);
  });

  it('clears filters and the cursor stack together', () => {
    const state = pushCursor(parse('sort=popularity&category=audio'), 'c1');
    const cleared = clearFilters(state);
    expect(hasActiveFilters(cleared)).toBe(false);
    expect(cleared.cursors).toEqual([]);
  });
});

describe('the only place a channel becomes a request (T025a)', () => {
  it('keeps the store channel in the path and refuses an empty slug', () => {
    expect(listApiPath({ kind: 'marketplace' })).toBe('/api/v1/catalog/marketplace/products');
    expect(listApiPath({ kind: 'store', slug: 'alpha' })).toBe(
      '/api/v1/catalog/stores/alpha/products',
    );
    // The dangerous fallback: an unnamed store must never read the marketplace.
    expect(() => listApiPath({ kind: 'store', slug: '' })).toThrow(/non-empty slug/);
    expect(() => listApiPath({ kind: 'store', slug: '   ' })).toThrow(/non-empty slug/);
    expect(listApiPath({ kind: 'store', slug: 'a b' })).toBe('/api/v1/catalog/stores/a%20b/products');
  });

  it('converts major units to cents and clamps nothing the parser dropped', () => {
    const params = toApiSearchParams(parse('category=audio&min=10&max=10.5&sort=price_asc'));
    expect(params.get('category')).toBe('audio');
    expect(params.get('minPrice')).toBe('1000');
    expect(params.get('maxPrice')).toBe('1050');
    expect(params.get('sort')).toBe('price_asc');
    expect(params.get('limit')).toBe('12');
    expect(params.get('cursor')).toBeNull();

    const paged = toApiSearchParams(pushCursor(parse(''), 'opaque.cursor'));
    expect(paged.get('cursor')).toBeNull(); // '.' is not a legal cursor entry
    const valid = toApiSearchParams(pushCursor(parse(''), 'opaque-cursor'));
    expect(valid.get('cursor')).toBe('opaque-cursor');
    expect(paged.get('sort')).toBe('newest');
  });

  it('composes the full same-origin request with the channel included', () => {
    expect(listRequestUrl({ kind: 'marketplace' }, parse('sort=popularity'))).toBe(
      '/api/v1/catalog/marketplace/products?sort=popularity&limit=12',
    );
    expect(listRequestUrl({ kind: 'store', slug: 'alpha' }, parse(''))).toBe(
      '/api/v1/catalog/stores/alpha/products?sort=newest&limit=12',
    );
  });
});

describe('detail paths stay channel-scoped (T026a)', () => {
  it('derives the gateway and upstream listing paths from one mapping', () => {
    expect(listUpstreamPath({ kind: 'marketplace' })).toBe('/v1/catalog/marketplace/products');
    expect(listApiPath({ kind: 'marketplace' })).toBe('/api/v1/catalog/marketplace/products');
    expect(listUpstreamPath({ kind: 'store', slug: 'alpha' })).toBe('/v1/catalog/stores/alpha/products');
    expect(listApiPath({ kind: 'store', slug: 'alpha' })).toBe('/api/v1/catalog/stores/alpha/products');
    expect(() => listUpstreamPath({ kind: 'store', slug: ' ' })).toThrow(/non-empty slug/);
  });

  it('builds a product detail path under its channel and refuses junk slugs', () => {
    expect(productUpstreamPath({ kind: 'marketplace' }, 'x-bud')).toBe(
      '/v1/catalog/marketplace/products/x-bud',
    );
    expect(productUpstreamPath({ kind: 'store', slug: 'alpha' }, 'x-bud')).toBe(
      '/v1/catalog/stores/alpha/products/x-bud',
    );
    // Two stores can never resolve to the same detail URL (no cross-store reuse).
    expect(productUpstreamPath({ kind: 'store', slug: 'alpha' }, 'x')).not.toBe(
      productUpstreamPath({ kind: 'store', slug: 'beta' }, 'x'),
    );
    expect(() => productUpstreamPath({ kind: 'store', slug: '' }, 'x')).toThrow(/non-empty slug/);
    for (const bad of ['', '  ', 'X-Bud', 'a_b', 'a/b', 'a b', '-lead', 'trail-']) {
      expect(() => productUpstreamPath({ kind: 'marketplace' }, bad)).toThrow(/product slug/);
    }
  });
});

describe('stale-request guard (T025a)', () => {
  it('only lets the newest token commit a result', () => {
    const guard = new LatestRequest();
    const first = guard.begin();
    expect(guard.isCurrent(first)).toBe(true);
    const second = guard.begin();
    // The older request may still resolve, but it can no longer overwrite.
    expect(guard.isCurrent(first)).toBe(false);
    expect(guard.isCurrent(second)).toBe(true);
    const third = guard.begin();
    expect(guard.isCurrent(second)).toBe(false);
    expect(guard.isCurrent(third)).toBe(true);
  });
});
