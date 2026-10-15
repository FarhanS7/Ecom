// T027c: lifecycle and channel controls. These assert the two axes stay
// separate (status vs channel flags), that nothing is optimistic, and that
// archiving takes a second, explicit confirmation.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/features/seller/actions', () => ({
  setProductStatus: vi.fn(),
  savePublication: vi.fn(),
  archiveProduct: vi.fn(),
}));

import { archiveProduct, savePublication, setProductStatus } from '@/features/seller/actions';
import { PublicationControls } from '@/features/seller/publication-controls';
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

const statusMock = vi.mocked(setProductStatus);
const publicationMock = vi.mocked(savePublication);
const archiveMock = vi.mocked(archiveProduct);
const onProduct = vi.fn();

beforeEach(() => {
  statusMock.mockReset();
  publicationMock.mockReset();
  archiveMock.mockReset();
  onProduct.mockReset();
});

afterEach(() => {
  cleanup();
});

function renderControls(overrides: Partial<ProductResponse> = {}) {
  return render(
    <PublicationControls storeId={STORE} product={product(overrides)} onProduct={onProduct} />,
  );
}

/**
 * The real console keeps one product in state (ProductWorkspace) and every
 * panel adopts the version a write returned. The retry test needs that
 * behaviour, otherwise the component would be re-rendering with a version that
 * no longer exists.
 */
function Harness({ initial }: { initial: ProductResponse }) {
  const [value, setValue] = useState(initial);
  return (
    <PublicationControls
      storeId={STORE}
      product={value}
      onProduct={(next) => {
        onProduct(next);
        setValue(next);
      }}
    />
  );
}

describe('lifecycle (T027c)', () => {
  it('publishes a draft and adopts the returned version', async () => {
    statusMock.mockResolvedValue({ status: 'saved', product: product({ status: 'active', version: 3 }) });
    renderControls();

    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

    await waitFor(() => expect(statusMock).toHaveBeenCalledTimes(1));
    expect(statusMock.mock.calls[0]?.[0]).toEqual({
      storeId: STORE,
      productId: PRODUCT,
      expectedVersion: 2,
      status: 'active',
    });
    await waitFor(() =>
      expect(onProduct).toHaveBeenCalledWith(expect.objectContaining({ version: 3 })),
    );
    expect(await screen.findByText('Product published.')).toBeInTheDocument();
  });

  it('shows a refused publish with its reason and retries on the fresh version', async () => {
    statusMock.mockResolvedValueOnce({
      status: 'conflict',
      message: 'Add an active variant before publishing this product.',
      current: product({ version: 4 }),
    });
    statusMock.mockResolvedValueOnce({
      status: 'saved',
      product: product({ status: 'active', version: 5 }),
    });
    render(<Harness initial={product()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

    expect(
      await screen.findByText('Add an active variant before publishing this product.'),
    ).toBeInTheDocument();
    // The newer version is adopted before the retry, so the retry can succeed.
    await waitFor(() =>
      expect(onProduct).toHaveBeenCalledWith(expect.objectContaining({ version: 4 })),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Apply my changes' }));
    await waitFor(() => expect(statusMock).toHaveBeenCalledTimes(2));
    expect(statusMock.mock.calls[1]?.[0]).toMatchObject({ expectedVersion: 4, status: 'active' });
  });

  it('unpublishes a live product back to draft', async () => {
    statusMock.mockResolvedValue({ status: 'saved', product: product({ status: 'draft', version: 3 }) });
    renderControls({ status: 'active' });

    fireEvent.click(screen.getByRole('button', { name: 'Unpublish' }));
    await waitFor(() => expect(statusMock).toHaveBeenCalledTimes(1));
    expect(statusMock.mock.calls[0]?.[0]).toMatchObject({ status: 'draft' });
  });
});

describe('channels (T027c)', () => {
  it('lists on one channel without touching the other', async () => {
    publicationMock.mockResolvedValue({
      status: 'saved',
      product: product({ storeEnabled: true, version: 3 }),
    });
    renderControls();

    fireEvent.click(screen.getByRole('button', { name: 'List on store' }));

    await waitFor(() => expect(publicationMock).toHaveBeenCalledTimes(1));
    expect(publicationMock.mock.calls[0]?.[0]).toEqual({
      storeId: STORE,
      productId: PRODUCT,
      storeEnabled: true,
    });
    expect(await screen.findByText('Listed on the store channel.')).toBeInTheDocument();
  });

  it('unlists from the marketplace', async () => {
    publicationMock.mockResolvedValue({
      status: 'saved',
      product: product({ marketplaceEnabled: false, version: 3 }),
    });
    renderControls({ status: 'active', marketplaceEnabled: true });

    fireEvent.click(screen.getByRole('button', { name: 'Unlist from marketplace' }));
    await waitFor(() => expect(publicationMock).toHaveBeenCalledTimes(1));
    expect(publicationMock.mock.calls[0]?.[0]).toMatchObject({ marketplaceEnabled: false });
  });

  it('distinguishes an enabled channel on a draft from a live one', () => {
    renderControls({ status: 'draft', storeEnabled: true });
    expect(screen.getByText('Store channel: on (not live)')).toBeInTheDocument();
  });
});

describe('archive (T027c)', () => {
  it('requires a second, explicit confirmation', async () => {
    archiveMock.mockResolvedValue({ status: 'saved', product: product({ status: 'archived', version: 3 }) });
    renderControls();

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    expect(archiveMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm archive' }));
    await waitFor(() => expect(archiveMock).toHaveBeenCalledTimes(1));
    expect(archiveMock.mock.calls[0]?.[0]).toEqual({
      storeId: STORE,
      productId: PRODUCT,
      expectedVersion: 2,
    });
    expect(await screen.findByText('Product archived.')).toBeInTheDocument();
  });

  it('can be backed out before confirming', () => {
    renderControls();
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep product' }));
    expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument();
    expect(archiveMock).not.toHaveBeenCalled();
  });

  it('disables every control on an archived product and says why', () => {
    renderControls({ status: 'archived' });
    expect(screen.getByRole('button', { name: 'Unpublish' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'List on store' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'List on marketplace' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull();
    expect(screen.getByText(/cannot be published or listed on a channel/)).toBeInTheDocument();
  });
});
