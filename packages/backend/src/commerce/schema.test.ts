// @shopscale/backend/commerce/schema.test - Unit tests for orders and suborders schema (T046).

import { describe, expect, it } from 'vitest';
import { getTableName } from 'drizzle-orm';
import {
  ORDER_FULFILLMENT_STATUSES,
  ORDER_PAYMENT_STATUSES,
  RETURN_REQUEST_STATUSES,
  fulfillmentEvents,
  orderItems,
  orders,
  paymentAttempts,
  returnRequests,
  sellerOrders,
} from './schema.js';
import type { AddressSnapshot } from './schema.js';

describe('Orders and Seller Suborders Schema (T046)', () => {
  it('exposes all commerce tables under exact migration names', () => {
    expect(getTableName(orders)).toBe('orders');
    expect(getTableName(sellerOrders)).toBe('seller_orders');
    expect(getTableName(orderItems)).toBe('order_items');
    expect(getTableName(paymentAttempts)).toBe('payment_attempts');
    expect(getTableName(fulfillmentEvents)).toBe('fulfillment_events');
    expect(getTableName(returnRequests)).toBe('return_requests');
  });

  it('contains expected status constants', () => {
    expect(ORDER_PAYMENT_STATUSES).toEqual(['PENDING', 'PAID', 'FAILED', 'REFUNDED']);
    expect(RETURN_REQUEST_STATUSES).toEqual(['PENDING_INSPECTION', 'APPROVED', 'REJECTED']);
    expect(ORDER_FULFILLMENT_STATUSES).toEqual([
      'PENDING',
      'PACKED',
      'PARTIALLY_SHIPPED',
      'SHIPPED',
      'PARTIALLY_DELIVERED',
      'DELIVERED',
      'CANCELLED',
    ]);
  });

  it('orders table contains channel, status, amounts, and address snapshot columns', () => {
    const cols = Object.keys(orders);
    expect(cols).toContain('id');
    expect(cols).toContain('userId');
    expect(cols).toContain('channelKey');
    expect(cols).toContain('storeId');
    expect(cols).toContain('paymentStatus');
    expect(cols).toContain('fulfillmentStatus');
    expect(cols).toContain('subtotalCents');
    expect(cols).toContain('shippingCents');
    expect(cols).toContain('discountCents');
    expect(cols).toContain('totalCents');
    expect(cols).toContain('currency');
    expect(cols).toContain('addressSnapshot');
    expect(cols).toContain('couponCode');
    expect(cols).toContain('version');
  });

  it('seller_orders table models vendor suborder relationships and commission snapshot', () => {
    const cols = Object.keys(sellerOrders);
    expect(cols).toContain('id');
    expect(cols).toContain('orderId');
    expect(cols).toContain('storeId');
    expect(cols).toContain('fulfillmentStatus');
    expect(cols).toContain('subtotalCents');
    expect(cols).toContain('shippingCents');
    expect(cols).toContain('discountCents');
    expect(cols).toContain('totalCents');
    expect(cols).toContain('commissionBpsSnapshot');
    expect(cols).toContain('trackingRef');
    expect(cols).toContain('carrier');
  });

  it('order_items table captures historical snapshots and composite store relationship', () => {
    const cols = Object.keys(orderItems);
    expect(cols).toContain('id');
    expect(cols).toContain('orderId');
    expect(cols).toContain('sellerOrderId');
    expect(cols).toContain('storeId');
    expect(cols).toContain('variantId');
    expect(cols).toContain('titleSnapshot');
    expect(cols).toContain('skuSnapshot');
    expect(cols).toContain('qty');
    expect(cols).toContain('unitPriceCents');
    expect(cols).toContain('totalCents');
    expect(cols).toContain('discountCents');
  });

  it('payment_attempts table contains provider effect keys and statuses', () => {
    const cols = Object.keys(paymentAttempts);
    expect(cols).toContain('id');
    expect(cols).toContain('orderId');
    expect(cols).toContain('provider');
    expect(cols).toContain('effectKey');
    expect(cols).toContain('providerRef');
    expect(cols).toContain('amountCents');
    expect(cols).toContain('status');
  });

  it('validates shape of AddressSnapshot', () => {
    const snapshot: AddressSnapshot = {
      fullName: 'Jane Doe',
      line1: '123 Market St',
      line2: 'Apt 4B',
      city: 'San Francisco',
      state: 'CA',
      postalCode: '94105',
      country: 'USA',
      phone: '+1-555-0100',
    };
    expect(snapshot.fullName).toBe('Jane Doe');
    expect(snapshot.postalCode).toBe('94105');
  });
});
