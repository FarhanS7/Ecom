// @shopscale/web features/wishlist/wishlist-view.test.tsx - Unit tests for WishlistView (REQ-ENG-001 / T065).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WishlistView } from './wishlist-view';
import { gatewayRequest } from '@/lib/csrf';

vi.mock('@/lib/csrf', () => ({
  gatewayRequest: vi.fn(),
}));

describe('WishlistView (T065)', () => {
  const mockItems = [
    {
      productId: '11111111-1111-4111-8111-111111111111',
      title: 'Mechanical Keyboard',
      slug: 'mechanical-keyboard',
      description: 'Clicky blue switches',
      priceCents: 12900,
      currency: 'USD',
      imageUrl: 'https://cdn.example.com/kb.jpg',
      available: true,
      status: 'active',
      storeName: 'Keyboards Inc',
      storeSlug: 'keyboards-inc',
      primaryVariantId: 'var-111',
      addedAt: '2026-11-16T12:00:00.000Z',
    },
    {
      productId: '22222222-2222-4222-8222-222222222222',
      title: 'Discontinued Desk Mat',
      slug: 'discontinued-desk-mat',
      description: 'Limited edition',
      priceCents: 3500,
      currency: 'USD',
      imageUrl: null,
      available: false,
      status: 'unavailable',
      storeName: 'Desk Accessories',
      storeSlug: 'desk-accessories',
      primaryVariantId: null,
      addedAt: '2026-11-16T11:00:00.000Z',
    },
  ];

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders empty state when no items in wishlist', () => {
    render(<WishlistView initialItems={[]} />);

    expect(screen.getByText('Your wishlist is empty')).toBeInTheDocument();
    expect(screen.getByTestId('browse-products-link')).toHaveAttribute('href', '/products');
  });

  it('renders wishlist cards with title, price, and availability tags', () => {
    render(<WishlistView initialItems={mockItems} />);

    expect(screen.getAllByTestId('wishlist-card')).toHaveLength(2);
    expect(screen.getByText('Mechanical Keyboard')).toBeInTheDocument();
    expect(screen.getByText('Discontinued Desk Mat')).toBeInTheDocument();
    expect(screen.getByText('In Stock')).toBeInTheDocument();
    expect(screen.getAllByText('Unavailable')).toHaveLength(2);
  });

  it('removes item from list when remove button is clicked', async () => {
    vi.mocked(gatewayRequest).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true, removed: true }),
    } as Response);

    render(<WishlistView initialItems={mockItems} />);

    const removeBtns = screen.getAllByTestId('wishlist-remove-btn');
    fireEvent.click(removeBtns[0]!);

    await waitFor(() => {
      expect(screen.queryByText('Mechanical Keyboard')).not.toBeInTheDocument();
      expect(screen.getByText('Discontinued Desk Mat')).toBeInTheDocument();
    });

    expect(gatewayRequest).toHaveBeenCalledWith(
      '/api/v1/wishlist/11111111-1111-4111-8111-111111111111',
      { method: 'DELETE' },
    );
  });
});
