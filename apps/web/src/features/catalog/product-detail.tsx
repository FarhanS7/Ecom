'use client';

// @shopscale/web features/catalog/product-detail - PDP view (T026b).
// DESIGN.md §7: a two-column bento (media card | info card) plus a description
// card. The media slot is a NEUTRAL tile because product media arrives with
// T035 — the card never renders a fake photo.
//
// State: the selected variant lives in `?variant=` in the URL, so a variant
// view is shareable and survives a reload/restart; the React state below is
// only a cache of it (the server seeds it from the same URL on every render).
// The choice is resolved against THIS product's variants (variants.ts), so a
// stale or hand-edited id can never show another product's price.
//
// Purchase: inventory (T032) and the cart (T033) do not exist yet, so the CTA
// is rendered DISABLED with the one honest reason from `purchaseState` — a
// decorative button that looks live would lie about a connection.

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ChannelProductDetailDto } from '@shopscale/contracts';
import { Card, PrimaryButton, RatingBadge, SecondaryButton } from '@/components/ui';
import { formatPrice } from '@/lib/price';
import { productPagePath } from '@/features/catalog/query-state';
import { VariantPicker } from '@/features/catalog/variant-picker';
import { purchaseState, resolveVariantId, toVariantView } from '@/features/catalog/variants';

export interface ProductDetailProps {
  product: ChannelProductDetailDto;
  /** null = marketplace channel; a slug = that store's channel. */
  storeSlug: string | null;
  /** Already resolved against this product's variants by the route. */
  initialVariantId: string | null;
}

export function ProductDetail({ product, storeSlug, initialVariantId }: ProductDetailProps) {
  const router = useRouter();
  const variants = useMemo(() => product.variants.map(toVariantView), [product.variants]);
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    resolveVariantId(variants, initialVariantId),
  );

  const selected = variants.find((variant) => variant.id === selectedId) ?? variants[0] ?? null;
  const priceLabel = formatPrice(selected?.priceCents ?? product.priceCents, product.currency);
  const purchase = purchaseState(product);
  const pagePath = productPagePath(storeSlug, product.slug);
  const listPath = productPagePath(storeSlug);
  const storeHref = `/stores/${encodeURIComponent(product.store.slug)}`;
  const attributes = Object.entries(product.attributes).filter(
    ([, value]) => typeof value === 'string' || typeof value === 'number',
  );

  function select(variantId: string) {
    setSelectedId(variantId);
    router.replace(`${pagePath}?variant=${encodeURIComponent(variantId)}`, { scroll: false });
  }

  return (
    <>
      <div className="ss-pdp">
        <Card className="ss-pdp__media" flush>
          <span aria-hidden="true" className="ss-pdp__orbit" />
          <span aria-hidden="true" className="ss-pdp__initial">
            {product.title.slice(0, 1).toUpperCase()}
          </span>
        </Card>

        <Card className="ss-pdp__info">
          <p className="type-caption ss-pdp__store">
            <a href={storeHref}>{product.store.name}</a>
          </p>
          <h1 className="type-h3 ss-pdp__title">{product.title}</h1>
          {product.brand ? <p className="type-body-sm ss-pdp__brand">{product.brand}</p> : null}
          <p className="type-stat ss-pdp__price" data-testid="pdp-price">
            {priceLabel}
          </p>
          {product.ratingCount > 0 ? <RatingBadge value={product.ratingCount} /> : null}

          <VariantPicker variants={variants} value={selected?.id ?? null} onChange={select} />

          <div className="ss-pdp__buy">
            <PrimaryButton
              disabled={!purchase.available}
              describedBy={purchase.reason === null ? undefined : 'pdp-purchase-reason'}
            >
              Add to cart
            </PrimaryButton>
            {purchase.reason === null ? null : (
              <p id="pdp-purchase-reason" className="type-body-sm ss-pdp__reason">
                {purchase.reason}
              </p>
            )}
          </div>

          <SecondaryButton href={listPath}>Back to products</SecondaryButton>
        </Card>
      </div>

      <Card as="section" className="ss-pdp__description" labelledBy="pdp-description">
        <h2 id="pdp-description" className="type-card-title">
          About this product
        </h2>
        <p className="type-body">{product.description}</p>
        {attributes.length > 0 ? (
          <dl className="ss-pdp__attributes">
            {attributes.map(([name, value]) => (
              <div key={name} className="ss-pdp__attribute">
                <dt className="type-caption">{name}</dt>
                <dd className="type-body-sm">{String(value)}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </Card>
    </>
  );
}

/**
 * Honest third state for a valid PDP route when the catalog cannot be reached.
 * It deliberately does NOT say the product is missing: an outage is not
 * evidence of absence, and this response is identical for every slug (so it
 * reveals nothing about a particular product).
 */
export function CatalogUnavailable({ listPath }: { listPath: string }) {
  return (
    <Card as="section" className="ss-state" labelledBy="pdp-unavailable">
      <h1 id="pdp-unavailable" className="type-h3">
        This product is temporarily unavailable
      </h1>
      <p className="type-body-sm" role="alert">
        We could not reach the catalog just now. Please try again shortly.
      </p>
      <SecondaryButton href={listPath}>Back to products</SecondaryButton>
    </Card>
  );
}
