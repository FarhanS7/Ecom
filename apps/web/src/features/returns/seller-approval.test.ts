// apps/web/src/features/returns/seller-approval.test.ts - Tests for seller return inspection actions (T059).

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createReturnRequestAction, inspectReturnRequestAction } from './actions';

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

describe('inspectReturnRequestAction (T059)', () => {
  const validStoreId = '11111111-1111-4111-8111-111111111111';
  const validReturnId = '22222222-2222-4222-8222-222222222222';
  const validOrderId = '33333333-3333-4333-8333-333333333333';
  const validOrderItemId = '44444444-4444-4444-8444-444444444444';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects invalid UUIDs without calling fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const res1 = await inspectReturnRequestAction('bad-store', validReturnId, {
      decision: 'APPROVED',
      restock: true,
    });
    expect(res1.ok).toBe(false);
    if (!res1.ok) {
      expect(res1.error).toContain('Invalid store or return identifier');
    }

    const res2 = await inspectReturnRequestAction(validStoreId, 'bad-return', {
      decision: 'APPROVED',
      restock: true,
    });
    expect(res2.ok).toBe(false);
    if (!res2.ok) {
      expect(res2.error).toContain('Invalid store or return identifier');
    }

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects invalid decision payload without calling fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const res = await inspectReturnRequestAction(validStoreId, validReturnId, {
      // @ts-expect-error testing invalid decision enum
      decision: 'MAYBE',
    });

    expect(res.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('calls backend API with session cookie and payload on valid inspection', async () => {
    const mockReturnDto = {
      id: validReturnId,
      orderId: validOrderId,
      sellerOrderId: '55555555-5555-4555-8555-555555555555',
      storeId: validStoreId,
      orderItemId: validOrderItemId,
      userId: '66666666-6666-4666-8666-666666666666',
      qty: 2,
      reason: 'Defective item',
      customerNotes: 'Damaged zipper',
      status: 'APPROVED' as const,
      inspectionNotes: 'Verified damage and restocked',
      createdAt: new Date().toISOString(),
      itemTitle: 'Winter Jacket',
      itemSku: 'JKT-01',
      itemUnitPriceCents: 12000,
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockReturnDto), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await inspectReturnRequestAction(validStoreId, validReturnId, {
      decision: 'APPROVED',
      inspectionNotes: 'Verified damage and restocked',
      restock: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual(mockReturnDto);
    }

    expect(fetchSpy).toHaveBeenCalledWith(
      `http://localhost:4000/v1/seller/stores/${validStoreId}/returns/${validReturnId}/inspect`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          cookie: 'access_token=mock-token',
          'content-type': 'application/json',
        }),
        body: JSON.stringify({
          decision: 'APPROVED',
          inspectionNotes: 'Verified damage and restocked',
          restock: true,
        }),
      }),
    );
  });

  it('handles backend error response properly', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'Return already inspected' }), {
        status: 409,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await inspectReturnRequestAction(validStoreId, validReturnId, {
      decision: 'APPROVED',
      restock: false,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('Return already inspected');
    }
  });

  it('creates customer return request successfully', async () => {
    const mockReturnDto = {
      id: validReturnId,
      orderId: validOrderId,
      sellerOrderId: '55555555-5555-4555-8555-555555555555',
      storeId: validStoreId,
      orderItemId: validOrderItemId,
      userId: '66666666-6666-4666-8666-666666666666',
      qty: 1,
      reason: 'Wrong item sent',
      customerNotes: 'Received blue instead of black',
      status: 'PENDING_INSPECTION' as const,
      inspectionNotes: null,
      createdAt: new Date().toISOString(),
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockReturnDto), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await createReturnRequestAction(validOrderId, {
      orderItemId: validOrderItemId,
      qty: 1,
      reason: 'Wrong item sent',
      customerNotes: 'Received blue instead of black',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual(mockReturnDto);
    }

    expect(fetchSpy).toHaveBeenCalledWith(
      `http://localhost:4000/v1/orders/${validOrderId}/returns`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          cookie: 'access_token=mock-token',
        }),
      }),
    );
  });
});
