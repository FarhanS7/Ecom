// packages/backend/src/promotions/coupon.service.test.ts - Unit tests for CouponService (OR-9 / T063).

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Sql } from 'postgres';
import { CouponService, type CouponDbRow } from './coupon.service.js';
import {
  CouponConflictError,
  CouponExpiredError,
  CouponGlobalLimitExceededError,
  CouponPerUserLimitExceededError,
  CouponStoreMismatchError,
} from './errors.js';

vi.mock('../platform/audit.service.js', () => ({
  auditService: {
    recordMutation: vi.fn().mockResolvedValue({ id: 'audit-mock-1' }),
  },
}));

function createSql(mock: unknown): Sql {
  return mock as unknown as Sql;
}

describe('CouponService (T063 Unit Tests)', () => {
  const storeId1 = '11111111-1111-4111-8111-111111111111';
  const storeId2 = '22222222-2222-4222-8222-222222222222';
  const couponId = '33333333-3333-4333-8333-333333333333';
  const userId = '44444444-4444-4444-8444-444444444444';
  const orderId = '55555555-5555-4555-8555-555555555555';

  const baseCouponRow: CouponDbRow = {
    id: couponId,
    store_id: storeId1,
    code: 'SAVE20',
    kind: 'PERCENT',
    value: 20,
    starts_at: new Date('2026-01-01T00:00:00Z'),
    ends_at: new Date('2026-12-31T23:59:59Z'),
    global_limit: 100,
    per_user_limit: 1,
    held_count: 0,
    redeemed_count: 5,
    status: 'active',
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createCoupon', () => {
    it('creates coupon with upper-cased code and returns DTO', async () => {
      const mockSql = vi.fn().mockImplementation((strings: TemplateStringsArray) => {
        const query = strings.join('');
        if (query.includes('SELECT id FROM coupons')) {
          return Promise.resolve([]); // No duplicate
        }
        if (query.includes('INSERT INTO coupons')) {
          return Promise.resolve([baseCouponRow]);
        }
        return Promise.resolve([]);
      });

      const service = new CouponService(createSql(mockSql));
      const result = await service.createCoupon(
        {
          code: 'save20',
          kind: 'PERCENT',
          value: 20,
          endsAt: '2026-12-31T23:59:59.000Z',
          globalLimit: 100,
          perUserLimit: 1,
        },
        storeId1,
        userId,
      );

      expect(result.id).toBe(couponId);
      expect(result.code).toBe('SAVE20');
      expect(result.kind).toBe('PERCENT');
      expect(result.value).toBe(20);
    });

    it('rejects percentage value greater than 100', async () => {
      const mockSql = vi.fn();
      const service = new CouponService(createSql(mockSql));

      await expect(
        service.createCoupon(
          {
            code: 'INVALID',
            kind: 'PERCENT',
            value: 120,
            endsAt: '2026-12-31T23:59:59.000Z',
          },
          storeId1,
        ),
      ).rejects.toThrow('Percentage coupon value must be between 1 and 100');
    });

    it('throws CouponConflictError on duplicate coupon in same scope', async () => {
      const mockSql = vi.fn().mockImplementation((strings: TemplateStringsArray) => {
        const query = strings.join('');
        if (query.includes('SELECT id FROM coupons')) {
          return Promise.resolve([{ id: couponId }]); // Duplicate exists!
        }
        return Promise.resolve([]);
      });

      const service = new CouponService(createSql(mockSql));
      await expect(
        service.createCoupon(
          {
            code: 'SAVE20',
            kind: 'PERCENT',
            value: 20,
            endsAt: '2026-12-31T23:59:59.000Z',
          },
          storeId1,
        ),
      ).rejects.toThrow(CouponConflictError);
    });
  });

  describe('validateAndCalculateDiscount', () => {
    it('calculates proportional percentage discount on matching store items only', async () => {
      const mockSql = vi.fn().mockImplementation((strings: TemplateStringsArray) => {
        const query = strings.join('');
        if (query.includes('SELECT * FROM coupons')) {
          return Promise.resolve([baseCouponRow]);
        }
        if (query.includes('SELECT held_count, redeemed_count FROM coupon_user_counters')) {
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      });

      const service = new CouponService(createSql(mockSql));
      const result = await service.validateAndCalculateDiscount({
        code: 'SAVE20',
        items: [
          { variantId: 'var-1', storeId: storeId1, subtotalCents: 5000 }, // $50 from store 1 (eligible)
          { variantId: 'var-2', storeId: storeId2, subtotalCents: 5000 }, // $50 from store 2 (ineligible)
        ],
        userId,
      });

      expect(result.code).toBe('SAVE20');
      expect(result.kind).toBe('PERCENT');
      expect(result.isStoreScoped).toBe(true);
      expect(result.eligibleSubtotalCents).toBe(5000);
      // 20% of $50 ($5000 cents) = $10 (1000 cents), NOT 20% of $100!
      expect(result.discountCents).toBe(1000);
    });

    it('throws CouponStoreMismatchError if cart contains no items from the coupon store', async () => {
      const mockSql = vi.fn().mockImplementation((strings: TemplateStringsArray) => {
        const query = strings.join('');
        if (query.includes('SELECT * FROM coupons')) {
          return Promise.resolve([baseCouponRow]); // belongs to storeId1
        }
        return Promise.resolve([]);
      });

      const service = new CouponService(createSql(mockSql));
      await expect(
        service.validateAndCalculateDiscount({
          code: 'SAVE20',
          items: [
            { variantId: 'var-2', storeId: storeId2, subtotalCents: 5000 }, // only store 2!
          ],
        }),
      ).rejects.toThrow(CouponStoreMismatchError);
    });

    it('throws CouponExpiredError when current time is past coupon endsAt', async () => {
      const expiredCoupon = {
        ...baseCouponRow,
        ends_at: new Date('2020-01-01T00:00:00Z'), // long expired
      };

      const mockSql = vi.fn().mockImplementation((strings: TemplateStringsArray) => {
        const query = strings.join('');
        if (query.includes('SELECT * FROM coupons')) {
          return Promise.resolve([expiredCoupon]);
        }
        return Promise.resolve([]);
      });

      const service = new CouponService(createSql(mockSql));
      await expect(
        service.validateAndCalculateDiscount({
          code: 'SAVE20',
          items: [{ variantId: 'var-1', storeId: storeId1, subtotalCents: 5000 }],
        }),
      ).rejects.toThrow(CouponExpiredError);
    });

    it('throws CouponGlobalLimitExceededError when global redemptions hit limit', async () => {
      const maxedCoupon = {
        ...baseCouponRow,
        global_limit: 10,
        redeemed_count: 10, // fully used
      };

      const mockSql = vi.fn().mockImplementation((strings: TemplateStringsArray) => {
        const query = strings.join('');
        if (query.includes('SELECT * FROM coupons')) {
          return Promise.resolve([maxedCoupon]);
        }
        return Promise.resolve([]);
      });

      const service = new CouponService(createSql(mockSql));
      await expect(
        service.validateAndCalculateDiscount({
          code: 'SAVE20',
          items: [{ variantId: 'var-1', storeId: storeId1, subtotalCents: 5000 }],
        }),
      ).rejects.toThrow(CouponGlobalLimitExceededError);
    });

    it('throws CouponPerUserLimitExceededError when user has already redeemed the limit', async () => {
      const mockSql = vi.fn().mockImplementation((strings: TemplateStringsArray) => {
        const query = strings.join('').replace(/\s+/g, ' ');
        if (query.includes('SELECT * FROM coupons')) {
          return Promise.resolve([baseCouponRow]); // per_user_limit = 1
        }
        if (query.includes('coupon_user_counters')) {
          return Promise.resolve([{ held_count: 0, redeemed_count: 1 }]); // already used once
        }
        return Promise.resolve([]);
      });

      const service = new CouponService(createSql(mockSql));
      await expect(
        service.validateAndCalculateDiscount({
          code: 'SAVE20',
          items: [{ variantId: 'var-1', storeId: storeId1, subtotalCents: 5000 }],
          userId,
        }),
      ).rejects.toThrow(CouponPerUserLimitExceededError);
    });
  });

  describe('holdCoupon, redeemCoupon, and releaseCoupon lifecycle', () => {
    it('holds coupon under row lock, increments counter and writes coupon_uses', async () => {
      const txMock = vi.fn().mockImplementation((strings: TemplateStringsArray) => {
        const query = strings.join('');
        if (query.includes('FROM coupons') && query.includes('FOR UPDATE')) {
          return Promise.resolve([baseCouponRow]);
        }
        if (query.includes('FROM coupon_user_counters') && query.includes('FOR UPDATE')) {
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      });

      const service = new CouponService();
      await service.holdCoupon(createSql(txMock), {
        couponId,
        orderId,
        userId,
        discountCents: 1000,
      });

      // Verify global held_count increment executed
      const updateCouponCall = txMock.mock.calls.find((call) =>
        (call[0] as TemplateStringsArray).join('').includes('UPDATE coupons'),
      );
      expect(updateCouponCall).toBeDefined();

      // Verify coupon_user_counters upsert executed
      const userCounterCall = txMock.mock.calls.find((call) =>
        (call[0] as TemplateStringsArray).join('').includes('INSERT INTO coupon_user_counters'),
      );
      expect(userCounterCall).toBeDefined();

      // Verify coupon_uses inserted
      const useCall = txMock.mock.calls.find((call) =>
        (call[0] as TemplateStringsArray).join('').includes('INSERT INTO coupon_uses'),
      );
      expect(useCall).toBeDefined();
    });

    it('redeems coupon on payment: decrements held and increments redeemed counter', async () => {
      const txMock = vi.fn().mockImplementation((strings: TemplateStringsArray) => {
        const query = strings.join('').replace(/\s+/g, ' ');
        if (query.includes('FROM coupon_uses') && query.includes('FOR UPDATE')) {
          return Promise.resolve([
            {
              id: 'use-1',
              coupon_id: couponId,
              user_id: userId,
              status: 'HELD',
            },
          ]);
        }
        return Promise.resolve([]);
      });

      const service = new CouponService();
      await service.redeemCoupon(createSql(txMock), orderId);

      // Verify coupon_uses updated to REDEEMED
      const redeemCall = txMock.mock.calls.find((call) =>
        (call[0] as TemplateStringsArray).join('').includes('status = \'REDEEMED\''),
      );
      expect(redeemCall).toBeDefined();
    });

    it('releases held coupon on order failure: decrements held count', async () => {
      const txMock = vi.fn().mockImplementation((strings: TemplateStringsArray) => {
        const query = strings.join('').replace(/\s+/g, ' ');
        if (query.includes('FROM coupon_uses') && query.includes('FOR UPDATE')) {
          return Promise.resolve([
            {
              id: 'use-1',
              coupon_id: couponId,
              user_id: userId,
              status: 'HELD',
            },
          ]);
        }
        return Promise.resolve([]);
      });

      const service = new CouponService();
      await service.releaseCoupon(createSql(txMock), orderId);

      // Verify coupon_uses updated to RELEASED
      const releaseCall = txMock.mock.calls.find((call) =>
        (call[0] as TemplateStringsArray).join('').includes('status = \'RELEASED\''),
      );
      expect(releaseCall).toBeDefined();
    });
  });
});
