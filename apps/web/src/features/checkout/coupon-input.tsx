'use client';

// @shopscale/web features/checkout/coupon-input - Promo code entry, badge display, and removal (OR-9 / T063).

import { useState } from 'react';
import { formatPrice } from '@/lib/price';

export interface CouponInputProps {
  appliedCoupon?: string | null | undefined;
  discountCents?: number | undefined;
  currency?: string | undefined;
  disabled?: boolean | undefined;
  onApply: (code: string) => Promise<{ ok: boolean; message?: string }>;
  onRemove?: (() => void) | undefined;
}

export function CouponInput({
  appliedCoupon = null,
  discountCents = 0,
  currency = 'USD',
  disabled = false,
  onApply,
  onRemove,
}: CouponInputProps) {
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;

    setErrorMessage(null);
    setIsLoading(true);

    try {
      const result = await onApply(trimmed);
      if (result.ok) {
        setCode('');
      } else {
        setErrorMessage(result.message || 'Invalid or expired coupon code');
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to apply coupon');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemove = () => {
    setErrorMessage(null);
    onRemove?.();
  };

  return (
    <div className="ss-coupon-box" data-testid="coupon-component">
      {appliedCoupon ? (
        <div
          className="ss-coupon-applied-badge"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'var(--space-2) var(--space-3)',
            backgroundColor: 'var(--color-success-bg, #ecfdf5)',
            border: '1px solid var(--color-success-border, #a7f3d0)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--color-success-text, #065f46)',
          }}
          data-testid="applied-coupon-badge"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span style={{ fontWeight: 600 }}>🏷️ {appliedCoupon}</span>
            {discountCents > 0 && (
              <span className="type-caption" style={{ fontWeight: 500 }} data-testid="coupon-discount-text">
                (-{formatPrice(discountCents, currency)})
              </span>
            )}
          </div>
          {onRemove && (
            <button
              type="button"
              className="ss-link-button"
              onClick={handleRemove}
              disabled={disabled}
              style={{
                color: 'var(--color-danger, #b91c1c)',
                fontSize: '0.85rem',
                cursor: 'pointer',
                background: 'none',
                border: 'none',
                textDecoration: 'underline',
              }}
              data-testid="remove-coupon-btn"
              aria-label={`Remove coupon ${appliedCoupon}`}
            >
              Remove
            </button>
          )}
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          data-testid="coupon-form"
        >
          <label
            htmlFor="coupon-code-input"
            className="type-label"
            style={{ display: 'block', marginBottom: 'var(--space-1)', fontSize: '0.9rem' }}
          >
            Coupon or Promo Code
          </label>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <input
              id="coupon-code-input"
              type="text"
              className="ui-input"
              placeholder="e.g. SAVE10"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              disabled={disabled || isLoading}
              data-testid="input-coupon"
              style={{ flex: 1, textTransform: 'uppercase' }}
            />
            <button
              type="submit"
              className="ui-button ui-button--secondary"
              disabled={disabled || isLoading || !code.trim()}
              data-testid="apply-coupon-btn"
            >
              {isLoading ? 'Applying...' : 'Apply'}
            </button>
          </div>
          {errorMessage && (
            <div
              className="type-caption"
              role="alert"
              style={{ color: 'var(--color-danger, #b91c1c)', marginTop: 'var(--space-1)' }}
              data-testid="coupon-error"
            >
              {errorMessage}
            </div>
          )}
        </form>
      )}
    </div>
  );
}
