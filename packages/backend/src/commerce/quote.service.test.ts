// @shopscale/backend/commerce/quote.service.test - Unit tests for QuoteService (T045).

import { beforeEach, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import {
  allocateDiscountsProportionally,
  QuoteService,
  SHIPPING_PER_SELLER_CENTS,
} from './quote.service.js';
import {
  InvalidCouponError,
  InvalidQuoteTokenError,
  PriceChangedError,
  QuoteValidationError,
} from './errors.js';

describe('allocateDiscountsProportionally (T045)', () => {
  it('distributes 1000 cents ($10) across 3 identical items ($3.34, $3.33, $3.33) without losing pennies', () => {
    const items = [
      { id: 'item-1', subtotalCents: 2000 },
      { id: 'item-2', subtotalCents: 2000 },
      { id: 'item-3', subtotalCents: 2000 },
    ];

    const discounts = allocateDiscountsProportionally(items, 1000);

    const d1 = discounts.get('item-1')!;
    const d2 = discounts.get('item-2')!;
    const d3 = discounts.get('item-3')!;

    expect(d1 + d2 + d3).toBe(1000);
    expect([d1, d2, d3].sort()).toEqual([333, 333, 334]);
  });

  it('allocates proportionally according to item value ratios', () => {
    const items = [
      { id: 'item-1', subtotalCents: 6000 }, // 60% of 10000
      { id: 'item-2', subtotalCents: 4000 }, // 40% of 10000
    ];

    const discounts = allocateDiscountsProportionally(items, 2000); // $20 discount

    expect(discounts.get('item-1')).toBe(1200); // 60% of 2000
    expect(discounts.get('item-2')).toBe(800); // 40% of 2000
    expect(discounts.get('item-1')! + discounts.get('item-2')!).toBe(2000);
  });

  it('caps discount at basket subtotal if coupon exceeds subtotal', () => {
    const items = [
      { id: 'item-1', subtotalCents: 300 },
      { id: 'item-2', subtotalCents: 200 },
    ];

    const discounts = allocateDiscountsProportionally(items, 1000); // $10 coupon on $5 cart

    expect(discounts.get('item-1')).toBe(300);
    expect(discounts.get('item-2')).toBe(200);
    expect(discounts.get('item-1')! + discounts.get('item-2')!).toBe(500);
  });

  it('returns zero discounts when discount is 0', () => {
    const items = [
      { id: 'item-1', subtotalCents: 5000 },
      { id: 'item-2', subtotalCents: 3000 },
    ];

    const discounts = allocateDiscountsProportionally(items, 0);
    expect(discounts.get('item-1')).toBe(0);
    expect(discounts.get('item-2')).toBe(0);
  });
});

describe('QuoteService (T045)', () => {
  const STORE_1 = '11111111-1111-4111-8111-111111111111';
  const STORE_2 = '22222222-2222-4222-8222-222222222222';
  const STORE_3 = '33333333-3333-4333-8333-333333333333';

  const VAR_1 = 'aaaa1111-1111-4111-8111-111111111111';
  const VAR_2 = 'bbbb2222-2222-4222-8222-222222222222';
  const VAR_3 = 'cccc3333-3333-4333-8333-333333333333';

  const catalogRows = [
    {
      variant_id: VAR_1,
      price_cents: 2500, // $25.00
      sku: 'SKU-1',
      title: 'Store 1 Item',
      store_id: STORE_1,
      store_name: 'Store Alpha',
    },
    {
      variant_id: VAR_2,
      price_cents: 5000, // $50.00
      sku: 'SKU-2',
      title: 'Store 2 Item',
      store_id: STORE_2,
      store_name: 'Store Beta',
    },
    {
      variant_id: VAR_3,
      price_cents: 1500, // $15.00
      sku: 'SKU-3',
      title: 'Store 3 Item',
      store_id: STORE_3,
      store_name: 'Store Gamma',
    },
  ];

  let mockSql: Sql;
  let service: QuoteService;

  beforeEach(() => {
    mockSql = {
      unsafe: async (_query: string, params: unknown[] = []) => {
        const ids = (params[0] as string[]) || [];
        return catalogRows.filter((row) => ids.includes(row.variant_id));
      },
    } as unknown as Sql;

    service = new QuoteService(mockSql, 'test-secret-key-for-unit-tests-256bit');
  });

  it('calculates canonical multi-seller quote with 500 cents shipping per seller', async () => {
    const res = await service.calculateQuote({
      channelKey: 'marketplace',
      items: [
        { variantId: VAR_1, qty: 2 }, // Store 1: 2 * 2500 = 5000
        { variantId: VAR_2, qty: 1 }, // Store 2: 1 * 5000 = 5000
        { variantId: VAR_3, qty: 1 }, // Store 3: 1 * 1500 = 1500
      ],
    });

    expect(res.currency).toBe('USD');
    expect(res.subtotalCents).toBe('11500'); // 5000 + 5000 + 1500
    // 3 unique sellers -> 3 * 500 = 1500 cents ($15.00) shipping
    expect(res.shippingCents).toBe('1500');
    expect(res.discountCents).toBe('0');
    expect(res.totalCents).toBe('13000'); // 11500 + 1500
    expect(res.sellers).toHaveLength(3);

    for (const seller of res.sellers) {
      expect(seller.shippingCents).toBe(String(SHIPPING_PER_SELLER_CENTS));
    }
  });

  it('allocates coupon discount proportionally across seller suborders', async () => {
    const res = await service.calculateQuote({
      channelKey: 'marketplace',
      couponCode: 'SAVE10', // 1000 cents ($10.00) off
      items: [
        { variantId: VAR_1, qty: 2 }, // Store 1: 5000 cents (50%)
        { variantId: VAR_2, qty: 1 }, // Store 2: 5000 cents (50%)
      ],
    });

    expect(res.subtotalCents).toBe('10000');
    expect(res.discountCents).toBe('1000');
    expect(res.shippingCents).toBe('1000'); // 2 sellers * 500
    expect(res.totalCents).toBe('10000'); // 10000 + 1000 - 1000

    expect(res.sellers).toHaveLength(2);
    // Each seller gets exactly 500 cents discount (50% of 1000)
    expect(res.sellers[0]?.discountCents).toBe('500');
    expect(res.sellers[1]?.discountCents).toBe('500');
  });

  it('rejects invalid coupon codes with InvalidCouponError', async () => {
    await expect(
      service.calculateQuote({
        channelKey: 'marketplace',
        couponCode: 'BOGUS99',
        items: [{ variantId: VAR_1, qty: 1 }],
      }),
    ).rejects.toThrow(InvalidCouponError);
  });

  it('detects price changes and throws PriceChangedError when catalog differs', async () => {
    await expect(
      service.calculateQuote({
        channelKey: 'marketplace',
        items: [
          {
            variantId: VAR_1,
            qty: 1,
            expectedUnitPriceCents: '1999', // expected $19.99, catalog is $25.00
          },
        ],
      }),
    ).rejects.toThrow(PriceChangedError);
  });

  it('throws QuoteValidationError if items array is empty', async () => {
    await expect(
      service.calculateQuote({
        channelKey: 'marketplace',
        items: [],
      }),
    ).rejects.toThrow(QuoteValidationError);
  });

  it('mints and verifies HMAC quote token', async () => {
    const quote = await service.calculateQuote({
      channelKey: 'marketplace',
      items: [{ variantId: VAR_1, qty: 1 }],
    });

    const verified = service.verifyQuoteToken(quote.quoteToken);
    expect(verified.channelKey).toBe('marketplace');
    expect(verified.subtotalCents).toBe(2500);
    expect(verified.shippingCents).toBe(500);
    expect(verified.totalCents).toBe(3000);
    expect(verified.expiresAt).toBeGreaterThan(Date.now());
  });

  it('rejects tampered quote token with InvalidQuoteTokenError', async () => {
    const quote = await service.calculateQuote({
      channelKey: 'marketplace',
      items: [{ variantId: VAR_1, qty: 1 }],
    });

    const parts = quote.quoteToken.split('.');
    const tamperedToken = `${parts[0]}.bad-signature-value`;

    expect(() => service.verifyQuoteToken(tamperedToken)).toThrow(InvalidQuoteTokenError);
  });

  it('rejects expired quote token with InvalidQuoteTokenError', () => {
    const expiredPayload = {
      quoteId: 'test-quote-1',
      channelKey: 'marketplace',
      subtotalCents: 2500,
      shippingCents: 500,
      discountCents: 0,
      totalCents: 3000,
      expiresAt: Date.now() - 1000, // expired 1 second ago
      couponCode: null,
      items: [],
      sellers: [],
    };

    const token = service.mintQuoteToken(expiredPayload);
    expect(() => service.verifyQuoteToken(token)).toThrow('Quote token has expired');
  });
});
