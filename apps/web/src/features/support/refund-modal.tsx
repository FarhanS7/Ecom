'use client';

// @shopscale/web features/support/refund-modal - Support discretionary refund modal (T069).
// Invariants:
// 1. Client-side guard prevents submitting refund > $200.00 (20,000 cents).
// 2. Reason is strictly mandatory (minimum 3 characters).
// 3. Handles server rejection gracefully, showing POLICY_LIMIT_EXCEEDED alerts.

import { useState } from 'react';
import { Card } from '@/components/ui';
import { issueSupportRefundAction } from './actions';

export interface SupportRefundModalProps {
  orderId: string;
  isOpen: boolean;
  onClose: () => void;
  orderTotalCents?: number | undefined;
  remainingCents?: number | undefined;
  onSuccess?: (refundId: string) => void | undefined;
}

export const SUPPORT_POLICY_CAP_CENTS = 20000; // $200.00

export function SupportRefundModal({
  orderId,
  isOpen,
  onClose,
  _orderTotalCents,
  remainingCents,
  onSuccess,
}: SupportRefundModalProps & { _orderTotalCents?: number | undefined }) {
  const [amountInput, setAmountInput] = useState<string>('50.00');
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const parsedAmountCents = Math.round(parseFloat(amountInput || '0') * 100);
  const isOverCap = parsedAmountCents > SUPPORT_POLICY_CAP_CENTS;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (isNaN(parsedAmountCents) || parsedAmountCents <= 0) {
      setErrorMessage('Please enter a valid positive refund amount.');
      return;
    }

    if (parsedAmountCents > SUPPORT_POLICY_CAP_CENTS) {
      setErrorMessage('Support policy limit is $200.00 (20,000 cents). Executive escalation required for larger amounts.');
      return;
    }

    if (remainingCents !== undefined && parsedAmountCents > remainingCents) {
      setErrorMessage(`Refund amount exceeds remaining refundable balance of $${(remainingCents / 100).toFixed(2)}.`);
      return;
    }

    if (reason.trim().length < 3) {
      setErrorMessage('A reason with at least 3 characters is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await issueSupportRefundAction({
        orderId,
        amountCents: parsedAmountCents,
        reason: reason.trim(),
      });

      if (!res.success) {
        setErrorMessage(res.message || 'Refund processing failed.');
      } else {
        setSuccessMessage('Refund successfully issued!');
        if (onSuccess && res.refundId) {
          onSuccess(res.refundId);
        }
        setTimeout(() => {
          onClose();
        }, 1200);
      }
    } catch {
      setErrorMessage('An unexpected error occurred while communicating with the server.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className="ss-modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 'var(--space-4)',
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="support-refund-title"
    >
      <Card
        className="ss-modal-content"
        style={{
          width: '100%',
          maxWidth: '480px',
          padding: 'var(--space-6)',
          backgroundColor: 'var(--color-surface, #ffffff)',
          borderRadius: 'var(--radius, 8px)',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
          <h2 id="support-refund-title" className="type-h3" style={{ margin: 0 }}>
            Issue Support Refund
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close refund dialog"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1.25rem',
              color: 'var(--text-secondary, #6b7280)',
            }}
          >
            ✕
          </button>
        </div>

        <p className="type-caption" style={{ color: 'var(--text-secondary, #6b7280)', marginBottom: 'var(--space-4)' }}>
          Order ID: <code style={{ fontSize: '0.85em' }}>{orderId}</code>
          {remainingCents !== undefined && ` • Remaining balance: $${(remainingCents / 100).toFixed(2)}`}
        </p>

        {errorMessage && (
          <div
            role="alert"
            data-testid="refund-error-banner"
            style={{
              padding: 'var(--space-3)',
              backgroundColor: '#fee2e2',
              color: '#991b1b',
              borderRadius: 'var(--radius, 4px)',
              fontSize: '0.875rem',
              marginBottom: 'var(--space-4)',
            }}
          >
            {errorMessage}
          </div>
        )}

        {successMessage && (
          <div
            role="status"
            data-testid="refund-success-banner"
            style={{
              padding: 'var(--space-3)',
              backgroundColor: '#dcfce7',
              color: '#166534',
              borderRadius: 'var(--radius, 4px)',
              fontSize: '0.875rem',
              marginBottom: 'var(--space-4)',
            }}
          >
            {successMessage}
          </div>
        )}

        <form onSubmit={(e) => { void handleSubmit(e); }}>
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <label
              htmlFor="refund-amount-input"
              className="type-body-strong"
              style={{ display: 'block', marginBottom: 'var(--space-1)', fontSize: '0.875rem' }}
            >
              Refund Amount ($ USD)
            </label>
            <input
              id="refund-amount-input"
              type="number"
              step="0.01"
              min="0.01"
              max="200.00"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              disabled={isSubmitting}
              data-testid="refund-amount-input"
              className="ss-input"
              style={{
                width: '100%',
                padding: 'var(--space-2)',
                borderRadius: 'var(--radius, 4px)',
                border: '1px solid var(--border-color, #d1d5db)',
                fontFamily: 'inherit',
                fontSize: '0.875rem',
              }}
            />
            <span
              className="type-caption"
              style={{
                display: 'block',
                marginTop: 'var(--space-1)',
                color: isOverCap ? '#dc2626' : 'var(--text-secondary, #6b7280)',
                fontSize: '0.75rem',
              }}
            >
              Support discretionary cap: $200.00 max
            </span>
            {isOverCap && (
              <div
                role="alert"
                data-testid="refund-cap-warning"
                style={{
                  padding: 'var(--space-2) var(--space-3)',
                  backgroundColor: '#fee2e2',
                  color: '#991b1b',
                  borderRadius: 'var(--radius, 4px)',
                  fontSize: '0.8125rem',
                  marginTop: 'var(--space-2)',
                }}
              >
                Support policy limit is $200.00 (20,000 cents). Executive escalation required for larger amounts.
              </div>
            )}
          </div>

          <div style={{ marginBottom: 'var(--space-6)' }}>
            <label
              htmlFor="refund-reason-input"
              className="type-body-strong"
              style={{ display: 'block', marginBottom: 'var(--space-1)', fontSize: '0.875rem' }}
            >
              Dispute / Refund Reason (Required)
            </label>
            <textarea
              id="refund-reason-input"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Package arrived with damaged zipper; customer satisfied with partial resolution."
              disabled={isSubmitting}
              data-testid="refund-reason-input"
              style={{
                width: '100%',
                padding: 'var(--space-2)',
                borderRadius: 'var(--radius, 4px)',
                border: '1px solid var(--border-color, #d1d5db)',
                fontFamily: 'inherit',
                fontSize: '0.875rem',
                resize: 'vertical',
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
            <button
              type="button"
              className="ss-btn ss-btn-secondary"
              onClick={onClose}
              disabled={isSubmitting}
              style={{
                padding: 'var(--space-2) var(--space-4)',
                borderRadius: 'var(--radius, 4px)',
                border: '1px solid var(--border-color, #d1d5db)',
                background: 'transparent',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="ss-btn ss-btn-primary"
              disabled={isSubmitting || parsedAmountCents > SUPPORT_POLICY_CAP_CENTS}
              data-testid="submit-refund-button"
              style={{
                padding: 'var(--space-2) var(--space-4)',
                borderRadius: 'var(--radius, 4px)',
                border: 'none',
                background: 'var(--color-primary, #0070f3)',
                color: '#ffffff',
                cursor: isSubmitting || parsedAmountCents > SUPPORT_POLICY_CAP_CENTS ? 'not-allowed' : 'pointer',
              }}
            >
              {isSubmitting ? 'Processing...' : 'Confirm Refund'}
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
