// @shopscale/web features/wishlist/wishlist-button.test.tsx - Unit tests for WishlistHeartButton (REQ-ENG-001 / T065).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WishlistHeartButton } from './wishlist-button';
import { gatewayRequest } from '@/lib/csrf';

vi.mock('@/lib/csrf', () => ({
  gatewayRequest: vi.fn(),
}));

describe('WishlistHeartButton (T065)', () => {
  const productId = '22222222-2222-4222-8222-222222222222';

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders default inactive state with Add to wishlist aria-label', () => {
    render(<WishlistHeartButton productId={productId} />);

    const btn = screen.getByTestId('wishlist-toggle-btn');
    expect(btn).toHaveAttribute('aria-label', 'Add to wishlist');
    expect(btn).toHaveAttribute('aria-pressed', 'false');
  });

  it('toggles to active state and calls PUT endpoint on click', async () => {
    vi.mocked(gatewayRequest).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true, added: true }),
    } as Response);

    const onToggle = vi.fn();
    render(<WishlistHeartButton productId={productId} onToggle={onToggle} />);

    const btn = screen.getByTestId('wishlist-toggle-btn');
    fireEvent.click(btn);

    await waitFor(() => {
      expect(btn).toHaveAttribute('aria-label', 'Remove from wishlist');
      expect(btn).toHaveAttribute('aria-pressed', 'true');
    });

    expect(gatewayRequest).toHaveBeenCalledWith(
      `/api/v1/wishlist/${productId}`,
      { method: 'PUT' },
    );
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it('toggles from active to inactive and calls DELETE endpoint on click', async () => {
    vi.mocked(gatewayRequest).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true, removed: true }),
    } as Response);

    const onToggle = vi.fn();
    render(
      <WishlistHeartButton
        productId={productId}
        initialInWishlist={true}
        onToggle={onToggle}
      />,
    );

    const btn = screen.getByTestId('wishlist-toggle-btn');
    expect(btn).toHaveAttribute('aria-label', 'Remove from wishlist');

    fireEvent.click(btn);

    await waitFor(() => {
      expect(btn).toHaveAttribute('aria-label', 'Add to wishlist');
      expect(btn).toHaveAttribute('aria-pressed', 'false');
    });

    expect(gatewayRequest).toHaveBeenCalledWith(
      `/api/v1/wishlist/${productId}`,
      { method: 'DELETE' },
    );
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it('rolls back optimistic toggle when request fails', async () => {
    vi.mocked(gatewayRequest).mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response);

    render(<WishlistHeartButton productId={productId} initialInWishlist={false} />);

    const btn = screen.getByTestId('wishlist-toggle-btn');
    fireEvent.click(btn);

    await waitFor(() => {
      expect(btn).toHaveAttribute('aria-label', 'Add to wishlist');
      expect(btn).toHaveAttribute('aria-pressed', 'false');
    });
  });
});
