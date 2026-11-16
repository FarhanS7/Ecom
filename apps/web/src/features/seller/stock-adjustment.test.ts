// Integration tests for adjustStockAction server action (T040).
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { adjustStockAction } from './actions';
import * as api from './client';

vi.mock('./client', () => ({
  adjustStock: vi.fn(),
}));

describe('adjustStockAction (T040 Integration Tests)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects invalid store IDs', async () => {
    const res = await adjustStockAction('invalid-store-id', {
      variantId: '11111111-1111-4111-a111-111111111111',
      deltaOnHand: 10,
      reason: 'manual_adjustment',
    });

    expect(res).toEqual({ status: 'not-found' });
    expect(api.adjustStock).not.toHaveBeenCalled();
  });

  it('rejects malformed payloads with bad-input', async () => {
    const validStoreId = '11111111-1111-4111-a111-111111111111';

    // Missing fields
    const res = await adjustStockAction(validStoreId, {
      variantId: '11111111-1111-4111-a111-111111111111',
      // deltaOnHand missing
      reason: 'invalid_reason',
    });

    expect(res.status).toBe('bad-input');
    expect(api.adjustStock).not.toHaveBeenCalled();
  });

  it('forwards valid payload to api.adjustStock and returns ok status with data', async () => {
    const validStoreId = '11111111-1111-4111-a111-111111111111';
    const validVariantId = '22222222-2222-4222-a222-222222222222';

    vi.mocked(api.adjustStock).mockResolvedValue({
      status: 'ok',
      data: {
        ok: true,
        onHand: 25,
        reserved: 5,
        available: 20,
      },
    });

    const res = await adjustStockAction(validStoreId, {
      variantId: validVariantId,
      deltaOnHand: 10,
      reason: 'manual_adjustment',
    });

    expect(res.status).toBe('ok');
    if (res.status === 'ok') {
      expect(res.data.onHand).toBe(25);
      expect(res.data.available).toBe(20);
    }

    expect(api.adjustStock).toHaveBeenCalledWith(validStoreId, {
      variantId: validVariantId,
      deltaOnHand: 10,
      reason: 'manual_adjustment',
    });
  });

  it('handles conflict responses from API (cannot reduce below reserved)', async () => {
    const validStoreId = '11111111-1111-4111-a111-111111111111';
    const validVariantId = '22222222-2222-4222-a222-222222222222';

    vi.mocked(api.adjustStock).mockResolvedValue({
      status: 'conflict',
      message: 'Cannot reduce stock below active reserved count',
    });

    const res = await adjustStockAction(validStoreId, {
      variantId: validVariantId,
      deltaOnHand: -50,
      reason: 'manual_adjustment',
    });

    expect(res.status).toBe('conflict');
    if (res.status === 'conflict') {
      expect(res.message).toBe('Cannot reduce stock below active reserved count');
    }
  });
});
