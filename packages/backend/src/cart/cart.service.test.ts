// @shopscale/backend/cart/cart.service.test - Unit tests for CartService (T041).
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Sql } from 'postgres';
import { CartService } from './cart.service.js';
import type { CartOwner } from './cart.service.js';
import {
  CartValidationError,
  StoreMismatchError,
  VariantNotFoundError,
} from './errors.js';
import type { RedisCacheService } from '../platform/cache.service.js';

interface MockSql {
  begin: (cb: (tx: Sql) => Promise<unknown>) => Promise<unknown>;
  unsafe: ReturnType<typeof vi.fn>;
}

describe('CartService (T041 Unit Tests)', () => {
  const storeId1 = '00000000-0000-4000-8000-000000000001';
  const storeId2 = '00000000-0000-4000-8000-000000000002';
  const variantId1 = '00000000-0000-4000-8000-000000000011';
  const variantId2 = '00000000-0000-4000-8000-000000000012';
  const userOwner: CartOwner = { kind: 'user', id: '11111111-1111-4000-8000-111111111111' };
  const guestOwner: CartOwner = { kind: 'guest', id: 'guest-session-abc' };

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

    // Generic mock query helper
    mockSql = {
      begin: vi.fn(async (cb: (tx: Sql) => Promise<unknown>) => cb(mockSql as unknown as Sql)),
      unsafe: vi.fn(),
    };
  });

  describe('Cache key formatting', () => {
    it('formats cache key as cart:{channelKey}:{ownerId}', () => {
      const service = new CartService(mockSql as unknown as Sql, mockCache as unknown as RedisCacheService);
      expect(service.getCacheKey('marketplace', userOwner)).toBe(`cart:marketplace:${userOwner.id}`);
      expect(service.getCacheKey(storeId1, guestOwner)).toBe(`cart:${storeId1}:${guestOwner.id}`);
    });
  });

  describe('Quantity bounding & validation', () => {
    it('rejects adding quantity <= 0 with CartValidationError', async () => {
      const service = new CartService(mockSql as unknown as Sql, mockCache as unknown as RedisCacheService);
      await expect(
        service.addItem(userOwner, 'marketplace', { variantId: variantId1, quantity: 0 }),
      ).rejects.toThrow(CartValidationError);

      await expect(
        service.addItem(userOwner, 'marketplace', { variantId: variantId1, quantity: -5 }),
      ).rejects.toThrow(CartValidationError);
    });

    it('rejects adding quantity > 99 with CartValidationError', async () => {
      const service = new CartService(mockSql as unknown as Sql, mockCache as unknown as RedisCacheService);
      await expect(
        service.addItem(userOwner, 'marketplace', { variantId: variantId1, quantity: 100 }),
      ).rejects.toThrow(CartValidationError);
    });

    it('rejects updating quantity > 99 with CartValidationError', async () => {
      const service = new CartService(mockSql as unknown as Sql, mockCache as unknown as RedisCacheService);
      await expect(
        service.updateItem(userOwner, 'marketplace', variantId1, 100),
      ).rejects.toThrow(CartValidationError);
    });

    it('rejects updating quantity < 0 with CartValidationError', async () => {
      const service = new CartService(mockSql as unknown as Sql, mockCache as unknown as RedisCacheService);
      await expect(
        service.updateItem(userOwner, 'marketplace', variantId1, -1),
      ).rejects.toThrow(CartValidationError);
    });
  });

  describe('Variant existence and store channel compatibility', () => {
    it('throws VariantNotFoundError when variant does not exist', async () => {
      mockSql.unsafe.mockResolvedValueOnce([]); // Variant lookup returns empty
      const service = new CartService(mockSql as unknown as Sql, mockCache as unknown as RedisCacheService);

      await expect(
        service.addItem(userOwner, 'marketplace', { variantId: variantId1, quantity: 1 }),
      ).rejects.toThrow(VariantNotFoundError);
    });

    it('throws StoreMismatchError when adding foreign store variant to a store channel cart', async () => {
      // Variant belongs to storeId2
      mockSql.unsafe.mockResolvedValueOnce([
        {
          id: variantId1,
          store_id: storeId2,
          price_cents: 1500,
          status: 'active',
          product_status: 'active',
        },
      ]);

      const service = new CartService(mockSql as unknown as Sql, mockCache as unknown as RedisCacheService);

      // Attempting to add to storeId1 cart
      await expect(
        service.addItem(userOwner, storeId1, { variantId: variantId1, quantity: 1 }),
      ).rejects.toThrow(StoreMismatchError);
    });

    it('allows adding variant from storeId1 to storeId1 channel cart', async () => {
      const cartId = 'cart-uuid-1';
      // 1. Variant lookup
      mockSql.unsafe.mockResolvedValueOnce([
        {
          id: variantId1,
          store_id: storeId1,
          price_cents: 2000,
          status: 'active',
          product_status: 'active',
        },
      ]);
      // 2. Cart lookup/insert
      mockSql.unsafe.mockResolvedValueOnce([{ id: cartId, channel_key: storeId1, version: 1 }]);
      // 3. Existing item check (none)
      mockSql.unsafe.mockResolvedValueOnce([]);
      // 4. Insert item
      mockSql.unsafe.mockResolvedValueOnce([{ id: 'item-1' }]);
      // 5. Update cart version
      mockSql.unsafe.mockResolvedValueOnce([{ version: 2 }]);
      // 6. Query full cart items
      mockSql.unsafe.mockResolvedValueOnce([
        {
          variant_id: variantId1,
          quantity: 2,
          title: 'Wireless Headphones',
          price_cents: 2000,
          variant_status: 'active',
          product_status: 'active',
          on_hand: 10,
          reserved: 0,
        },
      ]);

      const service = new CartService(mockSql as unknown as Sql, mockCache as unknown as RedisCacheService);
      const res = await service.addItem(userOwner, storeId1, { variantId: variantId1, quantity: 2 });

      expect(res.channelKey).toBe(storeId1);
      expect(res.items).toHaveLength(1);
      expect(res.items[0]).toEqual({
        variantId: variantId1,
        qty: 2,
        title: 'Wireless Headphones',
        priceCents: '2000',
        available: true,
      });
      expect(res.totalCents).toBe('4000');
      expect(res.version).toBe(2);

      // Verify Redis snapshot update
      expect(mockCache.set).toHaveBeenCalledWith(
        `cart:${storeId1}:${userOwner.id}`,
        expect.objectContaining({ totalCents: '4000' }),
        2592000,
      );
    });
  });

  describe('Item deduplication & quantity capping', () => {
    it('increments quantity when variant is added again', async () => {
      const cartId = 'cart-uuid-1';
      // 1. Variant lookup
      mockSql.unsafe.mockResolvedValueOnce([
        {
          id: variantId1,
          store_id: storeId1,
          price_cents: 1000,
          status: 'active',
          product_status: 'active',
        },
      ]);
      // 2. Cart lookup
      mockSql.unsafe.mockResolvedValueOnce([{ id: cartId, channel_key: 'marketplace', version: 1 }]);
      // 3. Existing item check (already has 3)
      mockSql.unsafe.mockResolvedValueOnce([{ id: 'item-1', quantity: 3 }]);
      // 4. Update item quantity (3 + 2 = 5)
      mockSql.unsafe.mockResolvedValueOnce([{ id: 'item-1', quantity: 5 }]);
      // 5. Update cart version
      mockSql.unsafe.mockResolvedValueOnce([{ version: 2 }]);
      // 6. Query full cart items
      mockSql.unsafe.mockResolvedValueOnce([
        {
          variant_id: variantId1,
          quantity: 5,
          title: 'Mechanical Keyboard',
          price_cents: 1000,
          variant_status: 'active',
          product_status: 'active',
          on_hand: 20,
          reserved: 2,
        },
      ]);

      const service = new CartService(mockSql as unknown as Sql, mockCache as unknown as RedisCacheService);
      const res = await service.addItem(userOwner, 'marketplace', { variantId: variantId1, quantity: 2 });

      expect(res.items[0]?.qty).toBe(5);
      expect(res.totalCents).toBe('5000');
    });

    it('rejects adding when combined quantity would exceed 99', async () => {
      const cartId = 'cart-uuid-1';
      mockSql.unsafe.mockResolvedValueOnce([
        {
          id: variantId1,
          store_id: storeId1,
          price_cents: 1000,
          status: 'active',
          product_status: 'active',
        },
      ]);
      mockSql.unsafe.mockResolvedValueOnce([{ id: cartId, channel_key: 'marketplace', version: 1 }]);
      mockSql.unsafe.mockResolvedValueOnce([{ id: 'item-1', quantity: 95 }]);

      const service = new CartService(mockSql as unknown as Sql, mockCache as unknown as RedisCacheService);
      await expect(
        service.addItem(userOwner, 'marketplace', { variantId: variantId1, quantity: 5 }), // 95 + 5 = 100 > 99
      ).rejects.toThrow(CartValidationError);
    });
  });

  describe('Live dynamic price computation', () => {
    it('computes totals using live variant prices instead of stale insertion prices', async () => {
      const cartId = 'cart-uuid-1';
      // Load cart items where DB has updated price_cents = 2500 (was originally added at 2000)
      mockSql.unsafe.mockResolvedValueOnce([{ id: cartId, channel_key: 'marketplace', version: 3 }]);
      mockSql.unsafe.mockResolvedValueOnce([
        {
          variant_id: variantId1,
          quantity: 2,
          title: 'Product 1',
          price_cents: 2500, // live price
          variant_status: 'active',
          product_status: 'active',
          on_hand: 10,
          reserved: 0,
        },
        {
          variant_id: variantId2,
          quantity: 1,
          title: 'Product 2',
          price_cents: 1000, // live price
          variant_status: 'active',
          product_status: 'active',
          on_hand: 5,
          reserved: 1,
        },
      ]);

      const service = new CartService(mockSql as unknown as Sql, mockCache as unknown as RedisCacheService);
      const res = await service.getCart(userOwner, 'marketplace', { forceFresh: true });

      // Total = (2500 * 2) + (1000 * 1) = 6000 cents
      expect(res.totalCents).toBe('6000');
      expect(res.items).toHaveLength(2);
      expect(res.items[0]?.priceCents).toBe('2500');
      expect(res.items[1]?.priceCents).toBe('1000');
    });
  });

  describe('Redis cache interaction & recovery', () => {
    it('returns cached cart from Redis on hit', async () => {
      const cachedCart = {
        id: 'cart-1',
        channelKey: 'marketplace',
        items: [],
        totalCents: '0',
        version: 1,
      };
      mockCache.get.mockResolvedValueOnce(cachedCart);

      const service = new CartService(mockSql as unknown as Sql, mockCache as unknown as RedisCacheService);
      const res = await service.getCart(userOwner, 'marketplace');

      expect(res).toEqual(cachedCart);
      expect(mockSql.unsafe).not.toHaveBeenCalled();
    });

    it('queries PostgreSQL and re-populates Redis on cache miss', async () => {
      mockCache.get.mockResolvedValueOnce(null); // Cache miss
      mockSql.unsafe.mockResolvedValueOnce([{ id: 'cart-1', channel_key: 'marketplace', version: 1 }]);
      mockSql.unsafe.mockResolvedValueOnce([]); // No items

      const service = new CartService(mockSql as unknown as Sql, mockCache as unknown as RedisCacheService);
      const res = await service.getCart(userOwner, 'marketplace');

      expect(res.id).toBe('cart-1');
      expect(mockSql.unsafe).toHaveBeenCalled();
      expect(mockCache.set).toHaveBeenCalledWith(
        `cart:marketplace:${userOwner.id}`,
        expect.objectContaining({ id: 'cart-1' }),
        2592000,
      );
    });
  });
});
