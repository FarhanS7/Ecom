// @shopscale/web features/checkout/checkout-flow.test.ts - Client API tests (T048).

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import * as csrfModule from '@/lib/csrf';
import {
  CheckoutApiError,
  createAddress,
  fetchAddresses,
  fetchQuote,
  submitCheckout,
} from './client';

describe('Checkout Client API Flow (T048)', () => {
  let gatewaySpy: MockInstance;

  beforeEach(() => {
    gatewaySpy = vi.spyOn(csrfModule, 'gatewayRequest');
  });

  afterEach(() => {
    gatewaySpy.mockRestore();
  });

  describe('fetchAddresses', () => {
    it('returns address array on 200 OK', async () => {
      const mockAddresses = [
        {
          id: 'addr-1',
          fields: {
            name: 'Jane Doe',
            line1: '123 Main St',
            city: 'Springfield',
            postalCode: '12345',
            country: 'US',
          },
          createdAt: '2026-01-01T00:00:00Z',
        },
      ];

      gatewaySpy.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ items: mockAddresses }),
      } as Response);

      const result = await fetchAddresses();
      expect(result).toEqual(mockAddresses);
      expect(gatewaySpy).toHaveBeenCalledWith('/api/v1/me/addresses', { method: 'GET' });
    });

    it('throws UNAUTHORIZED on 401 response', async () => {
      gatewaySpy.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({}),
      } as Response);

      await expect(fetchAddresses()).rejects.toThrow('UNAUTHORIZED');
    });

    it('throws generic error on other failures', async () => {
      gatewaySpy.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({}),
      } as Response);

      await expect(fetchAddresses()).rejects.toThrow('Failed to load saved addresses');
    });
  });

  describe('createAddress', () => {
    it('sends POST and returns created address', async () => {
      const fields = {
        name: 'John Smith',
        line1: '456 Oak Ave',
        city: 'Metropolis',
        postalCode: '67890',
        country: 'US',
      };
      const createdAddr = { id: 'addr-new', fields, createdAt: '2026-01-01T00:00:00Z' };

      gatewaySpy.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => createdAddr,
      } as Response);

      const result = await createAddress(fields);
      expect(result).toEqual(createdAddr);
      expect(gatewaySpy).toHaveBeenCalledWith('/api/v1/me/addresses', {
        method: 'POST',
        body: fields,
      });
    });

    it('throws CheckoutApiError on failure', async () => {
      gatewaySpy.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'VALIDATION_FAILED', message: 'Postal code invalid' }),
      } as Response);

      await expect(createAddress({ line1: '' })).rejects.toThrow(CheckoutApiError);
    });
  });

  describe('fetchQuote', () => {
    it('sends POST to /api/v1/checkout/quote and returns quote response', async () => {
      const mockQuote = {
        quoteToken: 'signed-quote-token-xyz',
        currency: 'USD',
        itemsSubtotalCents: 5000,
        discountCents: 500,
        shippingCents: 500,
        taxCents: 0,
        totalCents: 5000,
        sellers: [],
        expiresAt: new Date(Date.now() + 900000).toISOString(),
      };

      gatewaySpy.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockQuote,
      } as Response);

      const req = {
        channelKey: 'marketplace',
        items: [{ variantId: 'var-1', qty: 1, expectedUnitPriceCents: '5000' }],
        couponCode: 'SAVE10',
      };

      const result = await fetchQuote(req);
      expect(result).toEqual(mockQuote);
      expect(gatewaySpy).toHaveBeenCalledWith('/api/v1/checkout/quote', {
        method: 'POST',
        body: req,
      });
    });

    it('throws CheckoutApiError on PRICE_CHANGED 409', async () => {
      gatewaySpy.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          error: 'PRICE_CHANGED',
          message: 'Price changed from 5000 to 6000 cents',
          variantId: 'var-1',
          expectedPriceCents: 5000,
          currentPriceCents: 6000,
        }),
      } as Response);

      const promise = fetchQuote({
        channelKey: 'marketplace',
        items: [{ variantId: 'var-1', qty: 1, expectedUnitPriceCents: '5000' }],
      });

      await expect(promise).rejects.toThrow(CheckoutApiError);
    });
  });

  describe('submitCheckout', () => {
    it('sends POST to /api/v1/checkout with Idempotency-Key header', async () => {
      const mockAccepted = {
        orderId: '33333333-3333-4333-8333-333333333333',
        status: 'PENDING' as const,
        paymentEffectKey: 'pay_eff_xyz',
        totalCents: '5000',
        expiresAt: new Date(Date.now() + 900000).toISOString(),
      };

      gatewaySpy.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => mockAccepted,
      } as Response);

      const idempotencyKey = 'uuid-key-12345';
      const req = {
        channelKey: 'marketplace',
        addressId: 'addr-1',
        acceptedQuoteToken: 'signed-token',
      };

      const result = await submitCheckout(req, idempotencyKey);
      expect(result).toEqual(mockAccepted);
      expect(gatewaySpy).toHaveBeenCalledWith('/api/v1/checkout', {
        method: 'POST',
        body: req,
        headers: {
          'idempotency-key': idempotencyKey,
        },
      });
    });

    it('throws CheckoutApiError on INSUFFICIENT_STOCK 409', async () => {
      gatewaySpy.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          error: 'INSUFFICIENT_STOCK',
          message: 'Insufficient inventory',
          variantId: 'var-1',
          available: 0,
        }),
      } as Response);

      const promise = submitCheckout(
        { channelKey: 'marketplace', addressId: 'addr-1', acceptedQuoteToken: 'token' },
        'key-1',
      );

      await expect(promise).rejects.toThrow(CheckoutApiError);
    });
  });
});
