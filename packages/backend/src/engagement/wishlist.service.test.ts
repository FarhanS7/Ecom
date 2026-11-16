// packages/backend/src/engagement/wishlist.service.test.ts - Unit tests for WishlistService (REQ-ENG-001 / T065).

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Sql } from 'postgres';
import { WishlistService, type WishlistDbRow } from './wishlist.service.js';
import { ProductNotFoundError } from './errors.js';

vi.mock('../platform/storage.service.js', () => ({
  storageService: {
    getPublicUrl: (key: string) => `https://cdn.example.com/${key}`,
  },
}));

function createSql(mock: unknown): Sql {
  return mock as unknown as Sql;
}

describe('WishlistService (T065 Unit Tests)', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const productId = '22222222-2222-4222-8222-222222222222';

  const baseWishlistDbRow: WishlistDbRow = {
    user_id: userId,
    product_id: productId,
    created_at: new Date('2026-11-16T12:00:00Z'),
    title: 'Minimalist Mechanical Keyboard',
    slug: 'minimalist-mechanical-keyboard',
    description: 'Custom lubed switches with PBT keycaps',
    price_cents: 14900,
    currency: 'USD',
    product_status: 'active',
    store_name: 'Keyboards Co',
    store_slug: 'keyboards-co',
    store_status: 'active',
    primary_variant_id: '33333333-3333-4333-8333-333333333333',
    object_key: 'stores/keyboards/products/kb-1.jpg',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('addToWishlist', () => {
    it('throws ProductNotFoundError if target product does not exist', async () => {
      const mockSql = vi.fn().mockImplementation((strings: TemplateStringsArray) => {
        const query = strings.join('').replace(/\s+/g, ' ');
        if (query.includes('SELECT id FROM products')) {
          return Promise.resolve([]); // Product not found
        }
        return Promise.resolve([]);
      });

      const service = new WishlistService(createSql(mockSql));

      await expect(service.addToWishlist(userId, productId)).rejects.toThrow(
        ProductNotFoundError,
      );
    });

    it('inserts item into wishlists table and returns added: true', async () => {
      const mockSql = vi.fn().mockImplementation((strings: TemplateStringsArray) => {
        const query = strings.join('').replace(/\s+/g, ' ');
        if (query.includes('SELECT id FROM products')) {
          return Promise.resolve([{ id: productId }]);
        }
        if (query.includes('INSERT INTO wishlists')) {
          return Promise.resolve([{ user_id: userId }]);
        }
        return Promise.resolve([]);
      });

      const service = new WishlistService(createSql(mockSql));
      const result = await service.addToWishlist(userId, productId);

      expect(result).toEqual({ ok: true, added: true });
    });

    it('handles idempotent duplicate insert returning added: false', async () => {
      const mockSql = vi.fn().mockImplementation((strings: TemplateStringsArray) => {
        const query = strings.join('').replace(/\s+/g, ' ');
        if (query.includes('SELECT id FROM products')) {
          return Promise.resolve([{ id: productId }]);
        }
        if (query.includes('INSERT INTO wishlists')) {
          return Promise.resolve([]); // Conflict occurred, no rows returned
        }
        return Promise.resolve([]);
      });

      const service = new WishlistService(createSql(mockSql));
      const result = await service.addToWishlist(userId, productId);

      expect(result).toEqual({ ok: true, added: false });
    });
  });

  describe('removeFromWishlist', () => {
    it('deletes item from wishlists table', async () => {
      const mockSql = vi.fn().mockImplementation((strings: TemplateStringsArray) => {
        const query = strings.join('').replace(/\s+/g, ' ');
        if (query.includes('DELETE FROM wishlists')) {
          return Promise.resolve([{ user_id: userId }]);
        }
        return Promise.resolve([]);
      });

      const service = new WishlistService(createSql(mockSql));
      const result = await service.removeFromWishlist(userId, productId);

      expect(result).toEqual({ ok: true, removed: true });
    });
  });

  describe('isInWishlist', () => {
    it('returns true when row exists', async () => {
      const mockSql = vi.fn().mockImplementation((strings: TemplateStringsArray) => {
        const query = strings.join('').replace(/\s+/g, ' ');
        if (query.includes('SELECT 1 FROM wishlists')) {
          return Promise.resolve([{ '?column?': 1 }]);
        }
        return Promise.resolve([]);
      });

      const service = new WishlistService(createSql(mockSql));
      const inWishlist = await service.isInWishlist(userId, productId);

      expect(inWishlist).toBe(true);
    });

    it('returns false when row does not exist', async () => {
      const mockSql = vi.fn().mockImplementation((strings: TemplateStringsArray) => {
        const query = strings.join('').replace(/\s+/g, ' ');
        if (query.includes('SELECT 1 FROM wishlists')) {
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      });

      const service = new WishlistService(createSql(mockSql));
      const inWishlist = await service.isInWishlist(userId, productId);

      expect(inWishlist).toBe(false);
    });
  });

  describe('getWishlist', () => {
    it('returns wishlist items with formatted image url, primary variant, and available flag', async () => {
      const mockSql = vi.fn().mockImplementation((strings: TemplateStringsArray) => {
        const query = strings.join('').replace(/\s+/g, ' ');
        if (query.includes('FROM wishlists w')) {
          return Promise.resolve([baseWishlistDbRow]);
        }
        return Promise.resolve([]);
      });

      const service = new WishlistService(createSql(mockSql));
      const result = await service.getWishlist(userId);

      expect(result.count).toBe(1);
      expect(result.items[0]).toEqual({
        productId,
        title: 'Minimalist Mechanical Keyboard',
        slug: 'minimalist-mechanical-keyboard',
        description: 'Custom lubed switches with PBT keycaps',
        priceCents: 14900,
        currency: 'USD',
        imageUrl: 'https://cdn.example.com/stores/keyboards/products/kb-1.jpg',
        available: true,
        status: 'active',
        storeName: 'Keyboards Co',
        storeSlug: 'keyboards-co',
        primaryVariantId: '33333333-3333-4333-8333-333333333333',
        addedAt: '2026-11-16T12:00:00.000Z',
      });
    });

    it('marks item as unavailable if product is archived', async () => {
      const mockSql = vi.fn().mockImplementation((strings: TemplateStringsArray) => {
        const query = strings.join('').replace(/\s+/g, ' ');
        if (query.includes('FROM wishlists w')) {
          return Promise.resolve([
            {
              ...baseWishlistDbRow,
              product_status: 'archived',
            },
          ]);
        }
        return Promise.resolve([]);
      });

      const service = new WishlistService(createSql(mockSql));
      const result = await service.getWishlist(userId);

      expect(result.items[0]?.available).toBe(false);
      expect(result.items[0]?.status).toBe('unavailable');
    });
  });
});
