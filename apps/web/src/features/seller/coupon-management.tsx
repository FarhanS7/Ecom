'use client';

// @shopscale/web features/seller/coupon-management - Seller promotional coupon management interface (OR-9 / T063).

import { useState } from 'react';
import type { CouponDto } from '@shopscale/contracts';
import { Card, PrimaryButton } from '@/components/ui';
import { formatPrice } from '@/lib/price';

export interface CouponManagementProps {
  storeId: string;
  initialCoupons?: CouponDto[] | undefined;
}

export function CouponManagement({ storeId, initialCoupons = [] }: CouponManagementProps) {
  const [coupons, setCoupons] = useState<CouponDto[]>(initialCoupons);
  const [code, setCode] = useState('');
  const [kind, setKind] = useState<'PERCENT' | 'FIXED'>('PERCENT');
  const [value, setValue] = useState('10');
  const [endsAt, setEndsAt] = useState(() => {
    const nextMonth = new Date();
    nextMonth.setDate(nextMonth.getDate() + 30);
    return nextMonth.toISOString().split('T')[0]!;
  });
  const [globalLimit, setGlobalLimit] = useState('0');
  const [perUserLimit, setPerUserLimit] = useState('1');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSuccessMessage(null);

    const trimmedCode = code.trim().toUpperCase();
    if (!trimmedCode) {
      setFormError('Coupon code is required.');
      return;
    }

    const numValue = Number.parseInt(value, 10);
    if (Number.isNaN(numValue) || numValue <= 0) {
      setFormError('Value must be a positive integer.');
      return;
    }

    if (kind === 'PERCENT' && numValue > 100) {
      setFormError('Percentage coupon cannot exceed 100%.');
      return;
    }

    const numGlobalLimit = Number.parseInt(globalLimit, 10) || 0;
    const numPerUserLimit = Number.parseInt(perUserLimit, 10) || 1;

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/v1/seller/stores/${storeId}/coupons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: trimmedCode,
          kind,
          value: kind === 'PERCENT' ? numValue : numValue * 100, // convert dollars to cents if fixed
          endsAt: new Date(`${endsAt}T23:59:59.999Z`).toISOString(),
          globalLimit: numGlobalLimit,
          perUserLimit: numPerUserLimit,
        }),
      });

      if (!res.ok) {
        const errorData = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(errorData.message ?? `Failed to create coupon (${res.status})`);
      }

      const newCoupon = (await res.json()) as CouponDto;
      setCoupons((prev) => [newCoupon, ...prev]);
      setSuccessMessage(`Coupon '${newCoupon.code}' created successfully.`);
      setCode('');
      setValue(kind === 'PERCENT' ? '10' : '5');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create coupon.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="ss-coupon-management" data-testid="coupon-management">
      <Card style={{ marginBottom: 'var(--space-6)', padding: 'var(--space-6)' }}>
        <h2 className="type-h3" style={{ marginBottom: 'var(--space-4)' }}>
          Create Store Promotional Coupon
        </h2>

        {successMessage && (
          <div
            className="ss-notice ss-notice--success"
            role="status"
            style={{
              padding: 'var(--space-3)',
              backgroundColor: 'var(--color-success-bg, #ecfdf5)',
              border: '1px solid var(--color-success-border, #a7f3d0)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--color-success-text, #065f46)',
              marginBottom: 'var(--space-4)',
            }}
            data-testid="coupon-success-alert"
          >
            {successMessage}
          </div>
        )}

        {formError && (
          <div
            className="ss-notice ss-notice--danger"
            role="alert"
            style={{
              padding: 'var(--space-3)',
              backgroundColor: 'var(--color-danger-bg, #fef2f2)',
              border: '1px solid var(--color-danger-border, #fecaca)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--color-danger, #b91c1c)',
              marginBottom: 'var(--space-4)',
            }}
            data-testid="coupon-form-error"
          >
            {formError}
          </div>
        )}

        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          data-testid="create-coupon-form"
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)' }}>
            <div>
              <label htmlFor="create-coupon-code" className="type-label" style={{ display: 'block', marginBottom: 'var(--space-1)' }}>
                Coupon Code *
              </label>
              <input
                id="create-coupon-code"
                type="text"
                className="ui-input"
                placeholder="e.g. FLASH20"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                disabled={isSubmitting}
                data-testid="input-new-coupon-code"
                required
              />
            </div>

            <div>
              <label htmlFor="create-coupon-kind" className="type-label" style={{ display: 'block', marginBottom: 'var(--space-1)' }}>
                Discount Type *
              </label>
              <select
                id="create-coupon-kind"
                className="ui-input"
                value={kind}
                onChange={(e) => {
                  const newKind = e.target.value as 'PERCENT' | 'FIXED';
                  setKind(newKind);
                  setValue(newKind === 'PERCENT' ? '10' : '5');
                }}
                disabled={isSubmitting}
                data-testid="select-coupon-kind"
              >
                <option value="PERCENT">Percentage Discount (%)</option>
                <option value="FIXED">Fixed Amount Discount ($)</option>
              </select>
            </div>

            <div>
              <label htmlFor="create-coupon-value" className="type-label" style={{ display: 'block', marginBottom: 'var(--space-1)' }}>
                {kind === 'PERCENT' ? 'Discount Percentage (%) *' : 'Discount Dollars ($) *'}
              </label>
              <input
                id="create-coupon-value"
                type="number"
                min="1"
                max={kind === 'PERCENT' ? '100' : '9999'}
                className="ui-input"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                disabled={isSubmitting}
                data-testid="input-coupon-value"
                required
              />
            </div>

            <div>
              <label htmlFor="create-coupon-ends" className="type-label" style={{ display: 'block', marginBottom: 'var(--space-1)' }}>
                Expiration Date *
              </label>
              <input
                id="create-coupon-ends"
                type="date"
                className="ui-input"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                disabled={isSubmitting}
                data-testid="input-coupon-ends-at"
                required
              />
            </div>

            <div>
              <label htmlFor="create-coupon-global-limit" className="type-label" style={{ display: 'block', marginBottom: 'var(--space-1)' }}>
                Global Usage Limit (0 = unlimited)
              </label>
              <input
                id="create-coupon-global-limit"
                type="number"
                min="0"
                className="ui-input"
                value={globalLimit}
                onChange={(e) => setGlobalLimit(e.target.value)}
                disabled={isSubmitting}
                data-testid="input-coupon-global-limit"
              />
            </div>

            <div>
              <label htmlFor="create-coupon-per-user-limit" className="type-label" style={{ display: 'block', marginBottom: 'var(--space-1)' }}>
                Per-User Limit
              </label>
              <input
                id="create-coupon-per-user-limit"
                type="number"
                min="1"
                className="ui-input"
                value={perUserLimit}
                onChange={(e) => setPerUserLimit(e.target.value)}
                disabled={isSubmitting}
                data-testid="input-coupon-per-user-limit"
              />
            </div>
          </div>

          <div style={{ marginTop: 'var(--space-4)' }}>
            <PrimaryButton type="submit" disabled={isSubmitting || !code.trim()} data-testid="btn-create-coupon">
              {isSubmitting ? 'Creating...' : 'Create Promotional Coupon'}
            </PrimaryButton>
          </div>
        </form>
      </Card>

      <Card style={{ padding: 'var(--space-6)' }}>
        <h2 className="type-h3" style={{ marginBottom: 'var(--space-4)' }}>
          Active & Past Coupons ({coupons.length})
        </h2>

        {coupons.length === 0 ? (
          <div className="ss-empty-state" data-testid="coupons-empty-state" style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
            <p className="type-body" style={{ color: 'var(--text-secondary)' }}>
              No coupons created yet. Author your first promotional discount above!
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="ss-table" style={{ width: '100%', borderCollapse: 'collapse' }} data-testid="coupon-management-table">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left' }}>
                  <th style={{ padding: 'var(--space-3)' }}>Code</th>
                  <th style={{ padding: 'var(--space-3)' }}>Type</th>
                  <th style={{ padding: 'var(--space-3)' }}>Discount</th>
                  <th style={{ padding: 'var(--space-3)' }}>Redeemed / Limit</th>
                  <th style={{ padding: 'var(--space-3)' }}>Per User</th>
                  <th style={{ padding: 'var(--space-3)' }}>Expires</th>
                  <th style={{ padding: 'var(--space-3)' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {coupons.map((coupon) => (
                  <tr
                    key={coupon.id}
                    style={{ borderBottom: '1px solid var(--border-subtle)' }}
                    data-testid={`coupon-row-${coupon.code}`}
                  >
                    <td style={{ padding: 'var(--space-3)', fontWeight: 600 }}>
                      <code>{coupon.code}</code>
                    </td>
                    <td style={{ padding: 'var(--space-3)' }}>
                      <span className="type-caption">
                        {coupon.kind === 'PERCENT' ? 'Percentage' : 'Fixed Amount'}
                      </span>
                    </td>
                    <td style={{ padding: 'var(--space-3)', fontWeight: 500 }}>
                      {coupon.kind === 'PERCENT'
                        ? `${coupon.value}%`
                        : formatPrice(coupon.value, 'USD')}
                    </td>
                    <td style={{ padding: 'var(--space-3)' }}>
                      {coupon.redeemedCount} / {coupon.globalLimit === 0 ? '∞' : coupon.globalLimit}
                    </td>
                    <td style={{ padding: 'var(--space-3)' }}>
                      {coupon.perUserLimit}
                    </td>
                    <td style={{ padding: 'var(--space-3)' }} className="type-caption">
                      {new Date(coupon.endsAt).toLocaleDateString()}
                    </td>
                    <td style={{ padding: 'var(--space-3)' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          backgroundColor:
                            coupon.status === 'active'
                              ? 'var(--color-success-bg, #ecfdf5)'
                              : 'var(--color-danger-bg, #fef2f2)',
                          color:
                            coupon.status === 'active'
                              ? 'var(--color-success-text, #065f46)'
                              : 'var(--color-danger, #b91c1c)',
                        }}
                      >
                        {coupon.status.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
