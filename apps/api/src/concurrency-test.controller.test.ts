// @shopscale/api/concurrency-test.controller.test - Unit tests for ConcurrencyTestController (T044).

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { inventoryService } from '@shopscale/backend';
import { ConcurrencyTestController } from './concurrency-test.controller.js';

vi.mock('@shopscale/backend', () => ({
  inventoryService: {
    reserve: vi.fn(),
    seedVariantStock: vi.fn(),
    getVariantStockStats: vi.fn(),
  },
}));

describe('ConcurrencyTestController (T044)', () => {
  let controller: ConcurrencyTestController;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new ConcurrencyTestController();
  });

  it('concurrencyReserve throws 409 if variantId is missing', async () => {
    await expect(controller.concurrencyReserve({ variantId: '' })).rejects.toThrow(
      ConflictException,
    );
  });

  it('concurrencyReserve returns 200 with reservationIds on success', async () => {
    vi.mocked(inventoryService.reserve).mockResolvedValueOnce({
      ok: true,
      reservationIds: ['res-1'],
    });

    const result = await controller.concurrencyReserve({
      variantId: 'var-123',
      quantity: 1,
      checkoutId: 'chk-abc',
    });

    expect(result).toEqual({
      success: true,
      checkoutId: 'chk-abc',
      reservationIds: ['res-1'],
    });
    expect(inventoryService.reserve).toHaveBeenCalledWith({
      checkoutId: 'chk-abc',
      items: [{ variantId: 'var-123', qty: 1 }],
    });
  });

  it('concurrencyReserve maps INSUFFICIENT_STOCK to 409 ConflictException', async () => {
    vi.mocked(inventoryService.reserve).mockResolvedValueOnce({
      ok: false,
      code: 'INSUFFICIENT_STOCK',
      variantId: 'var-123',
      available: 0,
    });

    await expect(
      controller.concurrencyReserve({
        variantId: 'var-123',
        quantity: 5,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('concurrencySeed delegates to inventoryService.seedVariantStock', async () => {
    vi.mocked(inventoryService.seedVariantStock).mockResolvedValueOnce({
      variantId: 'var-123',
      storeId: 'store-1',
      onHand: 50,
      reserved: 0,
    });

    const result = await controller.concurrencySeed({
      variantId: 'var-123',
      onHand: 50,
    });

    expect(result).toEqual({
      variantId: 'var-123',
      storeId: 'store-1',
      onHand: 50,
      reserved: 0,
    });
    expect(inventoryService.seedVariantStock).toHaveBeenCalledWith('var-123', undefined, 50);
  });

  it('getConcurrencyStats delegates to inventoryService.getVariantStockStats', async () => {
    vi.mocked(inventoryService.getVariantStockStats).mockResolvedValueOnce({
      variantId: 'var-123',
      onHand: 50,
      reserved: 50,
      available: 0,
      activeReservationsCount: 50,
      totalDeltaReserved: 50,
    });

    const result = await controller.getConcurrencyStats('var-123');

    expect(result.available).toBe(0);
    expect(result.activeReservationsCount).toBe(50);
  });
});
