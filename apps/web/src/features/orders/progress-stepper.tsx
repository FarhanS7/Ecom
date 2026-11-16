'use client';

// @shopscale/web features/orders/progress-stepper - Visual Order Progress Stepper (T057).
// Invariants:
// 1. Renders horizontal progression: Placed -> Paid -> Packed -> Shipped -> Delivered.
// 2. Highlights current active step with aria-current="step" and accessible status descriptions.
// 3. Handles terminal non-happy states: FAILED, REFUNDED, and CANCELLED.
// 4. Displays carrier and tracking number when present.

import { Tag } from '@/components/ui';

export interface OrderProgressStepperProps {
  paymentStatus: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
  fulfillmentStatus:
    | 'PENDING'
    | 'PACKED'
    | 'PARTIALLY_SHIPPED'
    | 'SHIPPED'
    | 'PARTIALLY_DELIVERED'
    | 'DELIVERED'
    | 'CANCELLED';
  trackingRef?: string | null | undefined;
  carrier?: string | null | undefined;
  shippedAt?: string | null | undefined;
  deliveredAt?: string | null | undefined;
}

interface StepDefinition {
  id: string;
  label: string;
  description: string;
}

const CANONICAL_STEPS: StepDefinition[] = [
  { id: 'placed', label: 'Placed', description: 'Order created' },
  { id: 'paid', label: 'Paid', description: 'Payment confirmed' },
  { id: 'packed', label: 'Packed', description: 'Items boxed' },
  { id: 'shipped', label: 'Shipped', description: 'In transit' },
  { id: 'delivered', label: 'Delivered', description: 'Delivered to recipient' },
];

export function OrderProgressStepper({
  paymentStatus,
  fulfillmentStatus,
  trackingRef,
  carrier,
  shippedAt,
  deliveredAt,
}: OrderProgressStepperProps) {
  // Determine active step index (0-based)
  // Step 0: Placed (always done once order exists)
  // Step 1: Paid
  // Step 2: Packed
  // Step 3: Shipped
  // Step 4: Delivered
  let activeIndex = 0;

  if (paymentStatus === 'PAID') {
    activeIndex = 1;
    if (fulfillmentStatus === 'PACKED') {
      activeIndex = 2;
    } else if (fulfillmentStatus === 'PARTIALLY_SHIPPED' || fulfillmentStatus === 'SHIPPED') {
      activeIndex = 3;
    } else if (fulfillmentStatus === 'PARTIALLY_DELIVERED' || fulfillmentStatus === 'DELIVERED') {
      activeIndex = 4;
    }
  }

  const isFailed = paymentStatus === 'FAILED';
  const isRefunded = paymentStatus === 'REFUNDED';
  const isCancelled = fulfillmentStatus === 'CANCELLED';

  return (
    <div className="ss-order-stepper" data-testid="order-progress-stepper">
      {/* Special status callouts if terminal non-happy state */}
      {isFailed && (
        <div className="ss-order-stepper__alert ss-error" role="alert" data-testid="status-failed">
          <Tag tone="accent">Payment Failed</Tag>
          <p>Payment was unsuccessful. This order cannot be fulfilled.</p>
        </div>
      )}
      {isRefunded && (
        <div className="ss-order-stepper__alert" role="status" data-testid="status-refunded">
          <Tag tone="warning">Refunded</Tag>
          <p>Payment for this order has been refunded.</p>
        </div>
      )}
      {isCancelled && (
        <div className="ss-order-stepper__alert ss-error" role="status" data-testid="status-cancelled">
          <Tag tone="accent">Order Cancelled</Tag>
          <p>This order has been cancelled.</p>
        </div>
      )}

      {/* Tracking info badge when shipped */}
      {trackingRef && (
        <div className="ss-order-stepper__tracking" data-testid="tracking-info">
          <Tag tone="positive">Tracking Details</Tag>
          <p className="type-caption">
            <strong>Carrier:</strong> {carrier ?? 'Standard Shipping'} &bull;{' '}
            <strong>Tracking Number:</strong> <code data-testid="tracking-ref">{trackingRef}</code>
          </p>
          {shippedAt && (
            <p className="type-caption text-muted">
              Dispatched: {new Date(shippedAt).toLocaleString()}
            </p>
          )}
          {deliveredAt && (
            <p className="type-caption text-muted">
              Delivered: {new Date(deliveredAt).toLocaleString()}
            </p>
          )}
        </div>
      )}

      <ol className="ss-stepper-list" aria-label="Order fulfillment progress">
        {CANONICAL_STEPS.map((step, idx) => {
          let state: 'completed' | 'current' | 'upcoming' = 'upcoming';

          if (!isFailed && !isRefunded && !isCancelled) {
            if (idx < activeIndex) {
              state = 'completed';
            } else if (idx === activeIndex) {
              state = 'current';
            }
          } else if (idx === 0) {
            state = 'completed';
          }

          const isCurrent = state === 'current';
          const isDone = state === 'completed';

          return (
            <li
              key={step.id}
              className={`ss-stepper-step ss-stepper-step--${state}`}
              aria-current={isCurrent ? 'step' : undefined}
              data-testid={`stepper-step-${step.id}`}
              data-state={state}
            >
              <div className="ss-stepper-step__marker" aria-hidden="true">
                {isDone ? '✓' : idx + 1}
              </div>
              <div className="ss-stepper-step__content">
                <span className="ss-stepper-step__label">{step.label}</span>
                <span className="ss-stepper-step__desc type-caption">{step.description}</span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
