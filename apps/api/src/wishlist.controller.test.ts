// @shopscale/api/wishlist.controller.test - Unit tests for WishlistController (REQ-ENG-001 / T065).

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { WishlistController } from './wishlist.controller.js';
import { ProductNotFoundError, wishlistService } from '@shopscale/backend';

vi.mock('@shopscale/backend', () => ({
  wishlistService: {
    getWishlist: vi.fn(),
    addToWishlist: vi.fn(),
    removeFromWishlist: vi.fn(),
  },
  ProductNotFoundError: class ProductNotFoundError extends Error {
    readonly status = 404;
    readonly code = 'PRODUCT_NOT_FOUND';
  },
}));

describe('WishlistController (T065 Unit Tests)', () => {
  let controller: WishlistController;
  const userId = '11111111-1111-4111-8111-111111111111';
  const productId = '22222222-2222-4222-8222-222222222222';

  const mockWishlistResponse = {
    items: [
      {
        productId,
        title: 'Noise Cancelling Headphones',
        slug: 'noise-cancelling-headphones',
        priceCents: 19900,
        currency: 'USD',
        imageUrl: 'https://cdn.example.com/headphones.jpg',
        available: true,
        status: 'active',
        storeName: 'Audio Store',
        storeSlug: 'audio-store',
        primaryVariantId: '33333333-3333-4333-8333-333333333333',
        addedAt: '2026-11-16T12:00:00.000Z',
      },
    ],
    count: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new WishlistController();
  });

  describe('GET /v1/wishlist', () => {
    it('returns customer wishlist items for authenticated user', async () => {
      vi.mocked(wishlistService.getWishlist).mockResolvedValueOnce(mockWishlistResponse);

      const result = await controller.getWishlist({
        actor: { userId, email: 'shopper@example.com', roles: ['buyer'] },
      });

      expect(result).toEqual(mockWishlistResponse);
      expect(wishlistService.getWishlist).toHaveBeenCalledWith(userId);
    });

    it('throws UnauthorizedException when actor is missing', async () => {
      await expect(controller.getWishlist({})).rejects.toThrow(UnauthorizedException);
      expect(wishlistService.getWishlist).not.toHaveBeenCalled();
    });
  });

  describe('PUT /v1/wishlist/:productId', () => {
    it('adds product to wishlist successfully', async () => {
      vi.mocked(wishlistService.addToWishlist).mockResolvedValueOnce({
        ok: true,
        added: true,
      });

      const result = await controller.addToWishlist(productId, {
        actor: { userId, email: 'shopper@example.com', roles: ['buyer'] },
      });

      expect(result).toEqual({ ok: true, added: true });
      expect(wishlistService.addToWishlist).toHaveBeenCalledWith(userId, productId);
    });

    it('throws UnauthorizedException when actor is missing', async () => {
      await expect(controller.addToWishlist(productId, {})).rejects.toThrow(
        UnauthorizedException,
      );
      expect(wishlistService.addToWishlist).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for non-UUID product ID', async () => {
      await expect(
        controller.addToWishlist('invalid-uuid', {
          actor: { userId, email: 'shopper@example.com', roles: ['buyer'] },
        }),
      ).rejects.toThrow(NotFoundException);
      expect(wishlistService.addToWishlist).not.toHaveBeenCalled();
    });

    it('maps ProductNotFoundError to 404 NotFoundException', async () => {
      vi.mocked(wishlistService.addToWishlist).mockRejectedValueOnce(
        new ProductNotFoundError(productId),
      );

      await expect(
        controller.addToWishlist(productId, {
          actor: { userId, email: 'shopper@example.com', roles: ['buyer'] },
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('DELETE /v1/wishlist/:productId', () => {
    it('removes product from wishlist successfully', async () => {
      vi.mocked(wishlistService.removeFromWishlist).mockResolvedValueOnce({
        ok: true,
        removed: true,
      });

      const result = await controller.removeFromWishlist(productId, {
        actor: { userId, email: 'shopper@example.com', roles: ['buyer'] },
      });

      expect(result).toEqual({ ok: true, removed: true });
      expect(wishlistService.removeFromWishlist).toHaveBeenCalledWith(userId, productId);
    });

    it('throws UnauthorizedException when actor is missing', async () => {
      await expect(controller.removeFromWishlist(productId, {})).rejects.toThrow(
        UnauthorizedException,
      );
      expect(wishlistService.removeFromWishlist).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for non-UUID product ID', async () => {
      await expect(
        controller.removeFromWishlist('invalid-uuid', {
          actor: { userId, email: 'shopper@example.com', roles: ['buyer'] },
        }),
      ).rejects.toThrow(NotFoundException);
      expect(wishlistService.removeFromWishlist).not.toHaveBeenCalled();
    });
  });
});
