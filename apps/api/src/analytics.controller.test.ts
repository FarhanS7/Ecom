// @shopscale/api/analytics.controller.test - Unit tests for AnalyticsController (AD-2, REQ-ENG-002 / T066, T067).

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller.js';
import {
  analyticsQueryService,
  authorizeStore,
  requirePlatformAdmin,
} from '@shopscale/backend';

vi.mock('@shopscale/backend', () => ({
  analyticsQueryService: {
    getStoreAnalytics: vi.fn(),
    getPlatformAnalytics: vi.fn(),
  },
  authorizeStore: vi.fn(),
  requirePlatformAdmin: vi.fn(),
}));

describe('AnalyticsController (T067 Unit Tests)', () => {
  let controller: AnalyticsController;
  const storeId = '11111111-1111-4111-8111-111111111111';
  const userId = '22222222-2222-4222-8222-222222222222';

  const mockStoreAnalytics = {
    storeId,
    totalOrders: 10,
    totalGmvCents: 50000,
    totalUnitsSold: 15,
    avgOrderValueCents: 5000,
    dailyTrends: [
      {
        day: '2026-11-16',
        ordersCount: 10,
        unitsSold: 15,
        gmvCents: 50000,
        netSalesCents: 48000,
        avgOrderValueCents: 5000,
      },
    ],
  };

  const mockPlatformAnalytics = {
    platformTotalOrders: 100,
    platformTotalGmvCents: 1000000,
    platformAvgOrderValueCents: 10000,
    topStores: [
      {
        storeId,
        storeName: 'Top Keyboards',
        storeSlug: 'top-keyboards',
        totalOrders: 50,
        lifetimeGmvCents: 500000,
        avgOrderValueCents: 10000,
        lastOrderAt: '2026-11-16T12:00:00.000Z',
      },
    ],
    dailyTrends: [
      {
        day: '2026-11-16',
        ordersCount: 100,
        unitsSold: 150,
        gmvCents: 1000000,
        netSalesCents: 950000,
        avgOrderValueCents: 10000,
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new AnalyticsController();
  });

  describe('GET /v1/seller/stores/:storeId/analytics', () => {
    it('returns store analytics summary for authorized store member', async () => {
      vi.mocked(authorizeStore).mockResolvedValueOnce(true);
      vi.mocked(analyticsQueryService.getStoreAnalytics).mockResolvedValueOnce(
        mockStoreAnalytics,
      );

      const result = await controller.getStoreAnalytics(
        storeId,
        { actor: { userId, email: 'merchant@example.com', roles: ['seller'] } },
        '2026-11-01',
        '2026-11-30',
      );

      expect(result).toEqual(mockStoreAnalytics);
      expect(authorizeStore).toHaveBeenCalledWith({
        userId,
        storeId,
        permission: 'catalog:manage',
      });
      expect(analyticsQueryService.getStoreAnalytics).toHaveBeenCalledWith(
        storeId,
        expect.objectContaining({
          from: new Date('2026-11-01'),
          to: new Date('2026-11-30'),
        }),
      );
    });

    it('throws NotFoundException for unauthorized store caller', async () => {
      vi.mocked(authorizeStore).mockResolvedValueOnce(false);

      await expect(
        controller.getStoreAnalytics(storeId, {
          actor: { userId, email: 'stranger@example.com', roles: ['buyer'] },
        }),
      ).rejects.toThrow(NotFoundException);

      expect(analyticsQueryService.getStoreAnalytics).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for non-UUID storeId', async () => {
      await expect(
        controller.getStoreAnalytics('invalid-id', {
          actor: { userId, email: 'merchant@example.com', roles: ['seller'] },
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('GET /v1/admin/analytics', () => {
    it('returns platform analytics overview for platform administrator', async () => {
      vi.mocked(analyticsQueryService.getPlatformAnalytics).mockResolvedValueOnce(
        mockPlatformAnalytics,
      );

      const result = await controller.getPlatformAnalytics(
        { actor: { userId, email: 'admin@platform.com', roles: ['admin'] } },
        '2026-11-01',
        '2026-11-30',
        '10',
      );

      expect(result).toEqual(mockPlatformAnalytics);
      expect(analyticsQueryService.getPlatformAnalytics).toHaveBeenCalledWith({
        from: new Date('2026-11-01'),
        to: new Date('2026-11-30'),
        topLimit: 10,
      });
    });

    it('throws ForbiddenException for non-admin user', async () => {
      vi.mocked(requirePlatformAdmin).mockRejectedValueOnce(new Error('Forbidden'));

      await expect(
        controller.getPlatformAnalytics({
          actor: { userId, email: 'buyer@example.com', roles: ['buyer'] },
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(analyticsQueryService.getPlatformAnalytics).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when unauthenticated', async () => {
      await expect(controller.getPlatformAnalytics({})).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
