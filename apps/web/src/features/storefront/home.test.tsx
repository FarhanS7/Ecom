// T024a: bento home behavior in jsdom. Asserts observable results (links,
// hrefs, hidden blocks) rather than implementation shape.

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { StorefrontHome, formatPrice, listingHref, productHref } from '@/features/storefront/home';
import type { HomeContent } from '@/features/storefront/home';

afterEach(cleanup);

const HERO = {
  eyebrow: 'ShopScale',
  headline: 'ShopScale Marketplace',
  title: 'Clear sounds',
  description: 'Independent sellers, one checkout.',
};

const MARKET: HomeContent = {
  channel: 'marketplace',
  hero: HERO,
  products: [
    { slug: 'alpha-headphones', title: 'Alpha Headphones', priceCents: 1234, currency: 'USD', ratingCount: 12 },
    { slug: 'beta-buds', title: 'Beta Buds', brand: 'Beta', priceCents: 999, currency: 'USD' },
  ],
};

const STORE: HomeContent = {
  channel: 'store',
  store: { slug: 't016-alpha', name: 'Alpha' },
  hero: { ...HERO, headline: 'Alpha' },
  products: [{ slug: 'store-item', title: 'Store Item', priceCents: 500, currency: 'USD' }],
  categories: [
    { slug: 'audio', name: 'Audio' },
    { slug: 'desk', name: 'Desk' },
  ],
  socials: [{ platform: 'x', url: 'https://example.test/x' }],
};

describe('price and link helpers (T024a)', () => {
  it('formats cents deterministically and rejects bad currencies safely', () => {
    expect(formatPrice(1234, 'USD')).toBe('$12.34');
    expect(formatPrice(0, 'USD')).toBe('$0.00');
    expect(formatPrice(999, 'not-a-currency')).toBe('9.99 not-a-currency');
  });

  it('decides link shape from the channel in exactly one place', () => {
    expect(productHref(MARKET, 'x')).toBe('/products/x');
    expect(productHref(STORE, 'x')).toBe('/stores/t016-alpha/products/x');
    expect(listingHref(MARKET)).toBe('/products');
    expect(listingHref(STORE, 'audio desk')).toBe('/stores/t016-alpha/products?category=audio%20desk');
  });
});

describe('marketplace home (T024a)', () => {
  it('links every product to a real marketplace product route', () => {
    render(<StorefrontHome content={MARKET} />);
    const alpha = screen.getByRole('link', { name: 'Alpha Headphones' });
    expect(alpha).toHaveAttribute('href', '/products/alpha-headphones');
    expect(screen.getByRole('link', { name: 'Beta Buds' })).toHaveAttribute(
      'href',
      '/products/beta-buds',
    );
    expect(screen.getByText('$12.34')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('renders exactly one primary CTA and no category block when categories are absent', () => {
    const { container } = render(<StorefrontHome content={MARKET} />);
    expect(container.querySelectorAll('.ss-btn--primary')).toHaveLength(1);
    expect(screen.queryByRole('heading', { name: 'More products' })).toBeNull();
    expect(screen.queryByText(/follow us/i)).toBeNull();
  });
});

describe('store home (T024a)', () => {
  it('scopes every link to the store and exposes category filters', () => {
    render(<StorefrontHome content={STORE} />);
    expect(screen.getByRole('link', { name: 'Store Item' })).toHaveAttribute(
      'href',
      '/stores/t016-alpha/products/store-item',
    );
    expect(screen.getByRole('link', { name: 'View All Products' })).toHaveAttribute(
      'href',
      '/stores/t016-alpha/products',
    );
    const chips = screen.getByRole('heading', { name: 'More products' }).closest('section');
    expect(chips).not.toBeNull();
    const audio = within(chips as HTMLElement).getByRole('link', { name: 'Audio' });
    expect(audio).toHaveAttribute('href', '/stores/t016-alpha/products?category=audio');
    expect(within(chips as HTMLElement).getByText('2 categories')).toBeInTheDocument();
  });

  it('shows the social row only when socials exist', () => {
    render(<StorefrontHome content={STORE} />);
    expect(screen.getByText('Follow us on:')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'x' })).toHaveAttribute('href', 'https://example.test/x');
  });
});

describe('empty content reflow (T024a)', () => {
  const EMPTY: HomeContent = {
    channel: 'store',
    store: { slug: 't016-empty', name: 'Empty' },
    hero: { ...HERO, headline: 'Empty' },
    products: [],
    emptyMessage: 'No products are published yet.',
  };

  it('renders no product cards and no empty card shells', () => {
    const { container } = render(<StorefrontHome content={EMPTY} />);
    expect(container.querySelectorAll('.ss-product')).toHaveLength(0);
    expect(screen.queryByRole('heading', { name: /From this store|Latest products/ })).toBeNull();
    // The honest empty state replaces the grid; the hero still reflows above it.
    expect(screen.getByText('No products are published yet.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Empty' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View All Products' })).toBeInTheDocument();
  });

  it('renders nothing extra when even the empty message is absent', () => {
    const { container } = render(
      <StorefrontHome content={{ ...EMPTY, emptyMessage: undefined }} />,
    );
    expect(container.querySelectorAll('.ss-product')).toHaveLength(0);
    expect(screen.queryByText(/No products are published yet/)).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Empty' })).toBeInTheDocument();
  });
});
