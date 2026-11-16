// @shopscale/web features/checkout/client - Gateway client for checkout flow (T048).

import { gatewayRequest } from '@/lib/csrf';
import type { CheckoutAcceptedDto, CheckoutRequestDto, QuoteRequest, QuoteResponse } from '@shopscale/contracts';
import type { AddressItem, CheckoutError } from './types';

export class CheckoutApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly data: CheckoutError,
  ) {
    super(data.message || `Checkout request failed with status ${status}`);
    this.name = 'CheckoutApiError';
  }
}

export async function fetchAddresses(): Promise<AddressItem[]> {
  const res = await gatewayRequest('/api/v1/me/addresses', { method: 'GET' });
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('UNAUTHORIZED');
    }
    throw new Error('Failed to load saved addresses');
  }
  const body = (await res.json()) as { items?: AddressItem[] };
  return Array.isArray(body.items) ? body.items : [];
}

export async function createAddress(fields: Record<string, string>): Promise<AddressItem> {
  const res = await gatewayRequest('/api/v1/me/addresses', {
    method: 'POST',
    body: fields,
  });
  if (!res.ok) {
    const errorBody = (await res.json().catch(() => ({}))) as CheckoutError;
    throw new CheckoutApiError(res.status, errorBody);
  }
  return (await res.json()) as AddressItem;
}

export async function fetchQuote(request: QuoteRequest): Promise<QuoteResponse> {
  const res = await gatewayRequest('/api/v1/checkout/quote', {
    method: 'POST',
    body: request,
  });
  if (!res.ok) {
    const errorBody = (await res.json().catch(() => ({}))) as CheckoutError;
    throw new CheckoutApiError(res.status, errorBody);
  }
  return (await res.json()) as QuoteResponse;
}

export async function submitCheckout(
  request: CheckoutRequestDto,
  idempotencyKey: string,
): Promise<CheckoutAcceptedDto> {
  const res = await gatewayRequest('/api/v1/checkout', {
    method: 'POST',
    body: request,
    headers: {
      'idempotency-key': idempotencyKey,
    },
  });
  if (!res.ok) {
    const errorBody = (await res.json().catch(() => ({}))) as CheckoutError;
    throw new CheckoutApiError(res.status, errorBody);
  }
  return (await res.json()) as CheckoutAcceptedDto;
}
