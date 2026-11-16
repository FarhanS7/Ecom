// @shopscale/backend/commerce/fulfillment-fsm - Seller fulfillment finite state machine (T056).
// Invariants:
// 1. Unpaid orders cannot be fulfilled (payment_status must be 'PAID').
// 2. Strict sequential transitions: PENDING -> PACKED -> SHIPPED -> DELIVERED.
// 3. Jumps and backward transitions throw IllegalFulfillmentTransitionError.
// 4. Transitioning to SHIPPED requires non-empty trackingRef.
// 5. Parent order fulfillment status is dynamically derived from all child suborders.

import type { OrderFulfillmentStatus } from './schema.js';
import {
  IllegalFulfillmentTransitionError,
  MissingTrackingRefError,
  OrderNotPaidError,
} from './errors.js';

export type SuborderFulfillmentStatus = 'PENDING' | 'PACKED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
export type TargetSuborderStatus = 'PACKED' | 'SHIPPED' | 'DELIVERED';

export interface ValidateTransitionInput {
  currentStatus: SuborderFulfillmentStatus;
  toStatus: TargetSuborderStatus;
  orderPaymentStatus: string;
  trackingRef?: string | undefined;
  carrier?: string | undefined;
}

export interface TransitionValidationResult {
  valid: boolean;
  isNoop: boolean;
}

/**
 * Validates a seller fulfillment transition against domain business rules.
 */
export function validateFulfillmentTransition(
  input: ValidateTransitionInput,
): TransitionValidationResult {
  const { currentStatus, toStatus, orderPaymentStatus, trackingRef } = input;

  // 1. Order must be PAID
  if (orderPaymentStatus !== 'PAID') {
    throw new OrderNotPaidError(orderPaymentStatus);
  }

  // 2. Idempotent check: if already at target status, return isNoop
  if (currentStatus === toStatus) {
    return { valid: true, isNoop: true };
  }

  // 3. Cancelled suborders cannot be transitioned
  if (currentStatus === 'CANCELLED') {
    throw new IllegalFulfillmentTransitionError(
      currentStatus,
      toStatus,
      `Cannot transition suborder in CANCELLED status to ${toStatus}.`,
    );
  }

  // 4. Delivered suborders cannot be transitioned
  if (currentStatus === 'DELIVERED') {
    throw new IllegalFulfillmentTransitionError(
      currentStatus,
      toStatus,
      `Cannot transition suborder in terminal DELIVERED status to ${toStatus}.`,
    );
  }

  // 5. Enforce strict sequential transitions:
  //    PENDING -> PACKED
  //    PACKED -> SHIPPED
  //    SHIPPED -> DELIVERED
  const legalNext: Record<SuborderFulfillmentStatus, TargetSuborderStatus | null> = {
    PENDING: 'PACKED',
    PACKED: 'SHIPPED',
    SHIPPED: 'DELIVERED',
    DELIVERED: null,
    CANCELLED: null,
  };

  const expectedNext = legalNext[currentStatus];
  if (expectedNext !== toStatus) {
    throw new IllegalFulfillmentTransitionError(
      currentStatus,
      toStatus,
      `Illegal transition from '${currentStatus}' to '${toStatus}'. Expected next status is '${expectedNext}'.`,
    );
  }

  // 6. SHIPPED transition requires trackingRef
  if (toStatus === 'SHIPPED') {
    if (!trackingRef || trackingRef.trim() === '') {
      throw new MissingTrackingRefError('trackingRef is required when transitioning suborder to SHIPPED.');
    }
  }

  return { valid: true, isNoop: false };
}

/**
 * Derives parent order fulfillment status dynamically from an array of child suborder statuses.
 *
 * Rules:
 * - If no suborders or all suborders are CANCELLED -> CANCELLED
 * - If all non-cancelled suborders are DELIVERED -> DELIVERED
 * - If all non-cancelled suborders are SHIPPED -> SHIPPED
 * - If all non-cancelled suborders are DELIVERED or SHIPPED (with at least one of each) -> PARTIALLY_DELIVERED
 * - If at least one non-cancelled suborder is SHIPPED or DELIVERED, and at least one is PENDING or PACKED -> PARTIALLY_SHIPPED
 * - If at least one non-cancelled suborder is PACKED and none are SHIPPED or DELIVERED -> PACKED
 * - If all non-cancelled suborders are PENDING -> PENDING
 */
export function deriveParentFulfillmentStatus(
  suborderStatuses: string[],
): OrderFulfillmentStatus {
  if (suborderStatuses.length === 0) {
    return 'PENDING';
  }

  const active = suborderStatuses.filter((s) => s !== 'CANCELLED');
  if (active.length === 0) {
    return 'CANCELLED';
  }

  const allDelivered = active.every((s) => s === 'DELIVERED');
  if (allDelivered) {
    return 'DELIVERED';
  }

  const allShipped = active.every((s) => s === 'SHIPPED');
  if (allShipped) {
    return 'SHIPPED';
  }

  const allShippedOrDelivered = active.every((s) => s === 'SHIPPED' || s === 'DELIVERED');
  if (allShippedOrDelivered) {
    return 'PARTIALLY_DELIVERED';
  }

  const anyShippedOrDelivered = active.some((s) => s === 'SHIPPED' || s === 'DELIVERED');
  if (anyShippedOrDelivered) {
    return 'PARTIALLY_SHIPPED';
  }

  const anyPacked = active.some((s) => s === 'PACKED');
  if (anyPacked) {
    return 'PACKED';
  }

  return 'PENDING';
}
