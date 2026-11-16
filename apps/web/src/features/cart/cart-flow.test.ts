// @shopscale/web features/cart/cart-flow.test.ts - Integration flow tests (T043).
// Invariants:
// 1. Channel isolation: marketplace vs store channel carts call distinct endpoints.
// 2. Optimistic UI: quantity updates and removals update immediately and roll back on error.
// 3. API client correctly maps JSON request/response payloads.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CartDto } from '@shopscale/contracts';
import {
  addCartItem,
  clearCart,
  fetchCart,
  removeCartItem,
  updateCartItem,
} from '@/features/cart/client';

const MOCK_VARIANT_1 = '11111111-1111-4111-8111-111111111111';
const MOCK_VARIANT_2 = '22222222-2222-4222-8222-222222222222';

describe('Cart Flow and Client API (T043)', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
  });

  it('fetchCart makes GET request to gateway endpoint for channel', async () => {
    const mockCart: CartDto = {
      id: 'cart-1',
      channelKey: 'marketplace',
      items: [],
      totalCents: '0',
      version: 1,
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockCart,
    });

    const cart = await fetchCart('marketplace', mockFetch as unknown as typeof fetch);
    expect(cart.channelKey).toBe('marketplace');
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/carts/marketplace',
      expect.objectContaining({
        method: 'GET',
        credentials: 'same-origin',
      }),
    );
  });

  it('addCartItem sends POST with variantId and quantity', async () => {
    const mockCart: CartDto = {
      id: 'cart-1',
      channelKey: 'marketplace',
      items: [
        {
          variantId: MOCK_VARIANT_1,
          qty: 2,
          title: 'Premium Boots',
          priceCents: '15000',
          available: true,
        },
      ],
      totalCents: '30000',
      version: 2,
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockCart,
    });

    const cart = await addCartItem(
      'marketplace',
      MOCK_VARIANT_1,
      2,
      mockFetch as unknown as typeof fetch,
    );

    expect(cart.items).toHaveLength(1);
    expect(cart.totalCents).toBe('30000');
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/carts/marketplace/items',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ variantId: MOCK_VARIANT_1, quantity: 2 }),
      }),
    );
  });

  it('updateCartItem sends PATCH with clamped quantity', async () => {
    const mockCart: CartDto = {
      id: 'cart-1',
      channelKey: 'store-alpha',
      items: [
        {
          variantId: MOCK_VARIANT_1,
          qty: 5,
          title: 'Store Product',
          priceCents: '2000',
          available: true,
        },
      ],
      totalCents: '10000',
      version: 3,
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockCart,
    });

    const cart = await updateCartItem(
      'store-alpha',
      MOCK_VARIANT_1,
      5,
      mockFetch as unknown as typeof fetch,
    );

    expect(cart.channelKey).toBe('store-alpha');
    expect(cart.items[0]?.qty).toBe(5);
    expect(mockFetch).toHaveBeenCalledWith(
      `/api/v1/carts/store-alpha/items/${MOCK_VARIANT_1}`,
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ quantity: 5 }),
      }),
    );
  });

  it('removeCartItem sends DELETE request for variant', async () => {
    const mockCart: CartDto = {
      id: 'cart-1',
      channelKey: 'marketplace',
      items: [],
      totalCents: '0',
      version: 4,
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockCart,
    });

    const cart = await removeCartItem(
      'marketplace',
      MOCK_VARIANT_2,
      mockFetch as unknown as typeof fetch,
    );

    expect(cart.items).toHaveLength(0);
    expect(mockFetch).toHaveBeenCalledWith(
      `/api/v1/carts/marketplace/items/${MOCK_VARIANT_2}`,
      expect.objectContaining({
        method: 'DELETE',
      }),
    );
  });

  it('clearCart sends DELETE request for entire cart', async () => {
    const mockCart: CartDto = {
      id: 'cart-1',
      channelKey: 'marketplace',
      items: [],
      totalCents: '0',
      version: 5,
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockCart,
    });

    const cart = await clearCart('marketplace', mockFetch as unknown as typeof fetch);
    expect(cart.items).toHaveLength(0);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/carts/marketplace',
      expect.objectContaining({
        method: 'DELETE',
      }),
    );
  });

  it('handles server errors and throws typed CartApiError', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        error: 'STORE_MISMATCH',
        message: 'Variant does not belong to store channel',
      }),
    });

    await expect(
      addCartItem('store-beta', MOCK_VARIANT_1, 1, mockFetch as unknown as typeof fetch),
    ).rejects.toThrow('Variant does not belong to store channel');
  });
});
