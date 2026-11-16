'use client';

// @shopscale/web features/returns/seller-inspection-modal - Seller return inspection decision modal (T059).
import { useState, useTransition } from 'react';
import type { SellerReturnRequestDto } from '@shopscale/contracts';
import { ActionButton, Card, TextAreaField } from '@/components/ui';
import { inspectReturnRequestAction } from './actions';

export interface SellerInspectionModalProps {
  storeId: string;
  returnRequest: SellerReturnRequestDto;
  onClose: () => void;
  onSuccess: (updated: SellerReturnRequestDto) => void;
}

export function SellerInspectionModal({
  storeId,
  returnRequest,
  onClose,
  onSuccess,
}: SellerInspectionModalProps) {
  const [decision, setDecision] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [restock, setRestock] = useState<boolean>(true);
  const [inspectionNotes, setInspectionNotes] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await inspectReturnRequestAction(storeId, returnRequest.id, {
        decision,
        restock: decision === 'APPROVED' ? restock : false,
        inspectionNotes: inspectionNotes.trim() || undefined,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      onSuccess(result.data);
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="inspection-title"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        padding: '1rem',
      }}
    >
      <Card
        className="ss-form-card"
        style={{
          maxWidth: '520px',
          width: '100%',
          backgroundColor: '#fff',
          borderRadius: '8px',
          padding: '1.5rem',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
        }}
      >
        <header style={{ marginBottom: '1rem' }}>
          <h2 id="inspection-title" style={{ fontSize: '1.25rem', fontWeight: 600 }}>
            Inspect Return Request
          </h2>
          <p className="type-caption" style={{ marginTop: '0.25rem' }}>
            Verify physical condition and make an approval or rejection decision.
          </p>
        </header>

        {/* Item Summary */}
        <div
          style={{
            background: 'var(--color-bg-subtle, #f9fafb)',
            padding: '0.75rem 1rem',
            borderRadius: '6px',
            marginBottom: '1rem',
            border: '1px solid #e5e7eb',
          }}
        >
          <div style={{ fontWeight: 600 }}>{returnRequest.itemTitle}</div>
          <div className="type-caption" style={{ marginTop: '0.25rem' }}>
            SKU: <code>{returnRequest.itemSku}</code> &bull; Quantity: <strong>{returnRequest.qty}</strong>
          </div>
          <div className="type-caption" style={{ marginTop: '0.25rem' }}>
            Reason: <em>{returnRequest.reason}</em>
          </div>
          {returnRequest.customerNotes && (
            <div className="type-caption" style={{ marginTop: '0.25rem', color: '#4b5563' }}>
              Customer notes: &ldquo;{returnRequest.customerNotes}&rdquo;
            </div>
          )}
        </div>

        {error && (
          <p className="ss-error" role="alert" style={{ marginBottom: '1rem' }}>
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1rem' }}>
          <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
            <legend style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.5rem' }}>
              Decision
            </legend>
            <div style={{ display: 'flex', gap: '1.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="decision"
                  value="APPROVED"
                  checked={decision === 'APPROVED'}
                  onChange={() => setDecision('APPROVED')}
                  disabled={isPending}
                />
                <span style={{ fontWeight: 500, color: '#166534' }}>Approve Return</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="decision"
                  value="REJECTED"
                  checked={decision === 'REJECTED'}
                  onChange={() => setDecision('REJECTED')}
                  disabled={isPending}
                />
                <span style={{ fontWeight: 500, color: '#991b1b' }}>Reject Return</span>
              </label>
            </div>
          </fieldset>

          {decision === 'APPROVED' && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 0',
              }}
            >
              <input
                id="restock-checkbox"
                type="checkbox"
                checked={restock}
                onChange={(e) => setRestock(e.target.checked)}
                disabled={isPending}
                style={{ width: '1.1rem', height: '1.1rem', cursor: 'pointer' }}
              />
              <label htmlFor="restock-checkbox" style={{ cursor: 'pointer', fontSize: '0.9rem' }}>
                <strong>Restock Item</strong> (increments inventory by {returnRequest.qty} unit{returnRequest.qty > 1 ? 's' : ''})
              </label>
            </div>
          )}

          <TextAreaField
            label="Inspection notes"
            name="inspection-notes"
            value={inspectionNotes}
            onChange={(val) => setInspectionNotes(val)}
            rows={3}
            hint={
              decision === 'APPROVED'
                ? 'Optional notes regarding condition verification.'
                : 'Reason for rejection (shared with customer).'
            }
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
            <ActionButton
              type="button"
              onClick={onClose}
              disabled={isPending}
              variant="secondary"
            >
              Cancel
            </ActionButton>
            <ActionButton
              type="submit"
              disabled={isPending}
              variant="primary"
            >
              {isPending ? 'Submitting...' : 'Confirm Decision'}
            </ActionButton>
          </div>
        </form>
      </Card>
    </div>
  );
}
