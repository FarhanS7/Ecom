'use client';

// @shopscale/web features/checkout/order-summary - Multi-seller order review and totals (T048).

import type { QuoteResponse } from '@shopscale/contracts';
import { formatPrice } from '@/lib/price';
import { CouponInput } from './coupon-input';
import type { AddressItem } from './types';

interface OrderSummaryProps {
  quote: QuoteResponse;
  selectedAddress: AddressItem | null;
  appliedCoupon: string;
  isSubmitting: boolean;
  onApplyCoupon: (code: string) => Promise<void>;
  onSubmitOrder: () => void;
  onChangeAddress: () => void;
}

export function OrderSummary({
  quote,
  selectedAddress,
  appliedCoupon,
  isSubmitting,
  onApplyCoupon,
  onSubmitOrder,
  onChangeAddress,
}: OrderSummaryProps) {
  const addrFields = selectedAddress?.fields;

  return (
    <section aria-labelledby="checkout-review-heading" className="ss-checkout-section" data-testid="order-summary-step">
      <h2 id="checkout-review-heading" className="type-h3" style={{ marginBottom: 'var(--space-4)' }}>
        2. Review and Place Order
      </h2>

      {selectedAddress && (
        <div className="ss-selected-address-summary" style={{ marginBottom: 'var(--space-6)', padding: 'var(--space-4)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span className="type-label" style={{ fontWeight: 600 }}>Shipping to:</span>
              <p className="type-body-sm" style={{ margin: 'var(--space-1) 0 0' }}>
                {addrFields?.name || addrFields?.fullName}<br />
                {addrFields?.line1}{addrFields?.line2 ? `, ${addrFields.line2}` : ''}<br />
                {addrFields?.city}, {addrFields?.region || addrFields?.state} {addrFields?.postalCode}
              </p>
            </div>
            <button
              type="button"
              className="ss-link-button"
              onClick={onChangeAddress}
              data-testid="change-address-btn"
            >
              Change
            </button>
          </div>
        </div>
      )}

      {/* Split Suborders Breakdown */}
      <div className="ss-seller-suborders-list" style={{ display: 'grid', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
        {quote.sellers.map((seller) => (
          <div
            key={seller.storeId}
            className="ss-seller-suborder-card"
            style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)' }}
            data-testid={`suborder-${seller.storeId}`}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
              <span className="type-label" style={{ fontWeight: 600 }}>
                Vendor: {seller.storeName}
              </span>
              <span className="type-caption" style={{ color: 'var(--text-secondary)' }}>
                Shipping: {formatPrice(Number.parseInt(seller.shippingCents, 10), quote.currency)}
              </span>
            </div>

            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 'var(--space-2)' }}>
              {seller.items.map((it) => (
                <li key={it.variantId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span className="type-body-sm">{it.title}</span>
                    <span className="type-caption" style={{ color: 'var(--text-secondary)', marginLeft: 'var(--space-2)' }}>
                      × {it.qty}
                    </span>
                  </div>
                  <span className="type-body-sm" style={{ fontWeight: 500 }}>
                    {formatPrice(Number.parseInt(it.totalCents, 10), quote.currency)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Coupon Application Box */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <CouponInput
          appliedCoupon={quote.couponCode || appliedCoupon || null}
          discountCents={Number.parseInt(quote.discountCents, 10)}
          currency={quote.currency}
          disabled={isSubmitting}
          onApply={async (code) => {
            try {
              await onApplyCoupon(code);
              return { ok: true };
            } catch (err) {
              return {
                ok: false,
                message: err instanceof Error ? err.message : 'Invalid coupon code',
              };
            }
          }}
          onRemove={() => {
            void onApplyCoupon('');
          }}
        />
      </div>

      {/* Totals Summary */}
      <div className="ss-checkout-totals" style={{ padding: 'var(--space-4)', backgroundColor: 'var(--bg-subtle, #f9fafb)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-6)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
          <span className="type-body-sm">Items Subtotal</span>
          <span className="type-body-sm" data-testid="quote-subtotal">{formatPrice(Number.parseInt(quote.subtotalCents, 10), quote.currency)}</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
          <span className="type-body-sm">Shipping ({quote.sellers.length} {quote.sellers.length === 1 ? 'seller' : 'sellers'})</span>
          <span className="type-body-sm" data-testid="quote-shipping">{formatPrice(Number.parseInt(quote.shippingCents, 10), quote.currency)}</span>
        </div>

        {Number.parseInt(quote.discountCents, 10) > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-2)', color: 'var(--color-success)' }}>
            <span className="type-body-sm">Discount</span>
            <span className="type-body-sm" data-testid="quote-discount">-{formatPrice(Number.parseInt(quote.discountCents, 10), quote.currency)}</span>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-subtle)', paddingTop: 'var(--space-3)', marginTop: 'var(--space-2)', fontWeight: 700 }}>
          <span className="type-body">Total</span>
          <span className="type-body" data-testid="quote-total">{formatPrice(Number.parseInt(quote.totalCents, 10), quote.currency)}</span>
        </div>
      </div>

      {/* Place Order CTA */}
      <div>
        <button
          type="button"
          className="ui-button ui-button--primary"
          style={{ width: '100%', padding: 'var(--space-4)', fontSize: '1.1rem' }}
          disabled={isSubmitting || !selectedAddress}
          onClick={onSubmitOrder}
          data-testid="place-order-btn"
        >
          {isSubmitting ? 'Placing Order and Reserving Inventory...' : `Place Order (${formatPrice(Number.parseInt(quote.totalCents, 10), quote.currency)})`}
        </button>
        <p className="type-caption" style={{ textAlign: 'center', color: 'var(--text-secondary)', marginTop: 'var(--space-2)' }}>
          By placing your order, you agree to ShopScale Terms of Sale.
        </p>
      </div>
    </section>
  );
}
