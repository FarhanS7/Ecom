// T027c: the variant table. Two things must never be blurred here: a variant
// write is gated by the PRODUCT's version (so every save must hand the fresh
// version back), and "the list could not be loaded" is not "there are none".

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

vi.mock('@/features/seller/actions', () => ({
  saveVariant: vi.fn(),
}));

import { saveVariant } from '@/features/seller/actions';
import { VariantTable } from '@/features/seller/variant-table';
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
    minPriceCents: 0,
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

const saveMock = vi.mocked(saveVariant);
const onVariants = vi.fn();
const onProduct = vi.fn();

beforeEach(() => {
  saveMock.mockReset();
  onVariants.mockReset();
  onProduct.mockReset();
});

afterEach(() => {
  cleanup();
});

function renderTable(overrides: Partial<Parameters<typeof VariantTable>[0]> = {}) {
  return render(
    <VariantTable
      storeId={STORE}
      product={product()}
      variants={[variant()]}
      loaded
      onVariants={onVariants}
      onProduct={onProduct}
      {...overrides}
    />,
  );
}

describe('adding a variant (T027c)', () => {
  it('sends the typed values and shows the new row', async () => {
    saveMock.mockResolvedValue({
      status: 'saved',
      variant: variant({ id: '44444444-4444-4444-8444-444444444444', sku: 'LAMP-WHT', priceCents: 1599 }),
      product: product({ version: 3 }),
    });
    renderTable({ variants: [] });

    fireEvent.change(screen.getByLabelText('SKU'), { target: { value: 'LAMP-WHT' } });
    fireEvent.change(screen.getByLabelText('Price'), { target: { value: '15.99' } });
    fireEvent.change(screen.getByLabelText('Attributes'), { target: { value: 'color = White' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add variant' }));

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    expect(saveMock.mock.calls[0]?.[0]).toMatchObject({
      storeId: STORE,
      productId: PRODUCT,
      variantId: null,
      expectedVersion: 2,
      values: { sku: 'LAMP-WHT', price: '15.99', attributes: 'color = White' },
    });
    // The write bumped the product version, so the workspace must hear about it.
    await waitFor(() => expect(onProduct).toHaveBeenCalledWith(expect.objectContaining({ version: 3 })));
    expect(onVariants).toHaveBeenCalledWith([
      expect.objectContaining({ sku: 'LAMP-WHT', priceCents: 1599 }),
    ]);
    expect(await screen.findByText('Added LAMP-WHT.')).toBeInTheDocument();
  });

  it('puts a duplicate SKU on the SKU field', async () => {
    saveMock.mockResolvedValue({
      status: 'conflict',
      message: 'SKU already exists in this store.',
      current: null,
    });
    renderTable();

    fireEvent.change(screen.getByLabelText('SKU'), { target: { value: 'LAMP-BLK' } });
    fireEvent.change(screen.getByLabelText('Price'), { target: { value: '12.99' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add variant' }));

    expect(await screen.findByText('SKU already exists in this store.')).toBeInTheDocument();
    expect(screen.getByLabelText('SKU')).toHaveAttribute('aria-invalid', 'true');
  });

  it('reports field errors from the server', async () => {
    saveMock.mockResolvedValue({
      status: 'invalid',
      errors: { priceCents: 'Price must be between $0.00 and $100,000.00.' },
    });
    renderTable({ variants: [] });

    fireEvent.change(screen.getByLabelText('SKU'), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add variant' }));

    expect(
      await screen.findByText('Price must be between $0.00 and $100,000.00.'),
    ).toBeInTheDocument();
  });
});

describe('editing a variant (T027c)', () => {
  it('saves the price, status and attributes against the product version', async () => {
    saveMock.mockResolvedValue({
      status: 'saved',
      variant: variant({ priceCents: 1999, status: 'inactive' }),
      product: product({ version: 3 }),
    });
    renderTable();

    fireEvent.click(screen.getByRole('button', { name: 'Edit LAMP-BLK' }));
    const form = screen.getByRole('form', { name: 'Edit LAMP-BLK' });
    // The row opens on the current values, not empties.
    expect(within(form).getByLabelText('Price')).toHaveValue('12.99');

    fireEvent.change(within(form).getByLabelText('Price'), { target: { value: '19.99' } });
    fireEvent.change(within(form).getByLabelText('Status'), { target: { value: 'inactive' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save variant' }));

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    expect(saveMock.mock.calls[0]?.[0]).toMatchObject({
      variantId: VARIANT,
      expectedVersion: 2,
      values: { price: '19.99', status: 'inactive' },
    });
    expect(await screen.findByText('Saved LAMP-BLK.')).toBeInTheDocument();
    // The row closes and the list is handed to the owner (ProductWorkspace),
    // which is what puts the new price on screen.
    expect(onVariants).toHaveBeenCalledWith([
      expect.objectContaining({ priceCents: 1999, status: 'inactive' }),
    ]);
  });

  it('says the SKU cannot change', async () => {
    saveMock.mockResolvedValue({
      status: 'saved',
      variant: variant({ priceCents: 1299 }),
      product: product({ version: 3 }),
    });
    renderTable();

    fireEvent.click(screen.getByRole('button', { name: 'Edit LAMP-BLK' }));
    const form = screen.getByRole('form', { name: 'Edit LAMP-BLK' });
    expect(within(form).getByText(/cannot change/)).toBeInTheDocument();
    // The row has no SKU input; the add form below keeps its own.
    expect(within(form).queryByLabelText('SKU')).toBeNull();

    fireEvent.click(within(form).getByRole('button', { name: 'Save variant' }));
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    // The form always carries the SKU it is showing; immutability is enforced
    // by the contract validator (validation.test.ts) and by the API, whose
    // update contract has no sku field at all.
    expect(saveMock.mock.calls[0]?.[0]).toMatchObject({ variantId: VARIANT });
  });

  it('keeps a successful write successful when only the version refresh failed', async () => {
    saveMock.mockResolvedValue({
      status: 'saved',
      variant: variant({ priceCents: 1999 }),
      product: null,
    });
    renderTable();

    fireEvent.click(screen.getByRole('button', { name: 'Edit LAMP-BLK' }));
    const form = screen.getByRole('form', { name: 'Edit LAMP-BLK' });
    fireEvent.change(within(form).getByLabelText('Price'), { target: { value: '19.99' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save variant' }));

    expect(await screen.findByText(/could not be refreshed/)).toBeInTheDocument();
    expect(onProduct).not.toHaveBeenCalled();
  });

  it('offers only "apply my changes" on a stale version', async () => {
    saveMock.mockResolvedValueOnce({
      status: 'conflict',
      message: 'Product was modified by another writer.',
      current: product({ version: 7 }),
    });
    saveMock.mockResolvedValueOnce({
      status: 'saved',
      variant: variant({ priceCents: 1999 }),
      product: product({ version: 8 }),
    });
    renderTable();

    fireEvent.click(screen.getByRole('button', { name: 'Edit LAMP-BLK' }));
    const form = screen.getByRole('form', { name: 'Edit LAMP-BLK' });
    fireEvent.change(within(form).getByLabelText('Price'), { target: { value: '19.99' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save variant' }));

    expect(await screen.findByText('Product was modified by another writer.')).toBeInTheDocument();
    // The conflict payload describes the product, so there is no current variant
    // to reload: only the retry is offered.
    expect(screen.queryByRole('button', { name: 'Reload latest' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Apply my changes' }));
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2));
    expect(saveMock.mock.calls[1]?.[0]).toMatchObject({ expectedVersion: 7 });
  });

  it('leaves the row alone when the seller cancels', async () => {
    renderTable();
    fireEvent.click(screen.getByRole('button', { name: 'Edit LAMP-BLK' }));
    const form = screen.getByRole('form', { name: 'Edit LAMP-BLK' });
    fireEvent.change(within(form).getByLabelText('Price'), { target: { value: '99.99' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('form', { name: 'Edit LAMP-BLK' })).toBeNull();
    expect(screen.getByText('$12.99')).toBeInTheDocument();
    expect(saveMock).not.toHaveBeenCalled();
  });
});

describe('honest empty and outage states (T027c)', () => {
  it('explains that a product needs an active variant before publishing', () => {
    renderTable({ variants: [] });
    expect(screen.getByText(/needs at least one active variant/)).toBeInTheDocument();
  });

  it('does not claim "none" when the list could not be loaded', () => {
    renderTable({ variants: [], loaded: false });
    expect(screen.getByText(/could not be loaded/)).toBeInTheDocument();
    expect(screen.queryByText(/needs at least one active variant/)).toBeNull();
  });
});
