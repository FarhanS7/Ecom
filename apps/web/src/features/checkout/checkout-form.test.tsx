// @shopscale/web features/checkout/checkout-form.test.tsx - Unit tests for CheckoutView & Address/Summary (T048).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { CartDto, QuoteResponse } from '@shopscale/contracts';
import { CartContext } from '@/features/cart/cart-context';
import type { CartContextValue } from '@/features/cart/cart-context';
import { CheckoutView } from './checkout-view';
import { CheckoutApiError } from './client';
import type { AddressItem } from './types';

const nav = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: nav.push }),
}));

// Mock the checkout client API
vi.mock('./client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./client')>();
  return {
    ...actual,
    fetchAddresses: vi.fn(),
    createAddress: vi.fn(),
    fetchQuote: vi.fn(),
    submitCheckout: vi.fn(),
  };
});

import * as checkoutClient from './client';

const MOCK_VARIANT_ID = '11111111-1111-4111-8111-111111111111';
const MOCK_STORE_ID = '22222222-2222-4222-8222-222222222222';

const MOCK_ADDRESS: AddressItem = {
  id: 'addr-1111',
  fields: {
    name: 'Alice Johnson',
    line1: '100 Main Street',
    line2: 'Apt 4B',
    city: 'Seattle',
    region: 'WA',
    postalCode: '98101',
    country: 'United States',
  },
  createdAt: '2026-01-01T00:00:00Z',
};

const MOCK_QUOTE: QuoteResponse = {
  quoteToken: 'signed-token-xyz',
  currency: 'USD',
  subtotalCents: '9900',
  discountCents: '0',
  shippingCents: '500',
  totalCents: '10400',
  sellers: [
    {
      storeId: MOCK_STORE_ID,
      storeName: 'Audio Haven',
      subtotalCents: '9900',
      discountCents: '0',
      shippingCents: '500',
      totalCents: '10400',
      items: [
        {
          variantId: MOCK_VARIANT_ID,
          title: 'Studio Monitor Headphones',
          qty: 1,
          unitPriceCents: '9900',
          discountCents: '0',
          totalCents: '9900',
        },
      ],
    },
  ],
  expiresAt: new Date(Date.now() + 900000).toISOString(),
};

function createMockCart(overrides: Partial<CartDto> = {}): CartDto {
  return {
    id: 'cart-1',
    channelKey: 'marketplace',
    totalCents: '9900',
    version: 1,
    items: [
      {
        variantId: MOCK_VARIANT_ID,
        qty: 1,
        title: 'Studio Monitor Headphones',
        priceCents: '9900',
        available: true,
      },
    ],
    ...overrides,
  };
}

function renderCheckout(cartOverrides: Partial<CartDto> = {}, contextOverrides: Partial<CartContextValue> = {}) {
  const cart = createMockCart(cartOverrides);
  const defaultContext: CartContextValue = {
    cart,
    channelKey: 'marketplace',
    isOpen: false,
    loading: false,
    error: null,
    totalCount: cart.items.length,
    subtotalCents: 9900,
    openCart: vi.fn(),
    closeCart: vi.fn(),
    addItem: vi.fn().mockResolvedValue(undefined),
    updateQuantity: vi.fn().mockResolvedValue(undefined),
    removeItem: vi.fn().mockResolvedValue(undefined),
    clearCart: vi.fn().mockResolvedValue(undefined),
    refreshCart: vi.fn().mockResolvedValue(undefined),
    ...contextOverrides,
  };

  return {
    context: defaultContext,
    ...render(
      <CartContext.Provider value={defaultContext}>
        <CheckoutView />
      </CartContext.Provider>,
    ),
  };
}

describe('CheckoutView & Steps (T048)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nav.push.mockReset();
    nav.replace.mockReset();

    vi.mocked(checkoutClient.fetchAddresses).mockResolvedValue([MOCK_ADDRESS]);
    vi.mocked(checkoutClient.fetchQuote).mockResolvedValue(MOCK_QUOTE);
  });

  afterEach(() => {
    cleanup();
  });

  it('renders empty cart state when cart bag is empty', async () => {
    renderCheckout({ items: [] });

    await waitFor(() => {
      expect(screen.getByTestId('checkout-empty')).toBeInTheDocument();
      expect(screen.getByText('Your bag is empty')).toBeInTheDocument();
    });
  });

  it('loads addresses and quote, displaying AddressStep with saved address', async () => {
    renderCheckout();

    await waitFor(() => {
      expect(screen.getByTestId('address-step')).toBeInTheDocument();
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
      expect(screen.getByText('100 Main Street')).toBeInTheDocument();
    });
  });

  it('allows selecting address and continuing to order review step', async () => {
    const secondAddress: AddressItem = {
      id: 'addr-2222',
      fields: {
        name: 'Bob Smith',
        line1: '200 Elm Street',
        city: 'Portland',
        region: 'OR',
        postalCode: '97201',
        country: 'United States',
      },
      createdAt: '2026-01-02T00:00:00Z',
    };

    vi.mocked(checkoutClient.fetchAddresses).mockResolvedValue([MOCK_ADDRESS, secondAddress]);

    renderCheckout();

    await waitFor(() => {
      expect(screen.getByText('Bob Smith')).toBeInTheDocument();
    });

    // Select second address
    const radioBob = screen.getByTestId('address-radio-addr-2222');
    fireEvent.click(radioBob);

    // Click continue to review
    const continueBtn = screen.getByTestId('continue-to-review-btn');
    fireEvent.click(continueBtn);

    await waitFor(() => {
      expect(screen.getByTestId('order-summary-step')).toBeInTheDocument();
      expect(screen.getByText(/200 Elm Street/)).toBeInTheDocument();
      expect(screen.getByText('Vendor: Audio Haven')).toBeInTheDocument();
      expect(screen.getByText('Studio Monitor Headphones')).toBeInTheDocument();
    });
  });

  it('allows inline address creation when user toggles new address form', async () => {
    const newAddress: AddressItem = {
      id: 'addr-new',
      fields: {
        name: 'Carol Danvers',
        line1: '777 Flight Way',
        city: 'Boston',
        region: 'MA',
        postalCode: '02101',
        country: 'United States',
      },
      createdAt: '2026-01-03T00:00:00Z',
    };

    vi.mocked(checkoutClient.createAddress).mockResolvedValue(newAddress);

    renderCheckout();

    await waitFor(() => {
      expect(screen.getByTestId('add-new-address-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('add-new-address-btn'));

    expect(screen.getByTestId('new-address-form')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('input-addr-name'), { target: { value: 'Carol Danvers' } });
    fireEvent.change(screen.getByTestId('input-addr-line1'), { target: { value: '777 Flight Way' } });
    fireEvent.change(screen.getByTestId('input-addr-city'), { target: { value: 'Boston' } });
    fireEvent.change(screen.getByTestId('input-addr-postalCode'), { target: { value: '02101' } });

    fireEvent.submit(screen.getByTestId('new-address-form'));

    await waitFor(() => {
      expect(checkoutClient.createAddress).toHaveBeenCalled();
      expect(screen.getByText('Carol Danvers')).toBeInTheDocument();
    });
  });

  it('submits checkout with idempotency key, clears cart, and redirects to pending page', async () => {
    vi.mocked(checkoutClient.submitCheckout).mockResolvedValue({
      orderId: '44444444-4444-4444-8444-444444444444',
      status: 'PENDING',
      paymentEffectKey: 'eff_123',
      totalCents: '10400',
      expiresAt: new Date(Date.now() + 900000).toISOString(),
    });

    const { context } = renderCheckout();

    // Advance to review
    await waitFor(() => {
      expect(screen.getByTestId('continue-to-review-btn')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('continue-to-review-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('place-order-btn')).toBeInTheDocument();
    });

    const placeOrderBtn = screen.getByTestId('place-order-btn');
    fireEvent.click(placeOrderBtn);

    await waitFor(() => {
      expect(checkoutClient.submitCheckout).toHaveBeenCalledWith(
        expect.objectContaining({
          channelKey: 'marketplace',
          addressId: 'addr-1111',
          acceptedQuoteToken: 'signed-token-xyz',
        }),
        expect.any(String), // UUID Idempotency-Key
      );
      expect(context.clearCart).toHaveBeenCalled();
      expect(nav.push).toHaveBeenCalledWith('/orders/44444444-4444-4444-8444-444444444444/pending');
    });
  });

  it('renders PRICE_CHANGED error banner and link to review cart', async () => {
    vi.mocked(checkoutClient.submitCheckout).mockRejectedValue(
      new CheckoutApiError(409, {
        error: 'PRICE_CHANGED',
        message: 'Item price changed',
      }),
    );

    const openCartMock = vi.fn();
    renderCheckout({}, { openCart: openCartMock });

    await waitFor(() => {
      expect(screen.getByTestId('continue-to-review-btn')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('continue-to-review-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('place-order-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('place-order-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('checkout-error-banner')).toBeInTheDocument();
      expect(screen.getByText(/changed price/i)).toBeInTheDocument();
    });

    // Click Return to Cart Bag link
    const returnLink = screen.getByTestId('return-to-cart-link');
    fireEvent.click(returnLink);
    expect(openCartMock).toHaveBeenCalled();
  });

  it('renders INSUFFICIENT_STOCK error banner', async () => {
    vi.mocked(checkoutClient.submitCheckout).mockRejectedValue(
      new CheckoutApiError(409, {
        error: 'INSUFFICIENT_STOCK',
        message: 'No stock available',
      }),
    );

    renderCheckout();

    await waitFor(() => {
      expect(screen.getByTestId('continue-to-review-btn')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('continue-to-review-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('place-order-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('place-order-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('checkout-error-banner')).toBeInTheDocument();
      expect(screen.getByText(/no longer in stock/i)).toBeInTheDocument();
    });
  });

  it('allows applying coupon code in OrderSummary step', async () => {
    const updatedQuote: QuoteResponse = {
      ...MOCK_QUOTE,
      discountCents: '1000',
      totalCents: '9400',
    };
    vi.mocked(checkoutClient.fetchQuote).mockResolvedValueOnce(MOCK_QUOTE).mockResolvedValueOnce(updatedQuote);

    renderCheckout();

    await waitFor(() => {
      expect(screen.getByTestId('continue-to-review-btn')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('continue-to-review-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('input-coupon')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('input-coupon'), { target: { value: 'PROMO10' } });
    fireEvent.click(screen.getByTestId('apply-coupon-btn'));

    await waitFor(() => {
      expect(checkoutClient.fetchQuote).toHaveBeenCalledWith(
        expect.objectContaining({
          couponCode: 'PROMO10',
        }),
      );
    });
  });
});
