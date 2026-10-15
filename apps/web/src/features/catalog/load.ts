// @shopscale/web features/catalog/load - Server-only catalog detail reads
// (T026a). SERVER components only: it reads API_BASE_URL (server config), and
// the browser reaches the same data through the same-origin gateway instead.
//
// Exactly three outcomes, never a fourth: `ok`, `not-found`, `unavailable`. A
// 404 is an assertion that the thing does not exist (or is not visible in this
// channel), so only a definite 404 becomes `not-found`; an outage or a body we
// cannot validate becomes `unavailable`, because "I could not reach the catalog"
// is not evidence of absence. The unavailable answer is identical for every
// slug, so it reveals nothing about a particular product either way.
//
// No cross-store reuse: the memo key is the PRIMITIVE pair (storeSlug,
// productSlug), so the marketplace, store A, and store B are three different
// cache nodes; the fetch is `cache: 'no-store'`, so nothing survives the request.

import { cache } from 'react';
import { channelProductDetail } from '@shopscale/contracts';
import type { ChannelProductDetailDto } from '@shopscale/contracts';
import { apiBaseUrl } from '@/lib/api';
import { productUpstreamPath, type ListChannel } from '@/features/catalog/query-state';

export type ProductDetailResult =
  | { status: 'ok'; product: ChannelProductDetailDto }
  | { status: 'not-found' }
  | { status: 'unavailable' };

const DETAIL_TIMEOUT_MS = 5000;

/**
 * Load one product's channel-scoped detail. `storeSlug === null` means the
 * marketplace channel; a slug means that store's channel — the only way a store
 * page can become store-scoped, and the reason a store can never render the
 * marketplace's copy of a slug.
 *
 * React `cache()` is keyed on the primitive arguments, so the marketplace,
 * store A, and store B are always three different cache nodes; a second caller
 * in the same request (the page and its metadata) resolves to the same node.
 */
export const loadProductDetail = cache(
  async (storeSlug: string | null, productSlug: string): Promise<ProductDetailResult> => {
    const channel: ListChannel =
      storeSlug === null ? { kind: 'marketplace' } : { kind: 'store', slug: storeSlug };

    let path: string;
    try {
      path = productUpstreamPath(channel, productSlug);
    } catch {
      // A slug the API itself would reject is a not-found, not an outage.
      return { status: 'not-found' };
    }

    try {
      const response = await fetch(`${apiBaseUrl()}${path}`, {
        cache: 'no-store',
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(DETAIL_TIMEOUT_MS),
      });
      if (response.status === 404) return { status: 'not-found' };
      if (!response.ok) return { status: 'unavailable' };
      const parsed = channelProductDetail.safeParse(await response.json());
      if (!parsed.success) return { status: 'unavailable' };
      // "Product scope matches route": a store-scoped read must never render a
      // product that belongs to another store. The API already filters by store
      // slug, so this is a boundary assertion, not a fallback — a mismatch is a
      // not-found rather than a page that leaks the wrong store's product.
      if (storeSlug !== null && parsed.data.store.slug !== storeSlug) {
        return { status: 'not-found' };
      }
      return { status: 'ok', product: parsed.data };
    } catch {
      return { status: 'unavailable' };
    }
  },
);
