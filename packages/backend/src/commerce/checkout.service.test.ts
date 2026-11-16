// @shopscale/backend/commerce/checkout.service.test - Unit tests for CheckoutService (T047).

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CheckoutService } from './checkout.service.js';
import {
  AddressNotFoundError,
  IdempotencyConflictError,
  InsufficientStockError,
  InvalidQuoteTokenError,
  MissingIdempotencyKeyError,
} from './errors.js';
import { quoteService } from './quote.service.js';
import { inventoryService } from '../inventory/inventory.service.js';
import { writeOutboxEvent } from '../platform/outbox.service.js';

vi.mock('./quote.service.js', () => ({
  quoteService: {
    verifyQuoteToken: vi.fn(),
  },
}));

vi.mock('../inventory/inventory.service.js', () => ({
  inventoryService: {
    reserve: vi.fn(),
  },
}));

vi.mock('../platform/outbox.service.js', () => ({
  writeOutboxEvent: vi.fn(),
}));

interface MockSql {
  unsafe: ReturnType<typeof vi.fn>;
  begin: (cb: (tx: MockSql) => Promise<unknown>) => Promise<unknown>;
}

describe('CheckoutService Unit Tests (T047)', () => {
  let checkoutService: CheckoutService;
  let mockSql: MockSql;
  const mockUserId = '11111111-1111-4111-8111-111111111111';
  const mockAddressId = '22222222-2222-4222-8222-222222222222';
  const mockKey = '33333333-3333-4333-8333-333333333333';
  const mockToken = 'mock.valid.token';

  beforeEach(() => {
    vi.clearAllMocks();
    mockSql = {
      unsafe: vi.fn(),
      begin: vi.fn(async (cb: (tx: MockSql) => Promise<unknown>) => {
        return cb(mockSql);
      }),
    };
    checkoutService = new CheckoutService(mockSql as unknown as import('postgres').Sql);
  });

  it('throws MissingIdempotencyKeyError if Idempotency-Key is omitted or empty', async () => {
    await expect(
      checkoutService.initiateCheckout({
        userId: mockUserId,
        channelKey: 'marketplace',
        addressId: mockAddressId,
        acceptedQuoteToken: mockToken,
        idempotencyKey: '',
      }),
    ).rejects.toThrow(MissingIdempotencyKeyError);
  });

  it('produces deterministic SHA-256 hash for identical payloads', () => {
    const hash1 = checkoutService.hashRequest('marketplace', mockAddressId, mockToken);
    const hash2 = checkoutService.hashRequest('marketplace', mockAddressId, mockToken);
    const hash3 = checkoutService.hashRequest('marketplace', mockAddressId, 'different-token');

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hash3);
    expect(hash1).toHaveLength(64);
  });

  it('replays cached response when receiving duplicate key with matching payload', async () => {
    const cachedResponse = {
      orderId: '44444444-4444-4444-8444-444444444444',
      status: 'PENDING' as const,
      paymentEffectKey: 'pay_eff_cached',
      totalCents: '5500',
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    };

    const expectedHash = checkoutService.hashRequest('marketplace', mockAddressId, mockToken);

    mockSql.unsafe.mockResolvedValueOnce([
      {
        id: 'idem-1',
        request_hash: expectedHash,
        status: 'COMPLETED',
        response_status: 201,
        response_body: cachedResponse,
      },
    ]);

    const result = await checkoutService.initiateCheckout({
      userId: mockUserId,
      channelKey: 'marketplace',
      addressId: mockAddressId,
      acceptedQuoteToken: mockToken,
      idempotencyKey: mockKey,
    });

    expect(result).toEqual(cachedResponse);
    expect(inventoryService.reserve).not.toHaveBeenCalled();
    expect(writeOutboxEvent).not.toHaveBeenCalled();
  });

  it('throws IdempotencyConflictError on key reuse with modified payload', async () => {
    mockSql.unsafe.mockResolvedValueOnce([
      {
        id: 'idem-1',
        request_hash: 'different-stale-hash',
        status: 'COMPLETED',
        response_status: 201,
        response_body: {},
      },
    ]);

    await expect(
      checkoutService.initiateCheckout({
        userId: mockUserId,
        channelKey: 'marketplace',
        addressId: mockAddressId,
        acceptedQuoteToken: mockToken,
        idempotencyKey: mockKey,
      }),
    ).rejects.toThrow(IdempotencyConflictError);
  });

  it('throws IdempotencyConflictError if prior request with key is still in progress', async () => {
    const expectedHash = checkoutService.hashRequest('marketplace', mockAddressId, mockToken);

    mockSql.unsafe.mockResolvedValueOnce([
      {
        id: 'idem-1',
        request_hash: expectedHash,
        status: 'PROCESSING',
        response_status: null,
        response_body: null,
      },
    ]);

    await expect(
      checkoutService.initiateCheckout({
        userId: mockUserId,
        channelKey: 'marketplace',
        addressId: mockAddressId,
        acceptedQuoteToken: mockToken,
        idempotencyKey: mockKey,
      }),
    ).rejects.toThrow(IdempotencyConflictError);
  });

  it('throws InvalidQuoteTokenError if quote token is expired', async () => {
    mockSql.unsafe.mockResolvedValueOnce([]); // No idempotency record

    vi.mocked(quoteService.verifyQuoteToken).mockReturnValueOnce({
      quoteId: 'quote-1',
      channelKey: 'marketplace',
      subtotalCents: 5000,
      shippingCents: 500,
      discountCents: 0,
      totalCents: 5500,
      expiresAt: Date.now() - 1000, // Expired 1 second ago
      couponCode: null,
      items: [],
      sellers: [],
    });

    await expect(
      checkoutService.initiateCheckout({
        userId: mockUserId,
        channelKey: 'marketplace',
        addressId: mockAddressId,
        acceptedQuoteToken: mockToken,
        idempotencyKey: mockKey,
      }),
    ).rejects.toThrow(InvalidQuoteTokenError);
  });

  it('throws AddressNotFoundError if addressId is not found for current user', async () => {
    mockSql.unsafe
      .mockResolvedValueOnce([]) // idempotency check: no match
      .mockResolvedValueOnce([]); // address lookup: not found

    vi.mocked(quoteService.verifyQuoteToken).mockReturnValueOnce({
      quoteId: 'quote-1',
      channelKey: 'marketplace',
      subtotalCents: 5000,
      shippingCents: 500,
      discountCents: 0,
      totalCents: 5500,
      expiresAt: Date.now() + 600_000,
      couponCode: null,
      items: [],
      sellers: [],
    });

    await expect(
      checkoutService.initiateCheckout({
        userId: mockUserId,
        channelKey: 'marketplace',
        addressId: mockAddressId,
        acceptedQuoteToken: mockToken,
        idempotencyKey: mockKey,
      }),
    ).rejects.toThrow(AddressNotFoundError);
  });

  it('throws InsufficientStockError and rolls back if any line item reservation fails', async () => {
    mockSql.unsafe
      .mockResolvedValueOnce([]) // idempotency check: none
      .mockResolvedValueOnce([
        {
          id: mockAddressId,
          fields: {
            name: 'Jane Doe',
            line1: '123 Main St',
            city: 'Springfield',
            region: 'IL',
            postalCode: '62701',
            country: 'USA',
          },
        },
      ]); // address lookup

    const mockVariantId = '55555555-5555-4555-8555-555555555555';
    const mockStoreId = '66666666-6666-4666-8666-666666666666';

    vi.mocked(quoteService.verifyQuoteToken).mockReturnValueOnce({
      quoteId: 'quote-1',
      channelKey: 'marketplace',
      subtotalCents: 2000,
      shippingCents: 500,
      discountCents: 0,
      totalCents: 2500,
      expiresAt: Date.now() + 600_000,
      couponCode: null,
      items: [
        {
          variantId: mockVariantId,
          storeId: mockStoreId,
          qty: 2,
          unitPriceCents: 1000,
          discountCents: 0,
          title: 'Test Variant',
          sku: 'SKU-TEST',
        },
      ],
      sellers: [
        {
          storeId: mockStoreId,
          subtotalCents: 2000,
          shippingCents: 500,
          discountCents: 0,
          totalCents: 2500,
        },
      ],
    });

    vi.mocked(inventoryService.reserve).mockResolvedValueOnce({
      ok: false,
      code: 'INSUFFICIENT_STOCK',
      variantId: mockVariantId,
      available: 1,
    });

    await expect(
      checkoutService.initiateCheckout({
        userId: mockUserId,
        channelKey: 'marketplace',
        addressId: mockAddressId,
        acceptedQuoteToken: mockToken,
        idempotencyKey: mockKey,
      }),
    ).rejects.toThrow(InsufficientStockError);
  });

  it('successfully creates order, suborders, reservations, outbox, and completes idempotency', async () => {
    mockSql.unsafe
      .mockResolvedValueOnce([]) // idempotency check
      .mockResolvedValueOnce([
        {
          id: mockAddressId,
          fields: {
            name: 'Jane Customer',
            line1: '456 Oak Ave',
            city: 'Seattle',
            region: 'WA',
            postalCode: '98101',
            country: 'USA',
          },
        },
      ]) // address lookup
      .mockResolvedValue([]); // tx executions

    const storeAlpha = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const storeBeta = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const varAlpha = 'vaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const varBeta = 'vbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

    vi.mocked(quoteService.verifyQuoteToken).mockReturnValueOnce({
      quoteId: 'quote-123',
      channelKey: 'marketplace',
      subtotalCents: 8000,
      shippingCents: 1000,
      discountCents: 500,
      totalCents: 8500,
      expiresAt: Date.now() + 600_000,
      couponCode: 'SAVE5',
      items: [
        {
          variantId: varAlpha,
          storeId: storeAlpha,
          qty: 1,
          unitPriceCents: 3000,
          discountCents: 200,
          title: 'Alpha Item',
          sku: 'SKU-ALPHA',
        },
        {
          variantId: varBeta,
          storeId: storeBeta,
          qty: 1,
          unitPriceCents: 5000,
          discountCents: 300,
          title: 'Beta Item',
          sku: 'SKU-BETA',
        },
      ],
      sellers: [
        {
          storeId: storeAlpha,
          subtotalCents: 3000,
          shippingCents: 500,
          discountCents: 200,
          totalCents: 3300,
        },
        {
          storeId: storeBeta,
          subtotalCents: 5000,
          shippingCents: 500,
          discountCents: 300,
          totalCents: 5200,
        },
      ],
    });

    vi.mocked(inventoryService.reserve).mockResolvedValueOnce({
      ok: true,
      reservationIds: ['res-alpha', 'res-beta'],
    });

    const result = await checkoutService.initiateCheckout({
      userId: mockUserId,
      channelKey: 'marketplace',
      addressId: mockAddressId,
      acceptedQuoteToken: mockToken,
      idempotencyKey: mockKey,
    });

    expect(result.status).toBe('PENDING');
    expect(result.totalCents).toBe('8500');
    expect(result.paymentEffectKey).toMatch(/^pay_eff_/);
    expect(result.orderId).toBeDefined();

    expect(inventoryService.reserve).toHaveBeenCalledTimes(1);
    expect(writeOutboxEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        aggregateType: 'order',
        type: 'order.checkout_reserved',
        correlationId: mockKey,
      }),
    );
  });
});
