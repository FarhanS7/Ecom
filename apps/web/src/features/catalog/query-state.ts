// @shopscale/web features/catalog/query-state - PLP filter state (T025a).
// The URL is the single source of truth for listing filters: back/forward
// restores the exact view, every page is deep-linkable, and no component
// invents its own filter representation. This module is PURE (no React, no
// fetch) so every rule below is unit-testable without a DOM or a server.
//
// Channel handling: `listApiPath` is the ONLY place a channel becomes a path.
// A store channel with a missing/empty slug THROWS — silently falling back to
// the marketplace endpoint would leak marketplace rows into a store page.

export type ListSort = 'newest' | 'price_asc' | 'price_desc' | 'popularity';

export const LIST_SORTS: readonly ListSort[] = ['newest', 'price_asc', 'price_desc', 'popularity'];

export const SORT_LABELS: Record<ListSort, string> = {
  newest: 'Newest',
  price_asc: 'Price: low to high',
  price_desc: 'Price: high to low',
  popularity: 'Popular',
};

/** Page size requested from the API (clamped server-side to 1..100). */
export const LIST_LIMIT = 12;

/** Cursor stack depth cap; older entries fall off the front (page 1 window). */
const MAX_CURSOR_STACK = 20;

const CATEGORY_PATTERN = /^[a-z0-9-]{1,80}$/;
const CURSOR_PATTERN = /^[A-Za-z0-9_-]{1,512}$/;
/** Major units, up to 2 decimals, no sign/exponent (URL-typed by a human). */
const PRICE_PATTERN = /^\d{1,7}(?:\.\d{1,2})?$/;

export const CATEGORY_MAX_LENGTH = 80;

export type ListChannel = { kind: 'marketplace' } | { kind: 'store'; slug: string };

export interface ListFilters {
  /** Category slug, or null when unset. */
  category: string | null;
  /** Price floor in MAJOR units (what the URL shows), or null. */
  minPrice: number | null;
  /** Price ceiling in MAJOR units, or null. */
  maxPrice: number | null;
  sort: ListSort;
}

export interface ListQueryState {
  filters: ListFilters;
  /**
   * Cursor stack for keyset pagination: entry N is the cursor of page N+1, so
   * the current page uses the LAST entry and `cursors.length + 1` is the page
   * number. Keeping the whole stack in the URL makes Previous a pure URL
   * transformation — no client-side history to get out of sync.
   */
  cursors: string[];
}

const DEFAULT_FILTERS: ListFilters = {
  category: null,
  minPrice: null,
  maxPrice: null,
  sort: 'newest',
};

function parsePrice(raw: string | null): number | null {
  if (raw === null) return null;
  const value = raw.trim();
  if (!PRICE_PATTERN.test(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseCategory(raw: string | null): string | null {
  if (raw === null) return null;
  const value = raw.trim().toLowerCase();
  return CATEGORY_PATTERN.test(value) ? value : null;
}

function parseCursors(raw: string | null): string[] {
  if (!raw) return [];
  const entries = raw.split(',').filter((entry) => entry !== '');
  // One malformed entry invalidates the whole stack: page 1 is the only
  // result we can honestly serve from a cursor chain we cannot trust.
  if (entries.some((entry) => !CURSOR_PATTERN.test(entry))) return [];
  return entries.slice(-MAX_CURSOR_STACK);
}

/** Parse a URL query into the canonical filter state. Never throws. */
export function parseListQuery(params: URLSearchParams): ListQueryState {
  const sortRaw = params.get('sort');
  const sort = (LIST_SORTS as readonly string[]).includes(sortRaw ?? '')
    ? (sortRaw as ListSort)
    : DEFAULT_FILTERS.sort;

  let minPrice = parsePrice(params.get('min'));
  let maxPrice = parsePrice(params.get('max'));
  // A reversed range is a typing artifact, not an error: swap so the user
  // always sees results for the range they drew.
  if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) {
    [minPrice, maxPrice] = [maxPrice, minPrice];
  }

  return {
    filters: {
      category: parseCategory(params.get('category')),
      minPrice,
      maxPrice,
      sort,
    },
    cursors: parseCursors(params.get('after')),
  };
}

/** Canonical serialization: defaults are omitted so URLs stay clean. */
export function serializeListQuery(state: ListQueryState): URLSearchParams {
  const params = new URLSearchParams();
  const { category, minPrice, maxPrice, sort } = state.filters;
  if (category !== null) params.set('category', category);
  if (minPrice !== null) params.set('min', formatPrice(minPrice));
  if (maxPrice !== null) params.set('max', formatPrice(maxPrice));
  if (sort !== DEFAULT_FILTERS.sort) params.set('sort', sort);
  if (state.cursors.length > 0) params.set('after', state.cursors.join(','));
  return params;
}

/** Price in major units, trailing zeros trimmed ("10", "10.5", "10.99"). */
export function formatPrice(value: number): string {
  return Number(value.toFixed(2)).toString();
}

/** Canonical href for a listing page (channel base path + filter query). */
export function listHref(basePath: string, state: ListQueryState): string {
  const query = serializeListQuery(state).toString();
  return query === '' ? basePath : `${basePath}?${query}`;
}

/** 1-based page number implied by the cursor stack. */
export function pageNumber(state: ListQueryState): number {
  return state.cursors.length + 1;
}

/** Cursor for the page currently being requested (last entry, or undefined). */
export function currentCursor(state: ListQueryState): string | undefined {
  return state.cursors[state.cursors.length - 1];
}

/**
 * Next page: append the response cursor to the stack. A cursor that is not the
 * API's base64url shape is refused, so a compromised/buggy response cannot put
 * an arbitrary string into a link or an upstream query.
 */
export function pushCursor(state: ListQueryState, nextCursor: string): ListQueryState {
  if (!CURSOR_PATTERN.test(nextCursor)) return state;
  return { filters: state.filters, cursors: [...state.cursors, nextCursor].slice(-MAX_CURSOR_STACK) };
}

/** Previous page: drop the last cursor (browser Back does the same). */
export function popCursor(state: ListQueryState): ListQueryState {
  return { filters: state.filters, cursors: state.cursors.slice(0, -1) };
}

/**
 * Change one or more filters and RESET pagination. A cursor is bound to the
 * filter fingerprint it was issued for (T022), so carrying a stack across a
 * filter change would ask the API for a page of a result set that no longer
 * matches — the API would reject it, and the UI would show an error the user
 * cannot explain. Dropping the stack keeps the invariant in the client.
 */
export function withFilters(state: ListQueryState, partial: Partial<ListFilters>): ListQueryState {
  return { filters: { ...state.filters, ...partial }, cursors: [] };
}

/** True when any non-default filter is set (drives the Clear-filters link). */export function hasActiveFilters(state: ListQueryState): boolean {
  const { category, minPrice, maxPrice, sort } = state.filters;
  return category !== null || minPrice !== null || maxPrice !== null || sort !== DEFAULT_FILTERS.sort;
}

/** Clear filters, keeping the cursor stack reset (page 1). */
export function clearFilters(_state: ListQueryState): ListQueryState {
  return { filters: { ...DEFAULT_FILTERS }, cursors: [] };
}

/**
 * Same-origin gateway path for the channel's public listing. Marketplace and
 * store channels are the SAME endpoint family with the channel in the path —
 * every request built from this function is channel-scoped by construction.
 */
export function listApiPath(channel: ListChannel): string {
  if (channel.kind === 'store') {
    const slug = channel.slug?.trim() ?? '';
    if (slug === '') {
      throw new Error('Store channel requires a non-empty slug for a catalog request.');
    }
    return `/api/v1/catalog/stores/${encodeURIComponent(slug)}/products`;
  }
  return '/api/v1/catalog/marketplace/products';
}

/**
 * Upstream query for the channel read (T021 contract: category (slug),
 * minPrice/maxPrice in CENTS, sort, limit, cursor). Unknown/invalid values were
 * already dropped by the parser, so nothing here can reach the API unvalidated.
 */
export function toApiSearchParams(state: ListQueryState): URLSearchParams {
  const params = new URLSearchParams();
  const { category, minPrice, maxPrice, sort } = state.filters;
  if (category !== null) params.set('category', category);
  if (minPrice !== null) params.set('minPrice', String(Math.round(minPrice * 100)));
  if (maxPrice !== null) params.set('maxPrice', String(Math.round(maxPrice * 100)));
  params.set('sort', sort);
  params.set('limit', String(LIST_LIMIT));
  const cursor = currentCursor(state);
  if (cursor !== undefined && CURSOR_PATTERN.test(cursor)) params.set('cursor', cursor);
  return params;
}

/** Full same-origin request URL: path + query, channel included. */
export function listRequestUrl(channel: ListChannel, state: ListQueryState): string {
  return `${listApiPath(channel)}?${toApiSearchParams(state).toString()}`;
}

/**
 * Stale-response guard (T025b): every request takes a token, and only the
 * newest token is allowed to commit its result. A slow older response can
 * therefore never overwrite a newer selection — even if `AbortController` is
 * ignored by the runtime.
 */
export class LatestRequest {
  private sequence = 0;

  begin(): number {
    this.sequence += 1;
    return this.sequence;
  }

  isCurrent(token: number): boolean {
    return token === this.sequence;
  }
}
