'use client';

// @shopscale/web features/cart/cart-drawer - Accessible slide-over cart drawer (T043).
// WCAG 2.1 AA Compliance:
// 1. role="dialog", aria-modal="true", labelled by header title.
// 2. Strict keyboard focus trapping (Tab / Shift+Tab cycling).
// 3. Escape key dismisses drawer and returns focus to the trigger.
// 4. Background scroll locking when open.
// 5. Accessible empty state with shopping CTA.

import { useEffect, useRef } from 'react';
import { BagIcon, PrimaryButton } from '@/components/ui';
import { formatPrice } from '@/lib/price';
import { useCart } from '@/features/cart/cart-context';
import { CartItemRow } from '@/features/cart/cart-item-row';
import { CouponInput } from '@/features/checkout/coupon-input';

export interface CartDrawerProps {
  currency?: string;
}

const FOCUSABLE_SELECTORS = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export function CartDrawer({ currency = 'USD' }: CartDrawerProps) {
  const {
    cart,
    channelKey,
    isOpen,
    error,
    totalCount,
    subtotalCents,
    closeCart,
    updateQuantity,
    removeItem,
  } = useCart();

  const drawerRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  // Focus trap & escape listener
  useEffect(() => {
    if (!isOpen) return;

    // Capture currently focused element to restore when closing
    returnFocusRef.current = (document.activeElement as HTMLElement) ?? null;

    // Lock body scrolling
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus the close button or first interactive element
    const timer = setTimeout(() => {
      closeBtnRef.current?.focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeCart();
        return;
      }

      if (e.key === 'Tab') {
        const drawerEl = drawerRef.current;
        if (!drawerEl) return;

        const focusables = Array.from(
          drawerEl.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS),
        ).filter((el) => el.offsetParent !== null || el === closeBtnRef.current);

        if (focusables.length === 0) return;

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(timer);
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      returnFocusRef.current?.focus?.();
    };
  }, [isOpen, closeCart]);

  if (!isOpen) {
    return null;
  }

  const items = cart?.items ?? [];
  const isEmpty = items.length === 0;
  const checkoutHref =
    channelKey === 'marketplace'
      ? '/checkout'
      : `/checkout?channel=${encodeURIComponent(channelKey)}`;

  return (
    <>
      <div
        className="ss-drawer-backdrop ss-drawer-backdrop--open"
        onClick={closeCart}
        data-testid="cart-drawer-backdrop"
        aria-hidden="true"
      />

      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-drawer-title"
        className="ss-drawer ss-drawer--open"
        data-testid="cart-drawer"
      >
        <header className="ss-drawer__header">
          <h2 id="cart-drawer-title" className="ss-drawer__title">
            Your Bag ({totalCount})
          </h2>
          <button
            ref={closeBtnRef}
            type="button"
            className="ss-drawer__close"
            onClick={closeCart}
            aria-label="Close cart"
            data-testid="cart-drawer-close"
          >
            ✕
          </button>
        </header>

        <div className="ss-drawer__body">
          {error && (
            <div className="ss-cart-error" role="alert" data-testid="cart-error">
              {error}
            </div>
          )}

          {isEmpty ? (
            <div className="ss-cart-empty" data-testid="cart-empty-state">
              <div className="ss-cart-empty__icon" aria-hidden="true">
                <BagIcon size={24} />
              </div>
              <h3 className="type-h3">Your cart is empty</h3>
              <p className="type-body-sm" style={{ color: 'var(--text-secondary)' }}>
                Looks like you haven&apos;t added any items yet.
              </p>
              <div style={{ marginTop: 'var(--space-4)' }}>
                <PrimaryButton onClick={closeCart}>Continue shopping</PrimaryButton>
              </div>
            </div>
          ) : (
            <ul className="ss-cart-items" role="list">
              {items.map((item) => (
                <CartItemRow
                  key={item.variantId}
                  item={item}
                  currency={currency}
                  onUpdateQuantity={(variantId, qty) => {
                    void updateQuantity(variantId, qty);
                  }}
                  onRemove={(variantId) => {
                    void removeItem(variantId);
                  }}
                />
              ))}
            </ul>
          )}
        </div>

        {!isEmpty && (
          <footer className="ss-drawer__footer" data-testid="cart-footer">
            <div style={{ marginBottom: 'var(--space-3)' }}>
              <CouponInput
                currency={currency}
                onApply={async (code) => {
                  try {
                    const res = await fetch('/api/v1/coupons/validate', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        code,
                        subtotalCents,
                        storeIds: [],
                      }),
                    });
                    const data = (await res.json()) as { valid?: boolean; message?: string };
                    if (data.valid) {
                      return { ok: true };
                    }
                    return { ok: false, message: data.message ?? 'Invalid coupon' };
                  } catch {
                    return { ok: false, message: 'Could not validate coupon' };
                  }
                }}
              />
            </div>
            <div className="ss-cart-subtotal-row">
              <span>Subtotal</span>
              <span data-testid="cart-subtotal">
                {formatPrice(subtotalCents, currency)}
              </span>
            </div>
            <p className="type-caption" style={{ color: 'var(--text-secondary)', margin: 0 }}>
              Taxes and shipping calculated at checkout.
            </p>
            <PrimaryButton href={checkoutHref} onClick={closeCart}>
              Proceed to Checkout
            </PrimaryButton>
          </footer>
        )}
      </div>
    </>
  );
}
