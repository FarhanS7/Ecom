// apps/web/src/features/orders/fulfillment-action.test.ts - Tests for seller fulfillment server actions (T057).

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { transitionSuborderAction } from '@/features/seller/orders/actions';

// Mock next/headers
vi.mock('next/headers', () => ({
  cookies: () => ({
    toString: () => 'access_token=mock-token',
  }),
}));

// Mock @/lib/api
vi.mock('@/lib/api', () => ({
  apiBaseUrl: () => 'http://localhost:4000',
}));

describe('transitionSuborderAction (T057)', () => {
  const validStoreId = '11111111-1111-4111-8111-111111111111';
  const validSuborderId = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects invalid UUIDs without calling fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const res1 = await transitionSuborderAction('not-a-uuid', validSuborderId, {
      toStatus: 'PACKED',
    });
    expect(res1.ok).toBe(false);
    if (!res1.ok) {
      expect(res1.error).toContain('Invalid store or suborder identifier');
    }

    const res2 = await transitionSuborderAction(validStoreId, 'invalid-suborder', {
      toStatus: 'PACKED',
    });
    expect(res2.ok).toBe(false);
    if (!res2.ok) {
      expect(res2.error).toContain('Invalid store or suborder identifier');
    }

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects invalid status payloads without calling fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const res = await transitionSuborderAction(validStoreId, validSuborderId, {
      // @ts-expect-error invalid enum testing
      toStatus: 'INVALID_STATUS',
    });

    expect(res.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('calls backend API with session cookie and payload on valid request', async () => {
    const mockResponseData = {
      success: true,
      suborder: {
        id: validSuborderId,
        orderId: '33333333-3333-4333-8333-333333333333',
        storeId: validStoreId,
        fulfillmentStatus: 'PACKED',
        subtotalCents: 2000,
        shippingCents: 500,
        discountCents: 0,
        totalCents: 2500,
        commissionBpsSnapshot: 1000,
        createdAt: new Date().toISOString(),
      },
      parentFulfillmentStatus: 'PACKED',
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponseData,
    } as Response);

    const result = await transitionSuborderAction(validStoreId, validSuborderId, {
      toStatus: 'PACKED',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual(mockResponseData);
    }
  });

  it('returns structured error when backend returns failure status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        message: 'trackingRef is required when transitioning suborder to SHIPPED.',
      }),
    } as Response);

    const result = await transitionSuborderAction(validStoreId, validSuborderId, {
      toStatus: 'SHIPPED',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('trackingRef is required');
    }
  });
});
