'use client';

// @shopscale/web features/cart/cart-context - Cart state management (T043).
// Invariants:
// 1. Channel-scoped baskets: defaults to 'marketplace', or isolated per store channel.
// 2. Optimistic UI: quantity modifications and item removals update client state
//    instantly, rolling back on network or server-side failure.
// 3. Accessible slide-over drawer visibility state managed here.
// 4. Safe context reader (useCartSafe) enables SSR / non-provider tests without crashing.

import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { CartDto } from '@shopscale/contracts';
import {
  addCartItem,
  clearCart as clearCartApi,
  fetchCart,
  removeCartItem,
  updateCartItem,
} from '@/features/cart/client';

export interface CartContextValue {
  cart: CartDto | null;
  channelKey: string;
  isOpen: boolean;
  loading: boolean;
  error: string | null;
  totalCount: number;
  subtotalCents: number;
  openCart: () => void;
  closeCart: () => void;
  addItem: (variantId: string, quantity?: number) => Promise<void>;
  updateQuantity: (variantId: string, quantity: number) => Promise<void>;
  removeItem: (variantId: string) => Promise<void>;
  clearCart: () => Promise<void>;
  refreshCart: () => Promise<void>;
}

export const CartContext = createContext<CartContextValue | null>(null);

export interface CartProviderProps {
  channelKey?: string;
  initialCart?: CartDto | null;
  children: ReactNode;
}

export function CartProvider({
  channelKey = 'marketplace',
  initialCart = null,
  children,
}: CartProviderProps) {
  const [cart, setCart] = useState<CartDto | null>(initialCart);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep a ref of cart to ensure rollback uses current state
  const cartRef = useRef<CartDto | null>(cart);
  cartRef.current = cart;

  const refreshCart = useCallback(async () => {
    try {
      const remote = await fetchCart(channelKey);
      setCart(remote);
      setError(null);
    } catch {
      // Quiet fail on initial fetch if backend is not yet populated
    }
  }, [channelKey]);

  useEffect(() => {
    void refreshCart();
  }, [refreshCart]);

  const openCart = useCallback(() => {
    setIsOpen(true);
    setError(null);
  }, []);

  const closeCart = useCallback(() => {
    setIsOpen(false);
    setError(null);
  }, []);

  const addItem = useCallback(
    async (variantId: string, quantity = 1) => {
      setLoading(true);
      setError(null);
      try {
        const updated = await addCartItem(channelKey, variantId, quantity);
        setCart(updated);
        setIsOpen(true);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to add item to cart';
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [channelKey],
  );

  const removeItem = useCallback(
    async (variantId: string) => {
      const prevCart = cartRef.current;
      if (!prevCart) return;

      // Optimistic update
      const filteredItems = prevCart.items.filter((it) => it.variantId !== variantId);
      const newTotal = filteredItems.reduce(
        (sum, it) => sum + Number(it.priceCents) * it.qty,
        0,
      );
      setCart({
        ...prevCart,
        items: filteredItems,
        totalCents: String(newTotal),
      });
      setError(null);

      try {
        const updated = await removeCartItem(channelKey, variantId);
        setCart(updated);
      } catch (err) {
        // Rollback
        setCart(prevCart);
        const msg = err instanceof Error ? err.message : 'Failed to remove item';
        setError(msg);
      }
    },
    [channelKey],
  );

  const updateQuantity = useCallback(
    async (variantId: string, quantity: number) => {
      if (quantity <= 0) {
        await removeItem(variantId);
        return;
      }

      const clampedQty = Math.min(99, Math.max(1, quantity));
      const prevCart = cartRef.current;
      if (!prevCart) return;

      // Optimistic update
      const updatedItems = prevCart.items.map((it) =>
        it.variantId === variantId ? { ...it, qty: clampedQty } : it,
      );
      const newTotal = updatedItems.reduce(
        (sum, it) => sum + Number(it.priceCents) * it.qty,
        0,
      );
      setCart({
        ...prevCart,
        items: updatedItems,
        totalCents: String(newTotal),
      });
      setError(null);

      try {
        const updated = await updateCartItem(channelKey, variantId, clampedQty);
        setCart(updated);
      } catch (err) {
        // Rollback
        setCart(prevCart);
        const msg = err instanceof Error ? err.message : 'Failed to update item quantity';
        setError(msg);
      }
    },
    [channelKey, removeItem],
  );

  const clearCart = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const updated = await clearCartApi(channelKey);
      setCart(updated);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to clear cart';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [channelKey]);

  const totalCount = useMemo(() => {
    return cart?.items.reduce((sum, item) => sum + item.qty, 0) ?? 0;
  }, [cart?.items]);

  const subtotalCents = useMemo(() => {
    return cart ? parseInt(cart.totalCents, 10) || 0 : 0;
  }, [cart]);

  const value: CartContextValue = useMemo(
    () => ({
      cart,
      channelKey,
      isOpen,
      loading,
      error,
      totalCount,
      subtotalCents,
      openCart,
      closeCart,
      addItem,
      updateQuantity,
      removeItem,
      clearCart,
      refreshCart,
    }),
    [
      cart,
      channelKey,
      isOpen,
      loading,
      error,
      totalCount,
      subtotalCents,
      openCart,
      closeCart,
      addItem,
      updateQuantity,
      removeItem,
      clearCart,
      refreshCart,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}

export function useCartSafe(): CartContextValue | null {
  return useContext(CartContext);
}
