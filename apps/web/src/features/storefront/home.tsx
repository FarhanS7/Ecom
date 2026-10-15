'use client';

// @shopscale/web features/storefront/home - Bento storefront home (T024a).
// Renders the marketplace AND branded-store homes from one `HomeContent`
// object (no duplicated domain logic between channels — frontend.md). The
// channel decides LINK SHAPES: the marketplace links to /products/…, a store to
// /stores/{slug}/products/…. Blocks with no data are dropped so neighbours
// reflow (DESIGN.md §6) — never an empty card shell, never a placeholder tile.

import {
  Blocks,
  Card,
  CardArrow,
  ProductCard,
  Tag,
} from '@/components/ui';
import { HeroCard } from '@/features/storefront/hero';
import type { HeroSlide } from '@/features/storefront/hero';
import { formatPrice } from '@/lib/price';

// Re-exported so the home's public API is unchanged (T025b moved the
// implementation to lib/price so the PLP shares one money formatter).
export { formatPrice };

export interface HomeProduct {
  slug: string;
  title: string;
  brand?: string | null | undefined;
  priceCents: number;
  currency: string;
  ratingCount?: number | undefined;
}

export interface HomeCategory {
  slug: string;
  name: string;
}

export interface HomeContent {
  channel: 'marketplace' | 'store';
  /** Present on the store channel; drives every link shape. */
  store?: { slug: string; name: string } | undefined;
  hero: HeroSlide;
  products: HomeProduct[];
  categories?: HomeCategory[] | undefined;
  socials?: Array<{ platform: string; url: string }> | undefined;
  /** Honest empty-state copy shown in place of the product grid. */
  emptyMessage?: string | undefined;
}

/** Channel-correct product link (the one place link shape is decided). */
export function productHref(content: HomeContent, productSlug: string): string {
  return content.channel === 'store' && content.store
    ? `/stores/${content.store.slug}/products/${productSlug}`
    : `/products/${productSlug}`;
}

/** Channel-correct listing link (hero CTA / category chips). */
export function listingHref(content: HomeContent, categorySlug?: string): string {
  const base =
    content.channel === 'store' && content.store
      ? `/stores/${content.store.slug}/products`
      : '/products';
  return categorySlug ? `${base}?category=${encodeURIComponent(categorySlug)}` : base;
}

export function StorefrontHome({ content }: { content: HomeContent }) {
  const hasProducts = content.products.length > 0;
  const categories = content.categories ?? [];

  return (
    <section aria-label={content.channel === 'store' ? 'Store home' : 'Marketplace home'}>
      <HeroCard
        slide={content.hero}
        ctaHref={listingHref(content)}
        socials={content.socials ?? []}
      />

      <Blocks>
        {hasProducts ? (
          <Card as="section" className="ss-home__products" labelledBy="products-heading">
            <Tag>New arrivals</Tag>
            <h2 id="products-heading" className="type-h3">
              {content.channel === 'store' ? 'From this store' : 'Latest products'}
            </h2>
            <ul className="ss-product-grid">
              {content.products.map((product) => (
                <li key={product.slug}>
                  <ProductCard
                    href={productHref(content, product.slug)}
                    title={product.title}
                    priceLabel={formatPrice(product.priceCents, product.currency)}
                    brand={product.brand ?? null}
                    ratingCount={product.ratingCount ?? 0}
                  />
                </li>
              ))}
            </ul>
          </Card>
        ) : content.emptyMessage ? (
          <p className="type-body-sm ss-home__empty">{content.emptyMessage}</p>
        ) : null}

        {categories.length > 0 ? (
          <Card as="section" className="ss-home__categories" labelledBy="categories-heading">
            <div className="ss-home__categories-head">
              <div>
                <h2 id="categories-heading" className="type-card-title">
                  More products
                </h2>
                <p className="type-caption">
                  {categories.length} {categories.length === 1 ? 'category' : 'categories'}
                </p>
              </div>
              <CardArrow position="tr" size="sm" />
            </div>
            <ul className="ss-chips">
              {categories.map((category) => (
                <li key={category.slug}>
                  <a className="ss-tag ss-tag--bordered" href={listingHref(content, category.slug)}>
                    {category.name}
                  </a>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </Blocks>
    </section>
  );
}
