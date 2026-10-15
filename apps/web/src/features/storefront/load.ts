// @shopscale/web features/storefront/load - Server-only home content (T024b).
// SERVER components only: this module reads API_BASE_URL (server config) and
// must never be imported by a client component — the browser goes through the
// same-origin gateway instead.
//
// Every failure degrades to EMPTY content plus an honest message: an
// unreachable API must not crash a page, and it must not be reported as "no
// products published" (that would be a lie about the catalog). Channel reads
// are validated with the real contract schema, so a malformed body is treated
// exactly like an outage rather than rendered blindly.

import { cache } from 'react';
import { channelListResponse, themeTokensSchema } from '@shopscale/contracts';
import { apiBaseUrl } from '@/lib/api';
import type { HomeContent, HomeProduct } from '@/features/storefront/home';

export const STORE_SLUG_PATTERN = /^[a-z0-9-]{2,60}$/;

const CATALOG_UNAVAILABLE = 'The catalog is temporarily unavailable. Please try again shortly.';
const NOTHING_PUBLISHED = 'No products are published yet.';
const HOME_LIMIT = 8;

export interface StoreChannelInfo {
  slug: string;
  name: string;
  theme: unknown;
}

/**
 * Resolve an ACTIVE storefront channel (T016). Wrapped in React `cache()` so
 * the store layout and the store page share ONE fetch per request. Returns
 * null for unknown/suspended stores and invalid themes — the caller 404s.
 */
export const loadStoreChannel = cache(async (slug: string): Promise<StoreChannelInfo | null> => {
  if (!STORE_SLUG_PATTERN.test(slug)) return null;
  try {
    const res = await fetch(`${apiBaseUrl()}/v1/stores/${encodeURIComponent(slug)}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      channel?: unknown;
      slug?: unknown;
      name?: unknown;
      theme?: unknown;
    };
    if (body.channel !== 'store' || typeof body.slug !== 'string' || typeof body.name !== 'string') {
      return null;
    }
    if (!themeTokensSchema.safeParse(body.theme).success) return null;
    return { slug: body.slug, name: body.name, theme: body.theme };
  } catch {
    return null;
  }
});

interface ProductLoad {
  ok: boolean;
  products: HomeProduct[];
}

async function loadProducts(
  channel: 'marketplace' | 'store',
  storeSlug?: string,
): Promise<ProductLoad> {
  const path =
    channel === 'store'
      ? `/v1/catalog/stores/${encodeURIComponent(storeSlug ?? '')}/products`
      : '/v1/catalog/marketplace/products';
  try {
    const res = await fetch(`${apiBaseUrl()}${path}?limit=${HOME_LIMIT}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { ok: false, products: [] };
    const parsed = channelListResponse.safeParse(await res.json());
    if (!parsed.success) return { ok: false, products: [] };
    return {
      ok: true,
      products: parsed.data.items.map((item) => ({
        slug: item.slug,
        title: item.title,
        brand: item.brand,
        priceCents: item.priceCents,
        currency: item.currency,
        ratingCount: item.ratingCount,
      })),
    };
  } catch {
    return { ok: false, products: [] };
  }
}

export type HomeTarget =
  | { channel: 'marketplace' }
  | { channel: 'store'; store: { slug: string; name: string } };

/**
 * Build the home content for either channel. Honest empty/unavailable states
 * are separated: an outage is never rendered as an empty catalog.
 */
export async function loadHomeContent(target: HomeTarget): Promise<HomeContent> {
  const storeSlug = target.channel === 'store' ? target.store.slug : undefined;
  const { ok, products } = await loadProducts(target.channel, storeSlug);
  const emptyMessage = !ok
    ? CATALOG_UNAVAILABLE
    : products.length === 0
      ? NOTHING_PUBLISHED
      : undefined;

  if (target.channel === 'store') {
    return {
      channel: 'store',
      store: target.store,
      hero: {
        eyebrow: 'Storefront',
        headline: target.store.name,
        title: 'Direct from this store',
        description: 'Published products from this independent store.',
      },
      products,
      categories: [],
      emptyMessage,
    };
  }

  return {
    channel: 'marketplace',
    hero: {
      eyebrow: 'ShopScale',
      headline: 'ShopScale Marketplace',
      title: 'Independent stores, one checkout',
      description: 'Browse products published to the shared marketplace.',
    },
    products,
    categories: [],
    emptyMessage,
  };
}
