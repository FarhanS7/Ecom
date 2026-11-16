// @shopscale/web features/cart/client - Cart gateway client (T043).
// Invariants:
// 1. Same-origin gateway calls (/api/v1/carts/...) protected against CSRF.
// 2. Strong typed errors mapped from RFC 7807 / standard problem bodies.
// 3. Supports both authenticated sessions and anonymous guests via cookie pass-through.

import type { CartDto } from '@shopscale/contracts';
import { gatewayRequest } from '@/lib/csrf';

export class CartApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'CartApiError';
  }
}

async function handleResponse(res: Response): Promise<CartDto> {
  if (!res.ok) {
    let message = 'Cart operation failed';
    let code: string | undefined;
    try {
      const errData = (await res.json()) as { message?: string; detail?: string; title?: string; error?: string; code?: string };
      message = errData.message || errData.detail || errData.title || message;
      code = errData.code || errData.error;
    } catch {
      // ignore json parse failure
    }
    throw new CartApiError(message, res.status, code);
  }
  return (await res.json()) as CartDto;
}

export async function fetchCart(channelKey: string, fetcher: typeof fetch = fetch): Promise<CartDto> {
  const res = await gatewayRequest(`/api/v1/carts/${encodeURIComponent(channelKey)}`, { method: 'GET' }, fetcher);
  return handleResponse(res);
}

export async function addCartItem(
  channelKey: string,
  variantId: string,
  quantity = 1,
  fetcher: typeof fetch = fetch,
): Promise<CartDto> {
  const res = await gatewayRequest(
    `/api/v1/carts/${encodeURIComponent(channelKey)}/items`,
    {
      method: 'POST',
      body: { variantId, quantity },
    },
    fetcher,
  );
  return handleResponse(res);
}

export async function updateCartItem(
  channelKey: string,
  variantId: string,
  quantity: number,
  fetcher: typeof fetch = fetch,
): Promise<CartDto> {
  const res = await gatewayRequest(
    `/api/v1/carts/${encodeURIComponent(channelKey)}/items/${encodeURIComponent(variantId)}`,
    {
      method: 'PATCH',
      body: { quantity },
    },
    fetcher,
  );
  return handleResponse(res);
}

export async function removeCartItem(
  channelKey: string,
  variantId: string,
  fetcher: typeof fetch = fetch,
): Promise<CartDto> {
  const res = await gatewayRequest(
    `/api/v1/carts/${encodeURIComponent(channelKey)}/items/${encodeURIComponent(variantId)}`,
    {
      method: 'DELETE',
    },
    fetcher,
  );
  return handleResponse(res);
}

export async function clearCart(channelKey: string, fetcher: typeof fetch = fetch): Promise<CartDto> {
  const res = await gatewayRequest(`/api/v1/carts/${encodeURIComponent(channelKey)}`, { method: 'DELETE' }, fetcher);
  return handleResponse(res);
}
