// @shopscale/api/commerce.controller.test - Unit tests for CommerceController (T045, T047).

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import {
  AddressNotFoundError,
  IdempotencyConflictError,
  InsufficientStockError,
  InvalidQuoteTokenError,
  PriceChangedError,
  checkoutService,
  quoteService,
} from '@shopscale/backend';
import type { Actor } from '@shopscale/backend';
import { CommerceController } from './commerce.controller.js';

vi.mock('@shopscale/backend', () => ({
  quoteService: {
    calculateQuote: vi.fn(),
  },
  checkoutService: {
    initiateCheckout: vi.fn(),
  },
  PriceChangedError: class PriceChangedError extends Error {
    constructor(
      public readonly variantId: string,
      public readonly expectedPriceCents: number,
      public readonly currentPriceCents: number,
    ) {
      super(`Price has changed for variant ${variantId}`);
      this.name = 'PriceChangedError';
    }
  },
  InvalidCouponError: class InvalidCouponError extends Error {
    public readonly code: string;
    constructor(public readonly couponCode: string) {
      super(`Invalid coupon code: "${couponCode}"`);
      this.name = 'InvalidCouponError';
      this.code = couponCode;
    }
  },
  QuoteValidationError: class QuoteValidationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'QuoteValidationError';
    }
  },
  MissingIdempotencyKeyError: class MissingIdempotencyKeyError extends Error {
    constructor() {
      super('Missing required Idempotency-Key header');
      this.name = 'MissingIdempotencyKeyError';
    }
  },
  IdempotencyConflictError: class IdempotencyConflictError extends Error {
    constructor(message = 'Idempotency conflict') {
      super(message);
      this.name = 'IdempotencyConflictError';
    }
  },
  InsufficientStockError: class InsufficientStockError extends Error {
    constructor(
      public readonly variantId: string,
      public readonly available: number,
    ) {
      super(`Insufficient stock for variant ${variantId}`);
      this.name = 'InsufficientStockError';
    }
  },
  InvalidQuoteTokenError: class InvalidQuoteTokenError extends Error {
    constructor(message = 'Invalid quote token') {
      super(message);
      this.name = 'InvalidQuoteTokenError';
    }
  },
  AddressNotFoundError: class AddressNotFoundError extends Error {
    constructor(public readonly addressId: string) {
      super(`Address ${addressId} not found`);
      this.name = 'AddressNotFoundError';
    }
  },
}));

describe('CommerceController (T045, T047)', () => {
  let controller: CommerceController;
  const validVariantId = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
  const validAddressId = '11111111-2222-4333-8444-555555555555';
  const validUserId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const validIdempotencyKey = 'ffffffff-0000-4111-8222-333333333333';
  const mockActor = { userId: validUserId, role: 'customer' } as unknown as Actor;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new CommerceController();
  });

  describe('calculateQuote (T045)', () => {
    it('rejects invalid payload with 400 BadRequestException', async () => {
      await expect(controller.calculateQuote({ invalid: 'payload' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('returns quote response on successful calculation', async () => {
      const mockResponse = {
        quoteToken: 'mock.hmac.token',
        expiresAt: new Date(Date.now() + 900_000).toISOString(),
        currency: 'USD' as const,
        subtotalCents: '5000',
        shippingCents: '500',
        discountCents: '0',
        totalCents: '5500',
        couponCode: null,
        sellers: [],
      };

      vi.mocked(quoteService.calculateQuote).mockResolvedValueOnce(mockResponse);

      const result = await controller.calculateQuote({
        channelKey: 'marketplace',
        items: [{ variantId: validVariantId, qty: 1 }],
      });

      expect(result).toEqual(mockResponse);
    });

    it('translates PriceChangedError to 409 ConflictException', async () => {
      vi.mocked(quoteService.calculateQuote).mockRejectedValueOnce(
        new PriceChangedError(validVariantId, 2500, 3000),
      );

      try {
        await controller.calculateQuote({
          channelKey: 'marketplace',
          items: [{ variantId: validVariantId, qty: 1, expectedUnitPriceCents: '2500' }],
        });
        expect.fail('Should have thrown ConflictException');
      } catch (err) {
        expect(err).toBeInstanceOf(ConflictException);
        const res = (err as ConflictException).getResponse() as Record<string, unknown>;
        expect(res['error']).toBe('PRICE_CHANGED');
        expect(res['variantId']).toBe(validVariantId);
      }
    });
  });

  describe('initiateCheckout (T047)', () => {
    const validBody = {
      channelKey: 'marketplace',
      addressId: validAddressId,
      acceptedQuoteToken: 'valid.quote.jwt',
    };

    it('throws 401 UnauthorizedException if actor is missing', async () => {
      await expect(
        controller.initiateCheckout(
          { headers: { 'idempotency-key': validIdempotencyKey } },
          validBody,
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws 400 BadRequestException if Idempotency-Key header is missing', async () => {
      await expect(
        controller.initiateCheckout(
          { actor: mockActor, headers: {} },
          validBody,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws 400 BadRequestException on invalid request body', async () => {
      await expect(
        controller.initiateCheckout(
          {
            actor: mockActor,
            headers: { 'idempotency-key': validIdempotencyKey },
          },
          { invalid: 'body' },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('calls checkoutService and returns 201 response on success', async () => {
      const mockAccepted = {
        orderId: 'order-123',
        status: 'PENDING' as const,
        paymentEffectKey: 'pay_eff_xyz',
        totalCents: '5500',
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      };

      vi.mocked(checkoutService.initiateCheckout).mockResolvedValueOnce(mockAccepted);

      const result = await controller.initiateCheckout(
        {
          actor: mockActor,
          headers: { 'idempotency-key': validIdempotencyKey },
        },
        validBody,
      );

      expect(result).toEqual(mockAccepted);
      expect(checkoutService.initiateCheckout).toHaveBeenCalledWith({
        ...validBody,
        userId: validUserId,
        idempotencyKey: validIdempotencyKey,
      });
    });

    it('translates IdempotencyConflictError to 409 ConflictException', async () => {
      vi.mocked(checkoutService.initiateCheckout).mockRejectedValueOnce(
        new IdempotencyConflictError('Key reused with different payload'),
      );

      await expect(
        controller.initiateCheckout(
          {
            actor: mockActor,
            headers: { 'idempotency-key': validIdempotencyKey },
          },
          validBody,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('translates InsufficientStockError to 409 ConflictException with variantId and available', async () => {
      vi.mocked(checkoutService.initiateCheckout).mockRejectedValueOnce(
        new InsufficientStockError(validVariantId, 0),
      );

      try {
        await controller.initiateCheckout(
          {
            actor: mockActor,
            headers: { 'idempotency-key': validIdempotencyKey },
          },
          validBody,
        );
        expect.fail('Should have thrown ConflictException');
      } catch (err) {
        expect(err).toBeInstanceOf(ConflictException);
        const res = (err as ConflictException).getResponse() as Record<string, unknown>;
        expect(res['error']).toBe('INSUFFICIENT_STOCK');
        expect(res['variantId']).toBe(validVariantId);
        expect(res['available']).toBe(0);
      }
    });

    it('translates InvalidQuoteTokenError to 401 UnauthorizedException', async () => {
      vi.mocked(checkoutService.initiateCheckout).mockRejectedValueOnce(
        new InvalidQuoteTokenError('Token has expired'),
      );

      await expect(
        controller.initiateCheckout(
          {
            actor: mockActor,
            headers: { 'idempotency-key': validIdempotencyKey },
          },
          validBody,
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('translates AddressNotFoundError to 400 BadRequestException', async () => {
      vi.mocked(checkoutService.initiateCheckout).mockRejectedValueOnce(
        new AddressNotFoundError(validAddressId),
      );

      try {
        await controller.initiateCheckout(
          {
            actor: mockActor,
            headers: { 'idempotency-key': validIdempotencyKey },
          },
          validBody,
        );
        expect.fail('Should have thrown BadRequestException');
      } catch (err) {
        expect(err).toBeInstanceOf(BadRequestException);
        const res = (err as BadRequestException).getResponse() as Record<string, unknown>;
        expect(res['error']).toBe('ADDRESS_NOT_FOUND');
        expect(res['addressId']).toBe(validAddressId);
      }
    });
  });
});
