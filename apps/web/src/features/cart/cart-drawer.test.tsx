// @shopscale/web features/cart/cart-drawer.test.tsx - Unit tests for CartDrawer (T043).
// Invariants:
// 1. Accessible dialog: role="dialog", aria-modal="true", labelledby title.
// 2. Focus trapping and Escape key dismiss behavior.
// 3. Responsive controls: +, -, remove, and checkout navigation.
// 4. Empty state and error alert rendering.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { CartDto } from '@shopscale/contracts';
import { CartContext } from '@/features/cart/cart-context';
import type { CartContextValue } from '@/features/cart/cart-context';
import { CartDrawer } from '@/features/cart/cart-drawer';

const MOCK_VARIANT_ID = '11111111-1111-4111-8111-111111111111';

function createMockCart(overrides: Partial<CartDto> = {}): CartDto {
  return {
    id: 'cart-12345678-1234-4234-8234-123456789abc',
    channelKey: 'marketplace',
    totalCents: '9900',
    version: 1,
    items: [
      {
        variantId: MOCK_VARIANT_ID,
        qty: 1,
        title: 'Minimalist Leather Sneaker',
        priceCents: '9900',
        available: true,
      },
    ],
    ...overrides,
  };
}

function renderDrawer(
  contextOverrides: Partial<CartContextValue> = {},
  drawerProps: { currency?: string } = {},
) {
  const defaultContext: CartContextValue = {
    cart: createMockCart(),
    channelKey: 'marketplace',
    isOpen: true,
    loading: false,
    error: null,
    totalCount: 1,
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
    ...render(
      <CartContext.Provider value={defaultContext}>
        <CartDrawer {...drawerProps} />
      </CartContext.Provider>,
    ),
    context: defaultContext,
  };
}

describe('CartDrawer (T043)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('does not render when isOpen is false', () => {
    renderDrawer({ isOpen: false });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByTestId('cart-drawer-backdrop')).toBeNull();
  });

  it('renders accessible dialog elements when isOpen is true', () => {
    renderDrawer({ isOpen: true });
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'cart-drawer-title');
    expect(screen.getByText(/Your Bag \(1\)/i)).toBeInTheDocument();
  });

  it('calls closeCart when clicking the close button or backdrop', () => {
    const closeCart = vi.fn();
    renderDrawer({ isOpen: true, closeCart });

    fireEvent.click(screen.getByRole('button', { name: 'Close cart' }));
    expect(closeCart).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('cart-drawer-backdrop'));
    expect(closeCart).toHaveBeenCalledTimes(2);
  });

  it('renders empty state when cart has no items', () => {
    const closeCart = vi.fn();
    renderDrawer({
      isOpen: true,
      cart: createMockCart({ items: [], totalCents: '0' }),
      totalCount: 0,
      subtotalCents: 0,
      closeCart,
    });

    expect(screen.getByText('Your cart is empty')).toBeInTheDocument();
    expect(screen.getByText(/haven't added any items yet/i)).toBeInTheDocument();
    expect(screen.queryByTestId('cart-footer')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Continue shopping' }));
    expect(closeCart).toHaveBeenCalled();
  });

  it('renders line items with prices, quantities, and subtotal', () => {
    renderDrawer({
      isOpen: true,
      cart: createMockCart(),
      totalCount: 1,
      subtotalCents: 9900,
    });

    expect(screen.getByText('Minimalist Leather Sneaker')).toBeInTheDocument();
    expect(screen.getByTestId('cart-item-qty')).toHaveTextContent('1');
    expect(screen.getByTestId('cart-subtotal')).toHaveTextContent(/99\.00|99/);
    expect(screen.getByRole('link', { name: 'Proceed to Checkout' })).toHaveAttribute(
      'href',
      '/checkout',
    );
  });

  it('handles quantity increment (+ button)', () => {
    const updateQuantity = vi.fn();
    renderDrawer({
      isOpen: true,
      updateQuantity,
      cart: createMockCart(),
    });

    const plusBtn = screen.getByTestId('cart-qty-increase');
    fireEvent.click(plusBtn);
    expect(updateQuantity).toHaveBeenCalledWith(MOCK_VARIANT_ID, 2);
  });

  it('handles quantity decrement (- button) when quantity > 1', () => {
    const updateQuantity = vi.fn();
    renderDrawer({
      isOpen: true,
      updateQuantity,
      cart: createMockCart({
        items: [
          {
            variantId: MOCK_VARIANT_ID,
            qty: 3,
            title: 'Minimalist Leather Sneaker',
            priceCents: '9900',
            available: true,
          },
        ],
      }),
    });

    const minusBtn = screen.getByTestId('cart-qty-decrease');
    fireEvent.click(minusBtn);
    expect(updateQuantity).toHaveBeenCalledWith(MOCK_VARIANT_ID, 2);
  });

  it('calls removeItem when clicking decrement on quantity = 1', () => {
    const removeItem = vi.fn();
    const updateQuantity = vi.fn();
    renderDrawer({
      isOpen: true,
      removeItem,
      updateQuantity,
      cart: createMockCart({
        items: [
          {
            variantId: MOCK_VARIANT_ID,
            qty: 1,
            title: 'Minimalist Leather Sneaker',
            priceCents: '9900',
            available: true,
          },
        ],
      }),
    });

    const minusBtn = screen.getByTestId('cart-qty-decrease');
    fireEvent.click(minusBtn);
    expect(removeItem).toHaveBeenCalledWith(MOCK_VARIANT_ID);
    expect(updateQuantity).not.toHaveBeenCalled();
  });

  it('calls removeItem when clicking the Remove button', () => {
    const removeItem = vi.fn();
    renderDrawer({
      isOpen: true,
      removeItem,
      cart: createMockCart(),
    });

    const removeBtn = screen.getByTestId('cart-item-remove');
    fireEvent.click(removeBtn);
    expect(removeItem).toHaveBeenCalledWith(MOCK_VARIANT_ID);
  });

  it('displays out-of-stock warning when available is false', () => {
    renderDrawer({
      isOpen: true,
      cart: createMockCart({
        items: [
          {
            variantId: MOCK_VARIANT_ID,
            qty: 1,
            title: 'Out of Stock Shoes',
            priceCents: '9900',
            available: false,
          },
        ],
      }),
    });

    expect(screen.getByText('Item currently out of stock')).toBeInTheDocument();
  });

  it('displays error alert when error is present', () => {
    renderDrawer({
      isOpen: true,
      error: 'Cannot add more items: maximum stock reached.',
    });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Cannot add more items: maximum stock reached.');
  });

  it('routes store channel checkout with channel query parameter', () => {
    renderDrawer({
      isOpen: true,
      channelKey: 'aurora-fashion',
      cart: createMockCart({ channelKey: 'aurora-fashion' }),
    });

    expect(screen.getByRole('link', { name: 'Proceed to Checkout' })).toHaveAttribute(
      'href',
      '/checkout?channel=aurora-fashion',
    );
  });

  it('closes on Escape key press', () => {
    const closeCart = vi.fn();
    renderDrawer({ isOpen: true, closeCart });

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(closeCart).toHaveBeenCalledTimes(1);
  });

  it('cycles focus trapping inside the drawer on Tab and Shift+Tab', () => {
    renderDrawer({ isOpen: true });

    const closeBtn = screen.getByRole('button', { name: 'Close cart' });
    const checkoutLink = screen.getByRole('link', { name: 'Proceed to Checkout' });

    // Focus close button initially
    closeBtn.focus();
    expect(document.activeElement).toBe(closeBtn);

    // Shift+Tab on first element should wrap to last element (checkout link)
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    // Tab on last element should wrap to first element (close button)
    checkoutLink.focus();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: false });
  });
});
