// @shopscale/api/cart.controller.test - Unit & controller tests for CartController (T041).
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { CartController, resolveCartOwner } from './cart.controller.js';
import {
  cartService,
  CartAlreadyMergedError,
  StoreMismatchError,
  TamperedTokenError,
  VariantNotFoundError,
} from '@shopscale/backend';

vi.mock('@shopscale/backend', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@shopscale/backend')>();
  return {
    ...actual,
    cartService: {
      getCart: vi.fn(),
      addItem: vi.fn(),
      updateItem: vi.fn(),
      removeItem: vi.fn(),
      clearCart: vi.fn(),
      mergeGuestCart: vi.fn(),
    },
    resolveActor: vi.fn(),
  };
});

describe('CartController (T041 Controller Tests)', () => {
  const variantId = '00000000-0000-4000-8000-000000000001';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('resolveCartOwner', () => {
    it('resolves authenticated user from req.actor', async () => {
      const req = { actor: { userId: 'user-123', familyId: 'fam-1', roles: [] } };
      const owner = await resolveCartOwner(req);
      expect(owner).toEqual({ kind: 'user', id: 'user-123' });
    });

    it('resolves guest from x-guest-id header', async () => {
      const req = { headers: { 'x-guest-id': 'guest-456' } };
      const owner = await resolveCartOwner(req);
      expect(owner).toEqual({ kind: 'guest', id: 'guest-456' });
    });

    it('resolves guest from cart_guest_token cookie', async () => {
      const req = { headers: { cookie: 'cart_guest_token=cookie-guest-789' } };
      const owner = await resolveCartOwner(req);
      expect(owner).toEqual({ kind: 'guest', id: 'cookie-guest-789' });
    });

    it('mints new guest UUID and sets cookie when no credentials are provided', async () => {
      const req = { headers: {} };
      const res = { header: vi.fn() };
      const owner = await resolveCartOwner(req, res);

      expect(owner.kind).toBe('guest');
      expect(owner.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(res.header).toHaveBeenCalledWith(
        'Set-Cookie',
        expect.stringContaining(`cart_guest_token=${owner.id}`),
      );
    });
  });

  describe('CartController endpoints', () => {
    const controller = new CartController();
    const mockReq = { headers: { 'x-guest-id': 'guest-1' } };
    const mockRes = { header: vi.fn() };

    it('GET /carts/:channelKey returns cart', async () => {
      const mockCart = {
        id: 'cart-1',
        channelKey: 'marketplace',
        items: [],
        totalCents: '0',
        version: 1,
      };
      vi.mocked(cartService.getCart).mockResolvedValueOnce(mockCart);

      const result = await controller.getCart('marketplace', mockReq, mockRes);
      expect(result).toEqual(mockCart);
      expect(cartService.getCart).toHaveBeenCalledWith(
        { kind: 'guest', id: 'guest-1' },
        'marketplace',
      );
    });

    it('POST /carts/:channelKey/items validates input and adds item', async () => {
      const mockCart = {
        id: 'cart-1',
        channelKey: 'marketplace',
        items: [{ variantId, qty: 2, title: 'Item', priceCents: '1000', available: true }],
        totalCents: '2000',
        version: 2,
      };
      vi.mocked(cartService.addItem).mockResolvedValueOnce(mockCart);

      const result = await controller.addItem(
        'marketplace',
        { variantId, quantity: 2 },
        mockReq,
        mockRes,
      );

      expect(result).toEqual(mockCart);
      expect(cartService.addItem).toHaveBeenCalledWith(
        { kind: 'guest', id: 'guest-1' },
        'marketplace',
        { variantId, quantity: 2 },
      );
    });

    it('POST /carts/:channelKey/items throws 400 when quantity > 99', async () => {
      await expect(
        controller.addItem('marketplace', { variantId, quantity: 150 }, mockReq, mockRes),
      ).rejects.toThrow(BadRequestException);
    });

    it('POST /carts/:channelKey/items maps StoreMismatchError to 400 Bad Request', async () => {
      vi.mocked(cartService.addItem).mockRejectedValueOnce(
        new StoreMismatchError('Product variant does not belong to this store'),
      );

      await expect(
        controller.addItem('marketplace', { variantId, quantity: 1 }, mockReq, mockRes),
      ).rejects.toThrow(BadRequestException);
    });

    it('POST /carts/:channelKey/items maps VariantNotFoundError to 404 Not Found', async () => {
      vi.mocked(cartService.addItem).mockRejectedValueOnce(
        new VariantNotFoundError('Product variant not found'),
      );

      await expect(
        controller.addItem('marketplace', { variantId, quantity: 1 }, mockReq, mockRes),
      ).rejects.toThrow(NotFoundException);
    });

    it('PATCH /carts/:channelKey/items/:variantId updates item quantity', async () => {
      const mockCart = {
        id: 'cart-1',
        channelKey: 'marketplace',
        items: [{ variantId, qty: 5, title: 'Item', priceCents: '1000', available: true }],
        totalCents: '5000',
        version: 3,
      };
      vi.mocked(cartService.updateItem).mockResolvedValueOnce(mockCart);

      const result = await controller.updateItem(
        'marketplace',
        variantId,
        { quantity: 5 },
        mockReq,
        mockRes,
      );

      expect(result).toEqual(mockCart);
      expect(cartService.updateItem).toHaveBeenCalledWith(
        { kind: 'guest', id: 'guest-1' },
        'marketplace',
        variantId,
        5,
      );
    });

    it('DELETE /carts/:channelKey/items/:variantId removes item', async () => {
      const mockCart = {
        id: 'cart-1',
        channelKey: 'marketplace',
        items: [],
        totalCents: '0',
        version: 4,
      };
      vi.mocked(cartService.removeItem).mockResolvedValueOnce(mockCart);

      const result = await controller.removeItem('marketplace', variantId, mockReq, mockRes);
      expect(result).toEqual(mockCart);
      expect(cartService.removeItem).toHaveBeenCalledWith(
        { kind: 'guest', id: 'guest-1' },
        'marketplace',
        variantId,
      );
    });

    it('DELETE /carts/:channelKey clears cart', async () => {
      const mockCart = {
        id: 'cart-1',
        channelKey: 'marketplace',
        items: [],
        totalCents: '0',
        version: 5,
      };
      vi.mocked(cartService.clearCart).mockResolvedValueOnce(mockCart);

      const result = await controller.clearCart('marketplace', mockReq, mockRes);
      expect(result).toEqual(mockCart);
      expect(cartService.clearCart).toHaveBeenCalledWith(
        { kind: 'guest', id: 'guest-1' },
        'marketplace',
      );
    });

    describe('POST /carts/:channelKey/merge', () => {
      const authUserReq = {
        actor: { userId: 'user-789', familyId: 'fam-1', roles: [] },
        headers: {},
      };

      it('rejects unauthenticated caller with 401 Unauthorized', async () => {
        const unauthReq = { headers: {} };
        await expect(
          controller.mergeCart('marketplace', { guestToken: 'tok-1' }, unauthReq, mockRes),
        ).rejects.toThrow(UnauthorizedException);
      });

      it('merges guest cart and returns mergedCart with cleared guest cookie', async () => {
        const mergedCart = {
          id: 'user-cart-1',
          channelKey: 'marketplace',
          items: [{ variantId, qty: 5, title: 'Item', priceCents: '1000', available: true }],
          totalCents: '5000',
          version: 2,
        };
        vi.mocked(cartService.mergeGuestCart).mockResolvedValueOnce({ mergedCart });

        const result = await controller.mergeCart(
          'marketplace',
          { guestToken: 'valid-guest-token' },
          authUserReq,
          mockRes,
        );

        expect(result).toEqual({ mergedCart });
        expect(cartService.mergeGuestCart).toHaveBeenCalledWith(
          { kind: 'user', id: 'user-789' },
          'valid-guest-token',
          'marketplace',
        );
        expect(mockRes.header).toHaveBeenCalledWith(
          'Set-Cookie',
          expect.stringContaining('Max-Age=0'),
        );
      });

      it('rejects tampered guest token signature with 401 Unauthorized', async () => {
        vi.mocked(cartService.mergeGuestCart).mockRejectedValueOnce(
          new TamperedTokenError('Tampered or invalid guest token signature'),
        );

        await expect(
          controller.mergeCart(
            'marketplace',
            { guestToken: 'tampered.sig' },
            authUserReq,
            mockRes,
          ),
        ).rejects.toThrow(UnauthorizedException);
      });

      it('rejects already-merged guest cart with 409 Conflict', async () => {
        vi.mocked(cartService.mergeGuestCart).mockRejectedValueOnce(
          new CartAlreadyMergedError('Guest cart has already been merged'),
        );

        await expect(
          controller.mergeCart(
            'marketplace',
            { guestToken: 'already-merged.sig' },
            authUserReq,
            mockRes,
          ),
        ).rejects.toThrow(ConflictException);
      });
    });
  });
});
