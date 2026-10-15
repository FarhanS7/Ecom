// T027c: the product form. The point of this component is the round trip — a
// rejection must come back as field errors with the typing intact, and a stale
// version must be a decision (reload / apply), not a dead end.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, refresh: nav.refresh }),
}));

vi.mock('@/features/seller/actions', () => ({
  saveProduct: vi.fn(),
}));

import { saveProduct } from '@/features/seller/actions';
import { ProductForm } from '@/features/seller/product-form';
import type { ProductResponse } from '@shopscale/contracts';

const STORE = '11111111-1111-4111-8111-111111111111';
const PRODUCT = '22222222-2222-4222-8222-222222222222';

function product(overrides: Partial<ProductResponse> = {}): ProductResponse {
  return {
    id: PRODUCT,
    storeId: STORE,
    categoryId: null,
    slug: 'desk-lamp',
    title: 'Desk Lamp',
    description: 'A lamp.',
    brand: 'Acme',
    status: 'draft',
    attributes: { color: 'Black' },
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

const saveMock = vi.mocked(saveProduct);

beforeEach(() => {
  saveMock.mockReset();
  nav.push.mockReset();
  nav.refresh.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('create (T027c)', () => {
  it('sends the typed values and opens the new product', async () => {
    saveMock.mockResolvedValue({ status: 'saved', product: product() });
    render(<ProductForm storeId={STORE} product={null} />);

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Desk Lamp' } });
    fireEvent.change(screen.getByLabelText('Web address (slug)'), {
      target: { value: 'desk-lamp' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create product' }));

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    expect(saveMock.mock.calls[0]?.[0]).toMatchObject({
      storeId: STORE,
      productId: null,
      expectedVersion: null,
      values: { title: 'Desk Lamp', slug: 'desk-lamp' },
    });
    await waitFor(() =>
      expect(nav.push).toHaveBeenCalledWith(`/seller/${STORE}/products/${PRODUCT}`),
    );
  });

  it('puts a duplicate slug on the slug field instead of a reload panel', async () => {
    saveMock.mockResolvedValue({
      status: 'conflict',
      message: 'Slug already exists in this store.',
      current: null,
    });
    render(<ProductForm storeId={STORE} product={null} />);

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Desk Lamp' } });
    fireEvent.change(screen.getByLabelText('Web address (slug)'), {
      target: { value: 'desk-lamp' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create product' }));

    // The message is shown twice on purpose: once in the summary, once inline.
    expect(await screen.findAllByText('Slug already exists in this store.')).toHaveLength(2);
    expect(screen.getByLabelText('Web address (slug)')).toHaveAttribute('aria-invalid', 'true');
    // Nothing to reload for a product that does not exist yet.
    expect(screen.queryByRole('button', { name: 'Reload latest' })).toBeNull();
  });
});

describe('edit (T027c)', () => {
  it('never offers the slug for editing after creation', () => {
    render(<ProductForm storeId={STORE} product={product()} onSaved={vi.fn()} />);
    expect(screen.queryByLabelText('Web address (slug)')).toBeNull();
    expect(screen.getByText(/cannot change after a product is created/)).toBeInTheDocument();
  });

  it('shows a summary plus inline errors and keeps the typing', async () => {
    saveMock.mockResolvedValue({
      status: 'invalid',
      errors: { title: 'Title is required.', description: 'Description is too long.' },
    });
    render(<ProductForm storeId={STORE} product={product()} onSaved={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Kept' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('2 fields need attention:')).toBeInTheDocument();
    expect(screen.getAllByText('Title is required.')).toHaveLength(2);
    expect(screen.getAllByText('Description is too long.')).toHaveLength(2);
    expect(screen.getByLabelText('Title')).toHaveValue('Kept');
    expect(screen.getByLabelText('Title')).toHaveAttribute('aria-invalid', 'true');
  });

  it('clears a field error as soon as the field is edited', async () => {
    saveMock.mockResolvedValue({ status: 'invalid', errors: { title: 'Title is required.' } });
    render(<ProductForm storeId={STORE} product={product()} onSaved={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findAllByText('Title is required.')).not.toHaveLength(0);

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Fixed' } });
    expect(screen.queryAllByText('Title is required.')).toHaveLength(0);
  });

  it('hands the saved product to the workspace so versions stay current', async () => {
    const onSaved = vi.fn();
    saveMock.mockResolvedValue({ status: 'saved', product: product({ version: 3 }) });
    render(<ProductForm storeId={STORE} product={product()} onSaved={onSaved} />);

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ version: 3 })));
    expect(await screen.findByRole('status')).toHaveTextContent('Saved.');
  });

  describe('version conflict (T027c)', () => {
    it('offers reload latest and adopts the newer values', async () => {
      saveMock.mockResolvedValue({
        status: 'conflict',
        message: 'Product was modified by another writer.',
        current: product({ version: 5, title: 'Their Title' }),
      });
      render(<ProductForm storeId={STORE} product={product()} onSaved={vi.fn()} />);

      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
      expect(await screen.findByText('Product was modified by another writer.')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Reload latest' }));
      expect(screen.getByLabelText('Title')).toHaveValue('Their Title');
      expect(screen.queryByText('Product was modified by another writer.')).toBeNull();
    });

    it('re-sends the entered values on top of the fresh version', async () => {
      saveMock.mockResolvedValueOnce({
        status: 'conflict',
        message: 'Product was modified by another writer.',
        current: product({ version: 5 }),
      });
      saveMock.mockResolvedValueOnce({ status: 'saved', product: product({ version: 6 }) });
      render(<ProductForm storeId={STORE} product={product()} onSaved={vi.fn()} />);

      fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Mine' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

      fireEvent.click(await screen.findByRole('button', { name: 'Apply my changes' }));
      await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2));
      expect(saveMock.mock.calls[1]?.[0]).toMatchObject({
        expectedVersion: 5,
        values: expect.objectContaining({ title: 'Mine' }),
      });
    });

    it('says so when the current version could not be read', async () => {
      saveMock.mockResolvedValue({
        status: 'conflict',
        message: 'Product was modified by another writer.',
        current: null,
      });
      render(<ProductForm storeId={STORE} product={product()} onSaved={vi.fn()} />);

      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
      expect(await screen.findByText(/Reload this page to see the latest version/)).toBeInTheDocument();
    });
  });

  it('separates a scoped not-found from an outage', async () => {
    saveMock.mockResolvedValue({ status: 'not-found' });
    const { unmount } = render(<ProductForm storeId={STORE} product={product()} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText(/not available to your account/)).toBeInTheDocument();
    unmount();

    saveMock.mockResolvedValue({ status: 'unavailable' });
    render(<ProductForm storeId={STORE} product={product()} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText(/could not reach the catalog/)).toBeInTheDocument();
  });
});
