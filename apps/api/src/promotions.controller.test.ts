// @shopscale/api/promotions.controller.test - Unit tests for PromotionsController (OR-9 / T063).

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PromotionsController } from './promotions.controller.js';
import { authorizeStore, couponService, requirePlatformAdmin } from '@shopscale/backend';

vi.mock('@shopscale/backend', () => ({
  couponService: {
    listStoreCoupons: vi.fn(),
    createCoupon: vi.fn(),
    validateAndCalculateDiscount: vi.fn(),
    listPlatformCoupons: vi.fn(),
  },
  authorizeStore: vi.fn(),
  requirePlatformAdmin: vi.fn(),
  CouponNotFoundError: class CouponNotFoundError extends Error {},
  CouponInactiveError: class CouponInactiveError extends Error {},
  CouponExpiredError: class CouponExpiredError extends Error {},
  CouponNotStartedError: class CouponNotStartedError extends Error {},
  CouponGlobalLimitExceededError: class CouponGlobalLimitExceededError extends Error {},
  CouponPerUserLimitExceededError: class CouponPerUserLimitExceededError extends Error {},
  CouponStoreMismatchError: class CouponStoreMismatchError extends Error {},
  CouponConflictError: class CouponConflictError extends Error {},
}));

describe('PromotionsController (T063 Unit Tests)', () => {
  let controller: PromotionsController;
  const storeId = '11111111-1111-4111-8111-111111111111';
  const userId = '22222222-2222-4222-8222-222222222222';
  const couponId = '33333333-3333-4333-8333-333333333333';

  const mockCoupon = {
    id: couponId,
    storeId,
    code: 'SAVE10',
    kind: 'PERCENT' as const,
    value: 10,
    startsAt: '2026-01-01T00:00:00.000Z',
    endsAt: '2026-12-31T23:59:59.000Z',
    globalLimit: 100,
    perUserLimit: 1,
    heldCount: 0,
    redeemedCount: 5,
    status: 'active' as const,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new PromotionsController();
  });

  describe('seller coupons', () => {
    it('returns coupons list for authorized store member', async () => {
      vi.mocked(authorizeStore).mockResolvedValueOnce(true);
      vi.mocked(couponService.listStoreCoupons).mockResolvedValueOnce([mockCoupon]);

      const result = await controller.listStoreCoupons(
        { actor: { userId, familyId: 'f1' } },
        storeId,
      );

      expect(result.coupons).toHaveLength(1);
      expect(result.coupons[0]!.code).toBe('SAVE10');
    });

    it('throws NotFoundException for unauthorized caller (anti-oracle)', async () => {
      vi.mocked(authorizeStore).mockResolvedValueOnce(false);

      await expect(
        controller.listStoreCoupons({ actor: { userId, familyId: 'f1' } }, storeId),
      ).rejects.toThrow(NotFoundException);
    });

    it('creates store coupon when payload is valid and store authorized', async () => {
      vi.mocked(authorizeStore).mockResolvedValueOnce(true);
      vi.mocked(couponService.createCoupon).mockResolvedValueOnce(mockCoupon);

      const result = await controller.createStoreCoupon(
        { actor: { userId, familyId: 'f1' } },
        storeId,
        {
          code: 'SAVE10',
          kind: 'PERCENT',
          value: 10,
          endsAt: '2026-12-31T23:59:59.000Z',
        },
      );

      expect(result.id).toBe(couponId);
      expect(result.code).toBe('SAVE10');
    });

    it('rejects invalid coupon payload with BadRequestException', async () => {
      vi.mocked(authorizeStore).mockResolvedValueOnce(true);

      await expect(
        controller.createStoreCoupon({ actor: { userId, familyId: 'f1' } }, storeId, {
          code: '', // invalid empty
          kind: 'PERCENT',
          value: 150, // invalid > 100
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('public coupon validation', () => {
    it('returns valid response with calculated discount for eligible coupon', async () => {
      vi.mocked(couponService.validateAndCalculateDiscount).mockResolvedValueOnce({
        couponId,
        code: 'SAVE10',
        kind: 'PERCENT',
        value: 10,
        storeId,
        discountCents: 500,
        eligibleSubtotalCents: 5000,
        isStoreScoped: true,
      });

      const result = await controller.validateCoupon(
        { actor: { userId, familyId: 'f1' } },
        {
          code: 'SAVE10',
          subtotalCents: 5000,
          storeIds: [storeId],
        },
      );

      expect(result.valid).toBe(true);
      expect(result.code).toBe('SAVE10');
      expect(result.discountCents).toBe(500);
      expect(result.storeScoped).toBe(true);
    });
  });

  describe('admin coupons', () => {
    it('allows platform admin to list platform coupons', async () => {
      vi.mocked(couponService.listPlatformCoupons).mockResolvedValueOnce([
        { ...mockCoupon, storeId: null },
      ]);

      const result = await controller.listPlatformCoupons({
        actor: { userId, familyId: 'f1', roles: ['admin'] },
      });

      expect(result.coupons).toHaveLength(1);
      expect(result.coupons[0]!.storeId).toBeNull();
    });

    it('denies non-admin callers with ForbiddenException', async () => {
      vi.mocked(requirePlatformAdmin).mockRejectedValueOnce(new Error('Not admin'));

      await expect(
        controller.listPlatformCoupons({ actor: { userId, familyId: 'f1', roles: [] } }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
