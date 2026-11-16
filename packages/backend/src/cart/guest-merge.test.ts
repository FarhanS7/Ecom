// @shopscale/backend/cart/guest-merge.test - Unit tests for Guest Cart Signing and Merge (T042).
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Sql } from 'postgres';
import { GuestTokenService } from './guest-token.service.js';
import { CartService } from './cart.service.js';
import type { CartOwner } from './cart.service.js';
import {
  CartAlreadyMergedError,
  TamperedTokenError,
} from './errors.js';
import type { RedisCacheService } from '../platform/cache.service.js';

interface MockSql {
  begin: (cb: (tx: Sql) => Promise<unknown>) => Promise<unknown>;
  unsafe: ReturnType<typeof vi.fn>;
}

describe('Guest Cart Signing & Merge (T042 Unit Tests)', () => {
  const secretKey = 'super-secret-hmac-test-key-32-chars-long';
  let tokenService: GuestTokenService;

  beforeEach(() => {
    tokenService = new GuestTokenService(secretKey);
  });

  describe('GuestTokenService HMAC signing & verification', () => {
    it('mints signed guest token and successfully verifies valid token', () => {
      const guestId = '123e4567-e89b-12d3-a456-426614174000';
      const token = tokenService.mintToken(guestId);

      expect(token).toContain('.');
      expect(token.startsWith(guestId)).toBe(true);

      const verification = tokenService.verifyToken(token);
      expect(verification.valid).toBe(true);
      expect(verification.guestId).toBe(guestId);
    });

    it('rejects tampered guest ID with invalid verification', () => {
      const guestId = '123e4567-e89b-12d3-a456-426614174000';
      const token = tokenService.mintToken(guestId);

      // Tamper with the guest ID part
      const tampered = '00000000-0000-0000-0000-000000000000' + token.slice(guestId.length);
      const verification = tokenService.verifyToken(tampered);
      expect(verification.valid).toBe(false);
      expect(verification.guestId).toBeUndefined();
    });

    it('rejects tampered signature with invalid verification', () => {
      const guestId = '123e4567-e89b-12d3-a456-426614174000';
      const token = tokenService.mintToken(guestId);

      // Tamper with signature
      const tampered = token.slice(0, -4) + 'abcd';
      const verification = tokenService.verifyToken(tampered);
      expect(verification.valid).toBe(false);
    });

    it('rejects malformed tokens without delimiters', () => {
      expect(tokenService.verifyToken('just-a-plain-string').valid).toBe(false);
      expect(tokenService.verifyToken('').valid).toBe(false);
    });
  });

  describe('CartService.mergeGuestCart consolidation logic', () => {
    const userOwner: CartOwner = { kind: 'user', id: 'user-uuid-1' };
    const guestId = 'guest-uuid-1';
    const guestCartId = 'cart-guest-1';
    const userCartId = 'cart-user-1';
    const variantA = '00000000-0000-4000-8000-000000000001';
    const variantB = '00000000-0000-4000-8000-000000000002';

    let mockCache: {
      get: ReturnType<typeof vi.fn>;
      set: ReturnType<typeof vi.fn>;
      invalidate: ReturnType<typeof vi.fn>;
    };
    let mockSql: MockSql;

    beforeEach(() => {
      mockCache = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue(undefined),
        invalidate: vi.fn().mockResolvedValue(undefined),
      };

      mockSql = {
        begin: vi.fn(async (cb: (tx: Sql) => Promise<unknown>) => cb(mockSql as unknown as Sql)),
        unsafe: vi.fn(),
      };
    });

    it('throws TamperedTokenError when guest token signature is invalid', async () => {
      const service = new CartService(
        mockSql as unknown as Sql,
        mockCache as unknown as RedisCacheService,
        tokenService,
      );

      await expect(
        service.mergeGuestCart(userOwner, 'fake-guest-id.forged-signature', 'marketplace'),
      ).rejects.toThrow(TamperedTokenError);
    });

    it('throws CartAlreadyMergedError (409) if guest cart was already merged (replay prevention)', async () => {
      const validToken = tokenService.mintToken(guestId);

      // 1. Find guest cart record
      mockSql.unsafe.mockResolvedValueOnce([
        { id: guestCartId, channel_key: 'marketplace', version: 1 },
      ]);
      // 2. Check cart_merges -> found existing merge row!
      mockSql.unsafe.mockResolvedValueOnce([
        { id: 'merge-receipt-1', guest_cart_id: guestCartId },
      ]);

      const service = new CartService(
        mockSql as unknown as Sql,
        mockCache as unknown as RedisCacheService,
        tokenService,
      );

      await expect(
        service.mergeGuestCart(userOwner, validToken, 'marketplace'),
      ).rejects.toThrow(CartAlreadyMergedError);
    });

    it('sums quantities when customer already has Variant A (5 + 10 = 15)', async () => {
      const validToken = tokenService.mintToken(guestId);

      // 1. Find guest cart
      mockSql.unsafe.mockResolvedValueOnce([
        { id: guestCartId, channel_key: 'marketplace', version: 1 },
      ]);
      // 2. Check cart_merges (none)
      mockSql.unsafe.mockResolvedValueOnce([]);
      // 3. Insert cart_merges receipt
      mockSql.unsafe.mockResolvedValueOnce([{ id: 'merge-receipt-1' }]);
      // 4. Find or create user cart
      mockSql.unsafe.mockResolvedValueOnce([
        { id: userCartId, channel_key: 'marketplace', version: 1 },
      ]);
      // 5. Load guest items (Variant A: qty 10)
      mockSql.unsafe.mockResolvedValueOnce([
        { variant_id: variantA, quantity: 10, unit_price_cents: 1000 },
      ]);
      // 6. Check existing user items for Variant A (already has 5)
      mockSql.unsafe.mockResolvedValueOnce([
        { id: 'user-item-1', variant_id: variantA, quantity: 5 },
      ]);
      // 7. Update user item (5 + 10 = 15)
      mockSql.unsafe.mockResolvedValueOnce([]);
      // 8. Delete guest cart items
      mockSql.unsafe.mockResolvedValueOnce([]);
      // 9. Update cart_merges receipt
      mockSql.unsafe.mockResolvedValueOnce([]);
      // 10. Update user cart version
      mockSql.unsafe.mockResolvedValueOnce([{ version: 2 }]);
      // 11. Fetch full user cart items for DTO
      mockSql.unsafe.mockResolvedValueOnce([
        {
          variant_id: variantA,
          quantity: 15,
          title: 'Product A',
          price_cents: 1000,
          variant_status: 'active',
          product_status: 'active',
          on_hand: 50,
          reserved: 0,
        },
      ]);

      const service = new CartService(
        mockSql as unknown as Sql,
        mockCache as unknown as RedisCacheService,
        tokenService,
      );

      const result = await service.mergeGuestCart(userOwner, validToken, 'marketplace');

      expect(result.mergedCart.items).toHaveLength(1);
      expect(result.mergedCart.items[0]?.qty).toBe(15);
      expect(result.mergedCart.totalCents).toBe('15000'); // 15 * 1000

      // Cache invalidation & snapshot verification
      expect(mockCache.invalidate).toHaveBeenCalledWith(`cart:marketplace:${guestId}`);
      expect(mockCache.set).toHaveBeenCalledWith(
        `cart:marketplace:${userOwner.id}`,
        expect.objectContaining({ totalCents: '15000' }),
        expect.any(Number),
      );
    });

    it('caps merged quantity at 99 when combined quantity exceeds 99 (60 + 50 = 99)', async () => {
      const validToken = tokenService.mintToken(guestId);

      // 1. Find guest cart
      mockSql.unsafe.mockResolvedValueOnce([
        { id: guestCartId, channel_key: 'marketplace', version: 1 },
      ]);
      // 2. Check cart_merges (none)
      mockSql.unsafe.mockResolvedValueOnce([]);
      // 3. Insert cart_merges receipt
      mockSql.unsafe.mockResolvedValueOnce([{ id: 'merge-receipt-1' }]);
      // 4. Find or create user cart
      mockSql.unsafe.mockResolvedValueOnce([
        { id: userCartId, channel_key: 'marketplace', version: 1 },
      ]);
      // 5. Load guest items (Variant B: qty 50)
      mockSql.unsafe.mockResolvedValueOnce([
        { variant_id: variantB, quantity: 50, unit_price_cents: 2000 },
      ]);
      // 6. Check existing user items for Variant B (already has 60)
      mockSql.unsafe.mockResolvedValueOnce([
        { id: 'user-item-2', variant_id: variantB, quantity: 60 },
      ]);
      // 7. Update user item (60 + 50 = 110 -> capped at 99)
      mockSql.unsafe.mockResolvedValueOnce([]);
      // 8. Delete guest cart items
      mockSql.unsafe.mockResolvedValueOnce([]);
      // 9. Update cart_merges receipt
      mockSql.unsafe.mockResolvedValueOnce([]);
      // 10. Update user cart version
      mockSql.unsafe.mockResolvedValueOnce([{ version: 2 }]);
      // 11. Fetch full user cart items for DTO
      mockSql.unsafe.mockResolvedValueOnce([
        {
          variant_id: variantB,
          quantity: 99,
          title: 'Product B',
          price_cents: 2000,
          variant_status: 'active',
          product_status: 'active',
          on_hand: 200,
          reserved: 0,
        },
      ]);

      const service = new CartService(
        mockSql as unknown as Sql,
        mockCache as unknown as RedisCacheService,
        tokenService,
      );

      const result = await service.mergeGuestCart(userOwner, validToken, 'marketplace');

      expect(result.mergedCart.items[0]?.qty).toBe(99);
      expect(result.mergedCart.totalCents).toBe('198000'); // 99 * 2000
    });
  });
});
