'use client';

// @shopscale/web features/returns/return-form - Customer return request form (T059).
import { useId, useState, useTransition } from 'react';
import type { CustomerOrderDetailDto, ReturnRequestDto } from '@shopscale/contracts';
import { ActionButton, Card, SelectField, Tag, TextAreaField, TextField } from '@/components/ui';
import { RETURN_REASONS, ReturnReasonSelector } from './return-reason-selector';
import { createReturnRequestAction } from './actions';

export interface ReturnFormProps {
  order: CustomerOrderDetailDto;
  existingReturns: ReturnRequestDto[];
}

export function ReturnForm({ order, existingReturns: initialReturns }: ReturnFormProps) {
  const formId = useId();
  const [returns, setReturns] = useState<ReturnRequestDto[]>(initialReturns);
  const [selectedItemId, setSelectedItemId] = useState<string>(order.items[0]?.id ?? '');
  const [qty, setQty] = useState<string>('1');
  const [reason, setReason] = useState<string>(RETURN_REASONS[0]);
  const [notes, setNotes] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isDelivered = order.fulfillmentStatus === 'DELIVERED';

  // Compute remaining returnable quantity for each item
  const itemReturnInfo = order.items.map((item) => {
    const activeForThisItem = returns.filter(
      (r) => r.orderItemId === item.id && (r.status === 'PENDING_INSPECTION' || r.status === 'APPROVED'),
    );
    const usedQty = activeForThisItem.reduce((sum, r) => sum + r.qty, 0);
    const returnableQty = Math.max(0, item.qty - usedQty);
    return {
      item,
      usedQty,
      returnableQty,
    };
  });

  const selectedItemInfo = itemReturnInfo.find((i) => i.item.id === selectedItemId);
  const maxQty = selectedItemInfo ? selectedItemInfo.returnableQty : 0;

  const itemOptions = itemReturnInfo
    .filter((info) => info.returnableQty > 0)
    .map((info) => ({
      value: info.item.id,
      label: `${info.item.title} (SKU: ${info.item.sku}) — ${info.returnableQty} available to return`,
    }));

  const allItemsReturned = itemOptions.length === 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const parsedQty = parseInt(qty, 10);
    if (isNaN(parsedQty) || parsedQty <= 0) {
      setError('Please enter a valid quantity of 1 or more.');
      return;
    }
    if (parsedQty > maxQty) {
      setError(`Cannot return more than ${maxQty} unit(s) for this item.`);
      return;
    }

    startTransition(async () => {
      const result = await createReturnRequestAction(order.id, {
        orderItemId: selectedItemId,
        qty: parsedQty,
        reason,
        customerNotes: notes.trim() || undefined,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setReturns((prev) => [result.data, ...prev]);
      setSuccess(`Return request for ${parsedQty} item(s) submitted successfully.`);
      setNotes('');
      setQty('1');
    });
  };

  return (
    <div className="ss-return-flow">
      {!isDelivered && (
        <Card className="ss-form-card" style={{ marginBottom: '1.5rem' }}>
          <p className="ss-error" role="alert">
            <strong>Order not yet delivered:</strong> Return requests can only be initiated on orders
            that have been fully delivered. (Current fulfillment status: <code>{order.fulfillmentStatus}</code>).
          </p>
        </Card>
      )}

      {isDelivered && (
        <Card className="ss-form-card" style={{ marginBottom: '2rem' }}>
          <header style={{ marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Start a Return</h2>
            <p className="type-caption">
              Select an item, reason, and quantity to initiate a return request. Our team will review
              your request upon receipt of the items.
            </p>
          </header>

          {error && (
            <p className="ss-error" role="alert" style={{ marginBottom: '1rem' }}>
              {error}
            </p>
          )}

          {success && (
            <div
              style={{
                background: 'var(--color-bg-subtle, #f0fdf4)',
                color: 'var(--color-fg-positive, #166534)',
                padding: '0.75rem 1rem',
                borderRadius: '6px',
                marginBottom: '1rem',
                border: '1px solid #bbf7d0',
              }}
            >
              {success}
            </div>
          )}

          {allItemsReturned ? (
            <p className="type-caption" style={{ fontStyle: 'italic' }}>
              All eligible items in this order already have active or approved return requests.
            </p>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1rem' }}>
              <SelectField
                label="Item to return"
                name={`item-${formId}`}
                value={selectedItemId}
                onChange={(val) => {
                  setSelectedItemId(val);
                  setQty('1');
                }}
                options={itemOptions}
              />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem' }}>
                <TextField
                  label={`Quantity (max ${maxQty})`}
                  name={`qty-${formId}`}
                  type="number"
                  value={qty}
                  onChange={(val) => setQty(val)}
                  required
                />
                <ReturnReasonSelector
                  value={reason}
                  onChange={(val) => setReason(val)}
                />
              </div>

              <TextAreaField
                label="Customer notes (optional)"
                name={`notes-${formId}`}
                value={notes}
                onChange={(val) => setNotes(val)}
                rows={3}
                hint="Describe any specific defects, damage, or concerns."
              />

              <div style={{ marginTop: '0.5rem' }}>
                <ActionButton
                  type="submit"
                  disabled={isPending || maxQty === 0}
                  variant="primary"
                >
                  {isPending ? 'Submitting...' : 'Submit Return Request'}
                </ActionButton>
              </div>
            </form>
          )}
        </Card>
      )}

      {returns.length > 0 && (
        <Card className="ss-form-card">
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem' }}>
            Submitted Return Requests ({returns.length})
          </h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '1rem' }}>
            {returns.map((ret) => {
              const matchedItem = order.items.find((i) => i.id === ret.orderItemId);
              let tone: 'default' | 'positive' | 'warning' = 'default';
              if (ret.status === 'PENDING_INSPECTION') tone = 'warning';
              if (ret.status === 'APPROVED') tone = 'positive';

              return (
                <li
                  key={ret.id}
                  style={{
                    border: '1px solid var(--color-border, #e5e7eb)',
                    borderRadius: '6px',
                    padding: '1rem',
                    background: 'var(--color-bg-surface, #ffffff)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong>{matchedItem?.title ?? 'Order Item'}</strong>
                    <Tag tone={tone}>{ret.status.replace('_', ' ')}</Tag>
                  </div>
                  <p className="type-caption" style={{ marginTop: '0.25rem' }}>
                    Quantity: <strong>{ret.qty}</strong> &bull; Reason: <em>{ret.reason}</em>
                  </p>
                  {ret.customerNotes && (
                    <p className="type-caption" style={{ marginTop: '0.25rem', color: '#4b5563' }}>
                      Notes: {ret.customerNotes}
                    </p>
                  )}
                  {ret.inspectionNotes && (
                    <p
                      className="type-caption"
                      style={{
                        marginTop: '0.5rem',
                        padding: '0.5rem',
                        borderRadius: '4px',
                        background: '#f9fafb',
                      }}
                    >
                      Seller feedback: {ret.inspectionNotes}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
