// packages/backend/src/commerce/fulfillment-fsm.test.ts - Unit tests for seller fulfillment FSM (T056).

import { describe, expect, it } from 'vitest';
import {
  deriveParentFulfillmentStatus,
  validateFulfillmentTransition,
} from './fulfillment-fsm.js';
import {
  IllegalFulfillmentTransitionError,
  MissingTrackingRefError,
  OrderNotPaidError,
} from './errors.js';

describe('Seller Fulfillment FSM (T056 Unit Tests)', () => {
  describe('validateFulfillmentTransition', () => {
    it('throws OrderNotPaidError when parent order is not PAID', () => {
      expect(() =>
        validateFulfillmentTransition({
          currentStatus: 'PENDING',
          toStatus: 'PACKED',
          orderPaymentStatus: 'PENDING',
        }),
      ).toThrow(OrderNotPaidError);

      expect(() =>
        validateFulfillmentTransition({
          currentStatus: 'PACKED',
          toStatus: 'SHIPPED',
          orderPaymentStatus: 'FAILED',
          trackingRef: 'TRACK123',
        }),
      ).toThrow(OrderNotPaidError);

      expect(() =>
        validateFulfillmentTransition({
          currentStatus: 'SHIPPED',
          toStatus: 'DELIVERED',
          orderPaymentStatus: 'REFUNDED',
        }),
      ).toThrow(OrderNotPaidError);
    });

    it('returns isNoop: true when transitioning to current status (idempotency)', () => {
      const result = validateFulfillmentTransition({
        currentStatus: 'PACKED',
        toStatus: 'PACKED',
        orderPaymentStatus: 'PAID',
      });
      expect(result).toEqual({ valid: true, isNoop: true });
    });

    it('allows legal sequential transitions when order is PAID', () => {
      // 1. PENDING -> PACKED
      const packedResult = validateFulfillmentTransition({
        currentStatus: 'PENDING',
        toStatus: 'PACKED',
        orderPaymentStatus: 'PAID',
      });
      expect(packedResult).toEqual({ valid: true, isNoop: false });

      // 2. PACKED -> SHIPPED
      const shippedResult = validateFulfillmentTransition({
        currentStatus: 'PACKED',
        toStatus: 'SHIPPED',
        orderPaymentStatus: 'PAID',
        trackingRef: 'TRACK-987654',
        carrier: 'FedEx',
      });
      expect(shippedResult).toEqual({ valid: true, isNoop: false });

      // 3. SHIPPED -> DELIVERED
      const deliveredResult = validateFulfillmentTransition({
        currentStatus: 'SHIPPED',
        toStatus: 'DELIVERED',
        orderPaymentStatus: 'PAID',
      });
      expect(deliveredResult).toEqual({ valid: true, isNoop: false });
    });

    it('rejects jumping steps directly', () => {
      // PENDING -> SHIPPED
      expect(() =>
        validateFulfillmentTransition({
          currentStatus: 'PENDING',
          toStatus: 'SHIPPED',
          orderPaymentStatus: 'PAID',
          trackingRef: 'TRACK-123',
        }),
      ).toThrow(IllegalFulfillmentTransitionError);

      // PENDING -> DELIVERED
      expect(() =>
        validateFulfillmentTransition({
          currentStatus: 'PENDING',
          toStatus: 'DELIVERED',
          orderPaymentStatus: 'PAID',
        }),
      ).toThrow(IllegalFulfillmentTransitionError);

      // PACKED -> DELIVERED
      expect(() =>
        validateFulfillmentTransition({
          currentStatus: 'PACKED',
          toStatus: 'DELIVERED',
          orderPaymentStatus: 'PAID',
        }),
      ).toThrow(IllegalFulfillmentTransitionError);
    });

    it('rejects backwards transitions', () => {
      // SHIPPED -> PACKED
      expect(() =>
        validateFulfillmentTransition({
          currentStatus: 'SHIPPED',
          toStatus: 'PACKED',
          orderPaymentStatus: 'PAID',
        }),
      ).toThrow(IllegalFulfillmentTransitionError);

      // DELIVERED -> SHIPPED
      expect(() =>
        validateFulfillmentTransition({
          currentStatus: 'DELIVERED',
          toStatus: 'SHIPPED',
          orderPaymentStatus: 'PAID',
          trackingRef: 'TRACK-123',
        }),
      ).toThrow(IllegalFulfillmentTransitionError);
    });

    it('rejects transitioning cancelled or terminal delivered suborders', () => {
      expect(() =>
        validateFulfillmentTransition({
          currentStatus: 'CANCELLED',
          toStatus: 'PACKED',
          orderPaymentStatus: 'PAID',
        }),
      ).toThrow(IllegalFulfillmentTransitionError);

      expect(() =>
        validateFulfillmentTransition({
          currentStatus: 'DELIVERED',
          toStatus: 'PACKED',
          orderPaymentStatus: 'PAID',
        }),
      ).toThrow(IllegalFulfillmentTransitionError);
    });

    it('requires non-empty trackingRef when transitioning to SHIPPED', () => {
      expect(() =>
        validateFulfillmentTransition({
          currentStatus: 'PACKED',
          toStatus: 'SHIPPED',
          orderPaymentStatus: 'PAID',
        }),
      ).toThrow(MissingTrackingRefError);

      expect(() =>
        validateFulfillmentTransition({
          currentStatus: 'PACKED',
          toStatus: 'SHIPPED',
          orderPaymentStatus: 'PAID',
          trackingRef: '   ',
        }),
      ).toThrow(MissingTrackingRefError);
    });
  });

  describe('deriveParentFulfillmentStatus', () => {
    it('returns PENDING when there are no suborders', () => {
      expect(deriveParentFulfillmentStatus([])).toBe('PENDING');
    });

    it('returns CANCELLED when all suborders are CANCELLED', () => {
      expect(deriveParentFulfillmentStatus(['CANCELLED', 'CANCELLED'])).toBe('CANCELLED');
    });

    it('returns DELIVERED when all active suborders are DELIVERED', () => {
      expect(deriveParentFulfillmentStatus(['DELIVERED', 'DELIVERED'])).toBe('DELIVERED');
      expect(deriveParentFulfillmentStatus(['DELIVERED', 'CANCELLED'])).toBe('DELIVERED');
    });

    it('returns SHIPPED when all active suborders are SHIPPED', () => {
      expect(deriveParentFulfillmentStatus(['SHIPPED', 'SHIPPED'])).toBe('SHIPPED');
      expect(deriveParentFulfillmentStatus(['SHIPPED', 'CANCELLED'])).toBe('SHIPPED');
    });

    it('returns PARTIALLY_DELIVERED when suborders are a mix of SHIPPED and DELIVERED', () => {
      expect(deriveParentFulfillmentStatus(['SHIPPED', 'DELIVERED'])).toBe('PARTIALLY_DELIVERED');
    });

    it('returns PARTIALLY_SHIPPED when one suborder is SHIPPED/DELIVERED and another is PACKED/PENDING', () => {
      // 1 SHIPPED, 1 PACKED
      expect(deriveParentFulfillmentStatus(['SHIPPED', 'PACKED'])).toBe('PARTIALLY_SHIPPED');
      // 1 SHIPPED, 1 PENDING
      expect(deriveParentFulfillmentStatus(['SHIPPED', 'PENDING'])).toBe('PARTIALLY_SHIPPED');
      // 1 DELIVERED, 1 PACKED
      expect(deriveParentFulfillmentStatus(['DELIVERED', 'PACKED'])).toBe('PARTIALLY_SHIPPED');
      // 1 DELIVERED, 1 PENDING
      expect(deriveParentFulfillmentStatus(['DELIVERED', 'PENDING'])).toBe('PARTIALLY_SHIPPED');
    });

    it('returns PACKED when some or all active suborders are PACKED (and none are SHIPPED or DELIVERED)', () => {
      expect(deriveParentFulfillmentStatus(['PACKED', 'PACKED'])).toBe('PACKED');
      expect(deriveParentFulfillmentStatus(['PACKED', 'PENDING'])).toBe('PACKED');
    });

    it('returns PENDING when all active suborders are PENDING', () => {
      expect(deriveParentFulfillmentStatus(['PENDING', 'PENDING'])).toBe('PENDING');
      expect(deriveParentFulfillmentStatus(['PENDING', 'CANCELLED'])).toBe('PENDING');
    });
  });
});
