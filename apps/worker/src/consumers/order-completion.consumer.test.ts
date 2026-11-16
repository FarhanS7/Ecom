// @shopscale/worker/consumers/order-completion.consumer.test - Unit tests for OrderCompletionConsumer (T051)
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OutboxRecord } from '@shopscale/backend';
import { orderCompletionService } from '@shopscale/backend';
import { OrderCompletionConsumer } from './order-completion.consumer.js';

vi.mock('@shopscale/backend', () => ({
  orderCompletionService: {
    handlePaymentObserved: vi.fn(),
  },
}));

describe('OrderCompletionConsumer (T051 Unit Tests)', () => {
  let consumer: OrderCompletionConsumer;

  beforeEach(() => {
    vi.clearAllMocks();
    consumer = new OrderCompletionConsumer();
  });

  it('ignores events with non-order.payment_observed eventType', async () => {
    const event: OutboxRecord = {
      id: 'evt-1',
      aggregateType: 'product',
      aggregateId: 'prod-1',
      aggregateVersion: 1,
      eventType: 'ProductChanged',
      payload: {},
      createdAt: new Date(),
    };

    const result = await consumer.processEvent(event);
    expect(result).toBeNull();
    expect(orderCompletionService.handlePaymentObserved).not.toHaveBeenCalled();
  });

  it('delegates order.payment_observed events to orderCompletionService', async () => {
    vi.mocked(orderCompletionService.handlePaymentObserved).mockResolvedValueOnce({
      status: 'confirmed',
      orderId: 'ord-test-123',
    });

    const event: OutboxRecord = {
      id: 'evt-2',
      aggregateType: 'order',
      aggregateId: 'ord-test-123',
      aggregateVersion: 1,
      eventType: 'order.payment_observed',
      payload: { status: 'PAID' },
      createdAt: new Date(),
    };

    const result = await consumer.processEvent(event);

    expect(result).toEqual({ status: 'confirmed', orderId: 'ord-test-123' });
    expect(orderCompletionService.handlePaymentObserved).toHaveBeenCalledWith({
      aggregateId: 'ord-test-123',
      payload: { status: 'PAID' },
      causationId: 'evt-2',
      correlationId: undefined,
    });
  });
});
