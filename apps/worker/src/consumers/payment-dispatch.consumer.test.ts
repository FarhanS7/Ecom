// @shopscale/worker/consumers/payment-dispatch.consumer.test - Unit tests for PaymentDispatchConsumer (T050)
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OutboxRecord, SqlClient } from '@shopscale/backend';
import { PaymentDispatchConsumer } from './payment-dispatch.consumer.js';

describe('PaymentDispatchConsumer (T050 Unit Tests)', () => {
  let mockSql: SqlClient;
  let executedSql: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    executedSql = [];
    const fn = (strings: TemplateStringsArray, ..._values: unknown[]) => {
      const query = strings.join('?');
      executedSql.push(query);
      return Promise.resolve([]);
    };
    mockSql = fn as unknown as SqlClient;
  });

  it('ignores events with non-order.checkout_reserved eventType', async () => {
    const fetchFn = vi.fn();
    const consumer = new PaymentDispatchConsumer(mockSql, {
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const event: OutboxRecord = {
      id: 'evt-1',
      aggregateType: 'product',
      aggregateId: 'prod-1',
      aggregateVersion: 1,
      eventType: 'ProductChanged',
      payload: {},
      createdAt: new Date(),
    };

    await consumer.processEvent(event);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(executedSql).toHaveLength(0);
  });

  it('ignores checkout_reserved events with missing required fields in payload', async () => {
    const fetchFn = vi.fn();
    const consumer = new PaymentDispatchConsumer(mockSql, {
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const event: OutboxRecord = {
      id: 'evt-2',
      aggregateType: 'order',
      aggregateId: 'ord-1',
      aggregateVersion: 1,
      eventType: 'order.checkout_reserved',
      payload: { orderId: 'ord-1' }, // Missing paymentEffectKey and totalCents
      createdAt: new Date(),
    };

    await consumer.processEvent(event);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(executedSql).toHaveLength(0);
  });

  it('inserts payment_attempts, dispatches HTTP POST, and updates providerRef on success', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        providerRef: 'sim_ref_9999',
        status: 'PENDING',
      }),
    });

    const consumer = new PaymentDispatchConsumer(mockSql, {
      mockPaymentsUrl: 'http://mock-pay:3005',
      webhookUrl: 'http://test-api/v1/webhooks/payments',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const event: OutboxRecord = {
      id: 'evt-3',
      aggregateType: 'order',
      aggregateId: 'ord-100',
      aggregateVersion: 1,
      eventType: 'order.checkout_reserved',
      payload: {
        orderId: 'ord-100',
        userId: 'usr-1',
        channelKey: 'marketplace',
        totalCents: 5400,
        paymentEffectKey: 'eff_test_key_123',
      },
      createdAt: new Date(),
    };

    await consumer.processEvent(event);

    // 1. Verify SQL queries executed (INSERT payment_attempts and UPDATE payment_attempts)
    expect(executedSql.some((q) => q.includes('INSERT INTO payment_attempts'))).toBe(true);
    expect(executedSql.some((q) => q.includes('UPDATE payment_attempts'))).toBe(true);

    // 2. Verify fetch dispatched to mock payment provider
    expect(mockFetch).toHaveBeenCalledWith(
      'http://mock-pay:3005/mock-payments/charges',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          effectKey: 'eff_test_key_123',
          amountCents: '5400',
          currency: 'USD',
          webhookUrl: 'http://test-api/v1/webhooks/payments',
          simulateOutcome: 'SUCCESS',
        }),
      },
    );
  });

  it('throws error when mock payment provider returns HTTP failure status', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 502,
      text: () => Promise.resolve('Bad Gateway'),
    });

    const consumer = new PaymentDispatchConsumer(mockSql, {
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const event: OutboxRecord = {
      id: 'evt-4',
      aggregateType: 'order',
      aggregateId: 'ord-101',
      aggregateVersion: 1,
      eventType: 'order.checkout_reserved',
      payload: {
        orderId: 'ord-101',
        paymentEffectKey: 'eff_test_key_fail',
        totalCents: 1000,
      },
      createdAt: new Date(),
    };

    await expect(consumer.processEvent(event)).rejects.toThrow(
      'Payment provider charge failed with status 502',
    );
  });
});
