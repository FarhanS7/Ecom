'use client';

// @shopscale/web features/checkout/checkout-view - Multi-step checkout review & order flow (T048).

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCartSafe } from '@/features/cart/cart-context';
import type { QuoteResponse } from '@shopscale/contracts';
import { AddressStep } from './address-step';
import { OrderSummary } from './order-summary';
import { CheckoutApiError, fetchAddresses, fetchQuote, submitCheckout } from './client';
import type { AddressItem, CheckoutStep } from './types';

export function CheckoutView() {
  const router = useRouter();
  const cartContext = useCartSafe();
  const cart = cartContext?.cart;
  const channelKey = cartContext?.channelKey ?? 'marketplace';

  const [step, setStep] = useState<CheckoutStep>('address');
  const [addresses, setAddresses] = useState<AddressItem[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [appliedCoupon, setAppliedCoupon] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorBanner, setErrorBanner] = useState<{ message: string; code?: string } | null>(null);

  // 1. Initial Load: Addresses and Quote
  const loadInitialData = useCallback(async () => {
    setIsLoading(true);
    setErrorBanner(null);

    try {
      // Load saved addresses
      const loadedAddresses = await fetchAddresses().catch((err: unknown) => {
        if (err instanceof Error && err.message === 'UNAUTHORIZED') {
          // Redirect to login if unauthenticated
          router.push(`/login?redirect=${encodeURIComponent('/checkout')}`);
        }
        return [] as AddressItem[];
      });

      setAddresses(loadedAddresses);
      setSelectedAddressId((curr) => curr ?? (loadedAddresses[0]?.id ?? null));

      // Load initial Quote from cart items
      const items = cart?.items ?? [];
      if (items.length > 0) {
        const quoteRes = await fetchQuote({
          channelKey,
          items: items.map((it) => ({
            variantId: it.variantId,
            qty: it.qty,
            expectedUnitPriceCents: it.priceCents,
          })),
          couponCode: appliedCoupon || undefined,
        });
        setQuote(quoteRes);
      }
    } catch (err) {
      if (err instanceof CheckoutApiError) {
        setErrorBanner({
          message: err.data.message || err.message,
          code: err.data.error,
        });
      } else {
        setErrorBanner({ message: err instanceof Error ? err.message : 'Failed to initialize checkout.' });
      }
    } finally {
      setIsLoading(false);
    }
  }, [channelKey]);

  useEffect(() => {
    void loadInitialData();
  }, [loadInitialData]);

  // Handle applying coupon code
  const handleApplyCoupon = async (code: string) => {
    setErrorBanner(null);
    const items = cart?.items ?? [];
    if (items.length === 0) return;

    const quoteRes = await fetchQuote({
      channelKey,
      items: items.map((it) => ({
        variantId: it.variantId,
        qty: it.qty,
        expectedUnitPriceCents: it.priceCents,
      })),
      couponCode: code,
    });
    setQuote(quoteRes);
    setAppliedCoupon(code);
  };

  // Handle Order Submission
  const handleSubmitOrder = async () => {
    if (!selectedAddressId || !quote || isSubmitting) return;

    setIsSubmitting(true);
    setErrorBanner(null);

    // Client-generated UUID Idempotency-Key
    const idempotencyKey = crypto.randomUUID();

    try {
      const result = await submitCheckout(
        {
          channelKey,
          addressId: selectedAddressId,
          acceptedQuoteToken: quote.quoteToken,
        },
        idempotencyKey,
      );

      // Clear local cart
      if (cartContext?.clearCart) {
        void cartContext.clearCart();
      }

      // Redirect to pending order confirmation screen
      router.push(`/orders/${result.orderId}/pending`);
    } catch (err) {
      setIsSubmitting(false);
      if (err instanceof CheckoutApiError) {
        if (err.data.error === 'PRICE_CHANGED') {
          setErrorBanner({
            code: 'PRICE_CHANGED',
            message: 'One or more items in your cart changed price since checkout started. Please review your updated cart.',
          });
        } else if (err.data.error === 'INSUFFICIENT_STOCK') {
          setErrorBanner({
            code: 'INSUFFICIENT_STOCK',
            message: 'An item in your order is no longer in stock. Please adjust quantities in your cart.',
          });
        } else {
          setErrorBanner({
            code: err.data.error,
            message: err.data.message || err.message,
          });
        }
      } else {
        setErrorBanner({ message: err instanceof Error ? err.message : 'Failed to place order.' });
      }
    }
  };

  const selectedAddress = addresses.find((a) => a.id === selectedAddressId) ?? null;
  const cartItems = cart?.items ?? [];

  if (cartItems.length === 0 && !isLoading) {
    return (
      <div className="ss-checkout-empty" data-testid="checkout-empty" style={{ textAlign: 'center', padding: 'var(--space-12) var(--space-4)' }}>
        <h1 className="type-h2">Your bag is empty</h1>
        <p className="type-body" style={{ color: 'var(--text-secondary)', margin: 'var(--space-3) 0 var(--space-6)' }}>
          Add products to your cart before proceeding to checkout.
        </p>
        <Link href="/" className="ui-button ui-button--primary">
          Start Shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="ss-checkout-container" style={{ maxWidth: '800px', margin: '0 auto', padding: 'var(--space-8) var(--space-4)' }}>
      <header style={{ marginBottom: 'var(--space-8)' }}>
        <h1 className="type-h2">Checkout</h1>
      </header>

      {errorBanner && (
        <div
          role="alert"
          className="ss-alert ss-alert--danger"
          style={{
            padding: 'var(--space-4)',
            backgroundColor: '#fef2f2',
            border: '1px solid #f87171',
            borderRadius: 'var(--radius-md)',
            marginBottom: 'var(--space-6)',
            color: '#991b1b',
          }}
          data-testid="checkout-error-banner"
        >
          <p style={{ margin: 0, fontWeight: 500 }}>{errorBanner.message}</p>
          {(errorBanner.code === 'PRICE_CHANGED' || errorBanner.code === 'INSUFFICIENT_STOCK') && (
            <div style={{ marginTop: 'var(--space-2)' }}>
              <button
                type="button"
                className="ss-link-button"
                onClick={() => cartContext?.openCart()}
                style={{ color: '#991b1b', textDecoration: 'underline' }}
                data-testid="return-to-cart-link"
              >
                Review Cart Bag
              </button>
            </div>
          )}
        </div>
      )}

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-12)' }} data-testid="checkout-loading">
          <p className="type-body">Loading checkout details...</p>
        </div>
      ) : (
        <>
          {step === 'address' && (
            <AddressStep
              addresses={addresses}
              selectedAddressId={selectedAddressId}
              onSelectAddress={(id) => setSelectedAddressId(id)}
              onAddressCreated={(newAddr) => setAddresses((prev) => [newAddr, ...prev])}
              onContinue={() => setStep('review')}
            />
          )}

          {step === 'review' && quote && (
            <OrderSummary
              quote={quote}
              selectedAddress={selectedAddress}
              appliedCoupon={appliedCoupon}
              isSubmitting={isSubmitting}
              onApplyCoupon={handleApplyCoupon}
              onSubmitOrder={() => void handleSubmitOrder()}
              onChangeAddress={() => setStep('address')}
            />
          )}
        </>
      )}
    </div>
  );
}
