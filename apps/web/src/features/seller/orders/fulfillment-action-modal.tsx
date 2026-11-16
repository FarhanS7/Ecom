'use client';

// @shopscale/web features/seller/orders/fulfillment-action-modal - Seller fulfillment action controls (T057).
// Invariants:
// 1. Guides seller through PENDING -> PACKED -> SHIPPED -> DELIVERED.
// 2. Requires carrier and non-empty trackingRef when dispatching (SHIPPED).
// 3. Displays inline error alert on invalid transition or server rejection.
// 4. Refreshes data dynamically upon state changes.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { SellerSuborderDto } from '@shopscale/contracts';
import { ActionButton, Card, SelectField, Tag, TextField } from '@/components/ui';
import { transitionSuborderAction } from './actions';

export function FulfillmentActionModal({
  storeId,
  suborder,
}: {
  storeId: string;
  suborder: SellerSuborderDto;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Shipping inputs
  const [carrier, setCarrier] = useState<string>('DHL');
  const [trackingRef, setTrackingRef] = useState<string>('');
  const [showShipForm, setShowShipForm] = useState<boolean>(false);

  const currentStatus = suborder.fulfillmentStatus;

  const handlePack = () => {
    setErrorMessage(null);
    startTransition(async () => {
      const result = await transitionSuborderAction(storeId, suborder.id, {
        toStatus: 'PACKED',
      });
      if (!result.ok) {
        setErrorMessage(result.error);
      } else {
        router.refresh();
      }
    });
  };

  const handleShip = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackingRef.trim()) {
      setErrorMessage('Tracking number is required to mark as shipped.');
      return;
    }
    setErrorMessage(null);
    startTransition(async () => {
      const result = await transitionSuborderAction(storeId, suborder.id, {
        toStatus: 'SHIPPED',
        carrier,
        trackingRef: trackingRef.trim(),
      });
      if (!result.ok) {
        setErrorMessage(result.error);
      } else {
        setShowShipForm(false);
        router.refresh();
      }
    });
  };

  const handleDeliver = () => {
    setErrorMessage(null);
    startTransition(async () => {
      const result = await transitionSuborderAction(storeId, suborder.id, {
        toStatus: 'DELIVERED',
      });
      if (!result.ok) {
        setErrorMessage(result.error);
      } else {
        router.refresh();
      }
    });
  };

  return (
    <Card className="ss-fulfillment-actions" data-testid="fulfillment-action-card">
      <h3>Fulfillment Workflow</h3>
      <p className="type-caption text-muted">
        Current Status: <strong>{currentStatus}</strong>
      </p>

      {errorMessage && (
        <div className="ss-error" role="alert" data-testid="fulfillment-error" style={{ margin: 'var(--space-3) 0' }}>
          {errorMessage}
        </div>
      )}

      {/* State 1: PENDING -> Action: Pack Order */}
      {currentStatus === 'PENDING' && (
        <div style={{ marginTop: 'var(--space-4)' }}>
          <p>This suborder is waiting to be packed.</p>
          <ActionButton
            type="button"
            variant="primary"
            onClick={handlePack}
            disabled={isPending}
            data-testid="pack-order-btn"
          >
            {isPending ? 'Packing Order...' : 'Pack Order'}
          </ActionButton>
        </div>
      )}

      {/* State 2: PACKED -> Action: Ship Order with Carrier & Tracking */}
      {currentStatus === 'PACKED' && (
        <div style={{ marginTop: 'var(--space-4)' }}>
          <p>Items have been boxed. Provide tracking details to dispatch shipment.</p>
          {!showShipForm ? (
            <ActionButton
              type="button"
              variant="primary"
              onClick={() => setShowShipForm(true)}
              data-testid="open-ship-form-btn"
            >
              Enter Tracking & Ship
            </ActionButton>
          ) : (
            <form onSubmit={handleShip} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
              <SelectField
                name="carrier"
                label="Carrier"
                value={carrier}
                onChange={setCarrier}
                options={[
                  { value: 'DHL', label: 'DHL Express' },
                  { value: 'FedEx', label: 'FedEx' },
                  { value: 'UPS', label: 'UPS' },
                  { value: 'USPS', label: 'USPS' },
                  { value: 'Other', label: 'Other Carrier' },
                ]}
              />

              <TextField
                name="trackingRef"
                label="Tracking Number"
                value={trackingRef}
                onChange={setTrackingRef}
                required
              />

              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <ActionButton
                  type="submit"
                  variant="primary"
                  disabled={isPending}
                  data-testid="confirm-ship-btn"
                >
                  {isPending ? 'Dispatching...' : 'Confirm Shipment'}
                </ActionButton>
                <ActionButton
                  type="button"
                  variant="secondary"
                  onClick={() => setShowShipForm(false)}
                >
                  Cancel
                </ActionButton>
              </div>
            </form>
          )}
        </div>
      )}

      {/* State 3: SHIPPED -> Action: Mark Delivered */}
      {currentStatus === 'SHIPPED' && (
        <div style={{ marginTop: 'var(--space-4)' }}>
          <p>
            <strong>In Transit:</strong> {suborder.carrier ?? 'Carrier'} &bull;{' '}
            <code>{suborder.trackingRef}</code>
          </p>
          <ActionButton
            type="button"
            variant="primary"
            onClick={handleDeliver}
            disabled={isPending}
            data-testid="mark-delivered-btn"
          >
            {isPending ? 'Marking Delivered...' : 'Mark as Delivered'}
          </ActionButton>
        </div>
      )}

      {/* State 4: DELIVERED (Terminal) */}
      {currentStatus === 'DELIVERED' && (
        <div style={{ marginTop: 'var(--space-4)' }}>
          <Tag tone="positive">Fulfillment Complete</Tag>
          <p className="type-caption text-muted" style={{ marginTop: 'var(--space-1)' }}>
            This suborder has been delivered to the customer.
          </p>
        </div>
      )}

      {/* State 5: CANCELLED (Terminal) */}
      {currentStatus === 'CANCELLED' && (
        <div style={{ marginTop: 'var(--space-4)' }}>
          <Tag tone="accent">Suborder Cancelled</Tag>
          <p className="type-caption text-muted" style={{ marginTop: 'var(--space-1)' }}>
            This suborder was cancelled and cannot be fulfilled.
          </p>
        </div>
      )}
    </Card>
  );
}
