// T026b: the PDP island. next/navigation is mocked so the URL write is
// observable; the assertions are about what a reader sees and can reach.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const nav = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: nav.push }),
}));

import { CatalogUnavailable, ProductDetail } from '@/features/catalog/product-detail';

const VARIANT_A = '11111111-1111-4111-8111-111111111111';
const VARIANT_B = '22222222-2222-4222-8222-222222222222';

function detail(overrides: Record<string, unknown> = {}) {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    slug: 'x-bud',
    title: 'X Bud',
    brand: 'Sequoia',
    priceCents: 9900,
    currency: 'USD',
    ratingCount: 0,
    description: 'Noise cancelling earbuds.',
    attributes: { color: 'Black' },
    status: 'published',
    store: { slug: 'alpha', name: 'Alpha' },
    variants: [
      { id: VARIANT_A, sku: 'X-BLK', priceCents: 9900, attributes: { color: 'Black' } },
      { id: VARIANT_B, sku: 'X-WHT', priceCents: 12900, attributes: { color: 'White' } },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  nav.replace.mockReset();
  nav.push.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('server-provided detail renders without JavaScript-only data (T026b)', () => {
  it('shows the title, store link, price and description from the props', () => {
    const { product } = { product: detail() };
    render(<ProductDetail product={product} storeSlug={null} initialVariantId={VARIANT_A} />);

    expect(screen.getByRole('heading', { level: 1, name: 'X Bud' })).toBeInTheDocument();
    expect(screen.getByTestId('pdp-price')).toHaveTextContent(/99\.00|99/);
    expect(screen.getByRole('link', { name: 'Alpha' })).toHaveAttribute('href', '/stores/alpha');
    expect(screen.getByText('Noise cancelling earbuds.')).toBeInTheDocument();
    // Channel-correct listing link: marketplace here.
    expect(screen.getByRole('link', { name: 'Back to products' })).toHaveAttribute(
      'href',
      '/products',
    );
  });

  it('keeps a store PDP link and store scope on its own channel', () => {
    render(<ProductDetail product={detail()} storeSlug="alpha" initialVariantId={VARIANT_A} />);
    expect(screen.getByRole('link', { name: 'Back to products' })).toHaveAttribute(
      'href',
      '/stores/alpha/products',
    );
  });
});

describe('variant selection (T026b)', () => {
  it('exposes a native radio group keyed by one shared name', () => {
    render(<ProductDetail product={detail()} storeSlug={null} initialVariantId={VARIANT_A} />);

    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(2);
    // Native radios in one group: arrow keys work without custom key handling.
    const names = new Set(radios.map((radio) => radio.getAttribute('name')));
    expect(names.size).toBe(1);
    expect(radios[0]).toBeChecked();
    expect(radios[1]).not.toBeChecked();
  });

  it('changes the displayed price and records the choice in the URL', () => {
    render(<ProductDetail product={detail()} storeSlug={null} initialVariantId={VARIANT_A} />);
    const before = screen.getByTestId('pdp-price').textContent;

    fireEvent.click(screen.getByRole('radio', { name: 'White' }));

    const after = screen.getByTestId('pdp-price').textContent;
    expect(after).not.toBe(before);
    expect(screen.getByRole('radio', { name: 'White' })).toBeChecked();
    expect(nav.replace).toHaveBeenCalledWith(
      `/products/x-bud?variant=${VARIANT_B}`,
      expect.objectContaining({ scroll: false }),
    );
  });

  it('seeds the selection from the route (a deep link or a reload)', () => {
    render(<ProductDetail product={detail()} storeSlug={null} initialVariantId={VARIANT_B} />);
    expect(screen.getByRole('radio', { name: 'White' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Black' })).not.toBeChecked();
  });

  it('offers no picker when there is nothing to choose', () => {
    const product = detail({
      variants: [{ id: VARIANT_A, sku: 'X-BLK', priceCents: 9900, attributes: { color: 'Black' } }],
    });
    render(<ProductDetail product={product} storeSlug={null} initialVariantId={VARIANT_A} />);

    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    // The only variant's price is still the displayed price.
    expect(screen.getByTestId('pdp-price')).toHaveTextContent(/99\.00|99/);
  });
});

describe('the purchase affordance never pretends to be connected (T026b)', () => {
  it('disables the CTA and explains why, tied to the control', () => {
    render(<ProductDetail product={detail()} storeSlug={null} initialVariantId={VARIANT_A} />);

    const cta = screen.getByRole('button', { name: 'Add to cart' });
    expect(cta).toBeDisabled();
    const reason = screen.getByText('Checkout is not connected yet.');
    expect(reason).toBeVisible();
    expect(cta).toHaveAttribute('aria-describedby', reason.id);
  });

  it('gives a variant-less product its own reason', () => {
    const product = detail({ variants: [], priceCents: 5000 });
    render(<ProductDetail product={product} storeSlug={null} initialVariantId={null} />);

    expect(screen.getByText(/no active variant/i)).toBeVisible();
    expect(screen.queryByText('Checkout is not connected yet.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Add to cart' })).toBeDisabled();
    // With no variants the product's own price is shown, never blank.
    expect(screen.getByTestId('pdp-price')).toHaveTextContent(/50\.00|50/);
  });
});

describe('the unavailable state is not a missing product (T026b)', () => {
  it('says the catalog could not be reached and offers the way back', () => {
    render(<CatalogUnavailable listPath="/stores/alpha/products" />);

    expect(
      screen.getByRole('heading', { level: 1, name: /temporarily unavailable/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/could not reach the catalog/i);
    expect(screen.queryByText(/does not exist|not found/i)).toBeNull();
    expect(screen.getByRole('link', { name: 'Back to products' })).toHaveAttribute(
      'href',
      '/stores/alpha/products',
    );
  });
});
