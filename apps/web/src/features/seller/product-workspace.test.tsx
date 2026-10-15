// T027c: the editor island. This is the test that protects the design decision
// behind it — one product state for all three panels. A variant write bumps the
// PRODUCT's version (T020b), so if any panel kept its own copy the next save
// would fail with a conflict the seller never caused.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/features/seller/actions', () => ({
  saveProduct: vi.fn(),
  saveVariant: vi.fn(),
  setProductStatus: vi.fn(),
  savePublication: vi.fn(),
  archiveProduct: vi.fn(),
}));

import { saveProduct, saveVariant, setProductStatus } from '@/features/seller/actions';
import { ProductWorkspace } from '@/features/seller/product-workspace';
import type { ProductResponse, VariantResponse } from '@shopscale/contracts';

const STORE = '11111111-1111-4111-8111-111111111111';
const PRODUCT = '22222222-2222-4222-8222-222222222222';
const VARIANT = '33333333-3333-4333-8333-333333333333';

function product(overrides: Partial<ProductResponse> = {}): ProductResponse {
  return {
    id: PRODUCT,
    storeId: STORE,
    categoryId: null,
    slug: 'desk-lamp',
    title: 'Desk Lamp',
    description: 'A lamp.',
    brand: null,
    status: 'draft',
    attributes: {},
    minPriceCents: 1299,
    currency: 'usd',
    version: 2,
    marketplaceEnabled: false,
    storeEnabled: false,
    createdAt: '2026-10-16T00:00:00.000Z',
    updatedAt: '2026-10-16T00:00:00.000Z',
    ...overrides,
  };
}

function variant(overrides: Partial<VariantResponse> = {}): VariantResponse {
  return {
    id: VARIANT,
    productId: PRODUCT,
    sku: 'LAMP-BLK',
    priceCents: 1299,
    attributes: { color: 'Black' },
    status: 'active',
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(saveProduct).mockReset();
  vi.mocked(saveVariant).mockReset();
  vi.mocked(setProductStatus).mockReset();
});

afterEach(() => {
  cleanup();
});

describe('one product state for every panel (T027c)', () => {
  it('publishes against the version a variant write returned', async () => {
    vi.mocked(saveVariant).mockResolvedValue({
      status: 'saved',
      variant: variant({ priceCents: 1999 }),
      product: product({ version: 3 }),
    });
    vi.mocked(setProductStatus).mockResolvedValue({
      status: 'saved',
      product: product({ status: 'active', version: 4 }),
    });

    render(
      <ProductWorkspace
        storeId={STORE}
        product={product()}
        variants={[variant()]}
        variantsLoaded
      />,
    );

    // A variant write succeeds and bumps the product version to 3.
    fireEvent.click(screen.getByRole('button', { name: 'Edit LAMP-BLK' }));
    const row = screen.getByRole('form', { name: 'Edit LAMP-BLK' });
    fireEvent.change(within(row).getByLabelText('Price'), { target: { value: '19.99' } });
    fireEvent.click(within(row).getByRole('button', { name: 'Save variant' }));

    // The row closes and the newly saved variant is what the table now shows.
    expect(await screen.findByText('$19.99')).toBeInTheDocument();

    // The lifecycle panel must not still be holding version 2.
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(vi.mocked(setProductStatus)).toHaveBeenCalledTimes(1));
    expect(vi.mocked(setProductStatus).mock.calls[0]?.[0]).toMatchObject({
      expectedVersion: 3,
      status: 'active',
    });
  });

  it('edits the product fields against the version the same state holds', async () => {
    vi.mocked(saveProduct).mockResolvedValue({
      status: 'saved',
      product: product({ version: 3 }),
    });

    render(
      <ProductWorkspace storeId={STORE} product={product()} variants={[]} variantsLoaded />,
    );

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Desk Lamp Pro' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(vi.mocked(saveProduct)).toHaveBeenCalledTimes(1));
    expect(vi.mocked(saveProduct).mock.calls[0]?.[0]).toMatchObject({ expectedVersion: 2 });

    // The adopted product is what the next save sends.
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(vi.mocked(saveProduct)).toHaveBeenCalledTimes(2));
    expect(vi.mocked(saveProduct).mock.calls[1]?.[0]).toMatchObject({ expectedVersion: 3 });
  });
});
