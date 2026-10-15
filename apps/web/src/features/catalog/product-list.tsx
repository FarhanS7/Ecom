'use client';

// @shopscale/web features/catalog/product-list - PLP results island (T025b).
// Browser-side reads go through the same-origin gateway (/api/...) using
// `listRequestUrl`, so the CHANNEL is in every request by construction — the
// island cannot ask the marketplace for a store's products or vice versa.
//
// Races: each fetch takes a `LatestRequest` token and aborts the previous
// request. A response may still arrive after a newer selection (abort is a
// hint, not a guarantee), so the result is only committed when its token is
// still current — a slow older response can never overwrite a newer one.
//
// States (DESIGN.md §7): skeleton cards while loading (never a spinner inside a
// card), an announced error with retry, an honest empty state, and the grid.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { channelListResponse } from '@shopscale/contracts';
import { Card, ProductCard, SecondaryButton } from '@/components/ui';
import { formatPrice } from '@/lib/price';
import {
  LatestRequest,
  listHref,
  listRequestUrl,
  pageNumber,
  parseListQuery,
  popCursor,
  pushCursor,
  type ListChannel,
} from '@/features/catalog/query-state';

const SKELETON_COUNT = 6;

interface ProductSummary {
  id: string;
  slug: string;
  title: string;
  brand: string | null;
  priceCents: number;
  currency: string;
  ratingCount: number;
}

type Result =
  | { status: 'loading'; items: ProductSummary[]; nextCursor: string | null }
  | { status: 'ready'; items: ProductSummary[]; nextCursor: string | null }
  | { status: 'error'; items: ProductSummary[]; nextCursor: null; message: string };

/** Channel listing base path — the mirror of `listApiPath`, for navigation. */
export function productListBasePath(storeSlug?: string): string {
  return storeSlug ? `/stores/${storeSlug}/products` : '/products';
}

export interface ProductListProps {
  /**
   * Store channel when set. Passing the slug is the ONLY way the island becomes
   * store-scoped, and the empty string is treated as absent by `listApiPath`
   * (it throws), so a store page can never silently read the marketplace.
   */
  storeSlug?: string | undefined;
}

export function ProductList({ storeSlug }: ProductListProps) {
  const params = useSearchParams();
  const urlKey = params.toString();
  const state = useMemo(() => parseListQuery(new URLSearchParams(urlKey)), [urlKey]);
  const channel = useMemo<ListChannel>(
    () => (storeSlug ? { kind: 'store', slug: storeSlug } : { kind: 'marketplace' }),
    [storeSlug],
  );
  const requestUrl = useMemo(() => listRequestUrl(channel, state), [channel, state]);
  const basePath = productListBasePath(storeSlug);

  const guard = useRef(new LatestRequest());
  const [nonce, setNonce] = useState(0);
  const [result, setResult] = useState<Result>({ status: 'loading', items: [], nextCursor: null });

  useEffect(() => {
    const controller = new AbortController();
    const token = guard.current.begin();
    // Keep the previous items visible while refreshing so the grid does not
    // collapse and re-layout on every filter change.
    setResult((previous) => ({ status: 'loading', items: previous.items, nextCursor: previous.nextCursor }));

    void (async () => {
      try {
        const response = await fetch(requestUrl, {
          signal: controller.signal,
          headers: { accept: 'application/json' },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const parsed = channelListResponse.safeParse(await response.json());
        if (!parsed.success) throw new Error('Malformed catalog response');
        if (!guard.current.isCurrent(token)) return;
        setResult({ status: 'ready', items: parsed.data.items, nextCursor: parsed.data.nextCursor });
      } catch {
        if (controller.signal.aborted || !guard.current.isCurrent(token)) return;
        setResult({
          status: 'error',
          items: [],
          nextCursor: null,
          message: 'Could not load products. Please try again.',
        });
      }
    })();

    return () => controller.abort();
  }, [requestUrl, nonce]);

  const page = pageNumber(state);
  const showing = result.items.length;

  return (
    <div className="ss-plp__results" aria-busy={result.status === 'loading'}>
      <p className="sr-only" role="status">
        {result.status === 'loading'
          ? 'Loading products'
          : result.status === 'error'
            ? 'Products could not be loaded'
            : `${showing} products shown`}
      </p>

      {result.status === 'error' ? (
        <Card className="ss-state" labelledBy="plp-error">
          <h2 id="plp-error" className="type-card-title">
            Products unavailable
          </h2>
          <p className="type-body-sm" role="alert">
            {result.message}
          </p>
          <SecondaryButton onClick={() => setNonce((value) => value + 1)}>Try again</SecondaryButton>
        </Card>
      ) : result.status === 'loading' && showing === 0 ? (
        <ul className="ss-product-grid" data-testid="plp-skeletons">
          {Array.from({ length: SKELETON_COUNT }, (_, index) => (
            <li key={index} className="ss-skeleton" aria-hidden="true" />
          ))}
        </ul>
      ) : showing === 0 ? (
        <Card className="ss-state" labelledBy="plp-empty">
          <h2 id="plp-empty" className="type-card-title">
            No products match these filters
          </h2>
          <p className="type-body-sm">Try widening the price range or clearing the category.</p>
          <SecondaryButton href={basePath}>Clear filters</SecondaryButton>
        </Card>
      ) : (
        <>
          <ul className="ss-product-grid">
            {result.items.map((item) => (
              <li key={item.id}>
                <ProductCard
                  href={`${basePath}/${item.slug}`}
                  title={item.title}
                  priceLabel={formatPrice(item.priceCents, item.currency)}
                  brand={item.brand}
                  ratingCount={item.ratingCount}
                />
              </li>
            ))}
          </ul>

          <nav className="ss-pagination" aria-label="Pagination">
            <span className="ss-pagination__status type-caption">Page {page}</span>
            {state.cursors.length > 0 ? (
              <SecondaryButton href={listHref(basePath, popCursor(state))}>
                Previous page
              </SecondaryButton>
            ) : null}
            {result.nextCursor !== null ? (
              <SecondaryButton href={listHref(basePath, pushCursor(state, result.nextCursor))}>
                Next page
              </SecondaryButton>
            ) : null}
          </nav>
        </>
      )}
    </div>
  );
}
