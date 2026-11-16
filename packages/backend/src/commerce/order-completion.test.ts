// @shopscale/backend/commerce/order-completion.test - Unit tests for OrderCompletionService (T051)
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Sql } from 'postgres';
import { OrderCompletionService } from './order-completion.js';
import { inventoryService } from '../inventory/inventory.service.js';
import { writeOutboxEvent } from '../platform/outbox.service.js';

vi.mock('../inventory/inventory.service.js', () => ({
  inventoryService: {
    confirmReservation: vi.fn(),
    releaseReservation: vi.fn(),
  },
}));

vi.mock('../platform/outbox.service.js', () => ({
  writeOutboxEvent: vi.fn(),
}));

describe('OrderCompletionService (T051 Unit Tests)', () => {
  let executedSql: string[];
  let mockTx: unknown;
  let mockSql: Sql;
  let service: OrderCompletionService;

  beforeEach(() => {
    vi.clearAllMocks();
    executedSql = [];
  });

  function setupMockDb(options: {
    order?: {
      id: string;
      payment_status: string;
      fulfillment_status: string;
      total_cents: number;
      currency: string;
    };
    sellerOrders?: Array<{ id: string }>;
    paymentAttempt?: { order_id: string };
  }) {
    const fn = (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.join('?');
      executedSql.push(query);

      if (query.includes('FROM orders')) {
        if (options.order && (values.length === 0 || values[0] === options.order.id)) {
          return Promise.resolve([options.order]);
        }
        return Promise.resolve([]);
      }
      if (query.includes('FROM seller_orders')) {
        return Promise.resolve(options.sellerOrders ?? [{ id: 'sub-1' }, { id: 'sub-2' }]);
      }
      if (query.includes('FROM payment_attempts')) {
        return Promise.resolve(options.paymentAttempt ? [options.paymentAttempt] : []);
      }
      return Promise.resolve([]);
    };

    mockTx = fn;
    mockSql = {
      begin: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(mockTx)),
    } as unknown as Sql;

    vi.mocked(inventoryService.confirmReservation).mockResolvedValue({
      confirmedCount: 1,
      confirmedUnits: 1,
    });

    service = new OrderCompletionService(mockSql);
  }

  it('confirms paid order, confirms inventory, and emits order.paid outbox event', async () => {
    setupMockDb({
      order: {
        id: 'ord-100',
        payment_status: 'PENDING',
        fulfillment_status: 'PENDING',
        total_cents: 4500,
        currency: 'USD',
      },
      sellerOrders: [{ id: 'sub-vendor-1' }],
    });

    const result = await service.handlePaymentObserved({
      aggregateId: 'ord-100',
      payload: {
        status: 'PAID',
        type: 'payment.succeeded',
        effectKey: 'eff-123',
        amountCents: '4500',
        providerRef: 'sim-ref-1',
        eventId: 'evt-paid-1',
      },
    });

    expect(result).toEqual({ status: 'confirmed', orderId: 'ord-100' });

    // 1. Assert orders update to PAID
    expect(executedSql.some((q) => q.includes('UPDATE orders') && q.includes("payment_status = 'PAID'"))).toBe(true);

    // 2. Assert inventory reservation confirmed
    expect(inventoryService.confirmReservation).toHaveBeenCalledWith(mockTx, 'ord-100');

    // 3. Assert outbox event order.paid written
    expect(writeOutboxEvent).toHaveBeenCalledWith(
      mockTx,
      expect.objectContaining({
        aggregateType: 'order',
        aggregateId: 'ord-100',
        type: 'order.paid',
        payload: {
          orderId: 'ord-100',
          sellerOrderIds: ['sub-vendor-1'],
          totalCents: 4500,
          currency: 'USD',
        },
      }),
    );
  });

  it('handles duplicate paid event idempotently returning noop without mutating DB or outbox', async () => {
    setupMockDb({
      order: {
        id: 'ord-100',
        payment_status: 'PAID', // Already paid
        fulfillment_status: 'PENDING',
        total_cents: 4500,
        currency: 'USD',
      },
    });

    const result = await service.handlePaymentObserved({
      aggregateId: 'ord-100',
      payload: { status: 'PAID', type: 'payment.succeeded' },
    });

    expect(result).toEqual({ status: 'noop', orderId: 'ord-100' });
    expect(inventoryService.confirmReservation).not.toHaveBeenCalled();
    expect(writeOutboxEvent).not.toHaveBeenCalled();
    expect(executedSql.some((q) => q.includes('UPDATE orders'))).toBe(false);
  });

  it('compensates failed payment by cancelling order, releasing inventory, and emitting order.cancelled', async () => {
    setupMockDb({
      order: {
        id: 'ord-200',
        payment_status: 'PENDING',
        fulfillment_status: 'PENDING',
        total_cents: 2000,
        currency: 'USD',
      },
    });

    const result = await service.handlePaymentObserved({
      aggregateId: 'ord-200',
      payload: {
        status: 'FAILED',
        type: 'payment.failed',
        effectKey: 'eff-fail',
        eventId: 'evt-fail-1',
      },
    });

    expect(result).toEqual({ status: 'compensated', orderId: 'ord-200' });

    // 1. Assert orders updated to FAILED / CANCELLED
    expect(
      executedSql.some(
        (q) => q.includes('UPDATE orders') && q.includes("payment_status = 'FAILED'"),
      ),
    ).toBe(true);

    // 2. Assert seller_orders updated to CANCELLED
    expect(
      executedSql.some(
        (q) => q.includes('UPDATE seller_orders') && q.includes("fulfillment_status = 'CANCELLED'"),
      ),
    ).toBe(true);

    // 3. Assert inventory reservation released
    expect(inventoryService.releaseReservation).toHaveBeenCalledWith(
      mockTx,
      'ord-200',
      'PAYMENT_FAILED',
    );

    // 4. Assert outbox event order.cancelled written
    expect(writeOutboxEvent).toHaveBeenCalledWith(
      mockTx,
      expect.objectContaining({
        aggregateType: 'order',
        aggregateId: 'ord-200',
        type: 'order.cancelled',
        payload: {
          orderId: 'ord-200',
          reason: 'PAYMENT_FAILED',
        },
      }),
    );
  });

  it('guards already-paid orders from being cancelled on late failed webhook', async () => {
    setupMockDb({
      order: {
        id: 'ord-300',
        payment_status: 'PAID', // Already paid
        fulfillment_status: 'PENDING',
        total_cents: 6000,
        currency: 'USD',
      },
    });

    const result = await service.handlePaymentObserved({
      aggregateId: 'ord-300',
      payload: { status: 'FAILED', type: 'payment.failed' },
    });

    expect(result).toEqual({ status: 'noop', orderId: 'ord-300' });
    expect(inventoryService.releaseReservation).not.toHaveBeenCalled();
    expect(writeOutboxEvent).not.toHaveBeenCalled();
    expect(executedSql.some((q) => q.includes('UPDATE orders'))).toBe(false);
  });

  it('resolves orderId via effectKey when aggregateId is not the orderId', async () => {
    setupMockDb({
      order: {
        id: 'ord-resolved-via-effect',
        payment_status: 'PENDING',
        fulfillment_status: 'PENDING',
        total_cents: 3000,
        currency: 'USD',
      },
      paymentAttempt: {
        order_id: 'ord-resolved-via-effect',
      },
      sellerOrders: [{ id: 'sub-1' }],
    });

    const result = await service.handlePaymentObserved({
      aggregateId: 'evt-external-aggregate-id',
      payload: {
        status: 'PAID',
        effectKey: 'eff-resolve-test',
      },
    });

    expect(result).toEqual({
      status: 'confirmed',
      orderId: 'ord-resolved-via-effect',
    });
    expect(inventoryService.confirmReservation).toHaveBeenCalledWith(
      mockTx,
      'ord-resolved-via-effect',
    );
  });

  it('triggers automated refund compensation when payment arrives late after reservation was expired', async () => {
    setupMockDb({
      order: {
        id: 'ord-late-100',
        payment_status: 'PENDING',
        fulfillment_status: 'PENDING',
        total_cents: 5000,
        currency: 'USD',
      },
    });

    vi.mocked(inventoryService.confirmReservation).mockResolvedValueOnce({
      confirmedCount: 0,
      confirmedUnits: 0,
    });

    mockSql.begin = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
      const txFn = (strings: TemplateStringsArray, ..._values: unknown[]) => {
        const query = strings.join('?');
        executedSql.push(query);
        if (query.includes('FROM stock_reservations') && query.includes("status = 'expired'")) {
          return Promise.resolve([{ id: 'res-expired-1' }]);
        }
        if (query.includes('FROM orders')) {
          return Promise.resolve([
            {
              id: 'ord-late-100',
              payment_status: 'PENDING',
              fulfillment_status: 'PENDING',
              total_cents: 5000,
              currency: 'USD',
            },
          ]);
        }
        return Promise.resolve([]);
      };
      return cb(txFn);
    });

    const result = await service.handlePaymentObserved({
      aggregateId: 'ord-late-100',
      payload: {
        status: 'PAID',
        type: 'payment.succeeded',
        effectKey: 'eff-late-1',
        amountCents: '5000',
      },
    });

    expect(result).toEqual({ status: 'compensated', orderId: 'ord-late-100' });

    expect(
      executedSql.some(
        (q) => q.includes('UPDATE orders') && q.includes("payment_status = 'REFUNDED'"),
      ),
    ).toBe(true);

    expect(writeOutboxEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: 'order.refund_requested',
        payload: expect.objectContaining({
          reason: 'RESERVATION_EXPIRED',
          orderId: 'ord-late-100',
        }),
      }),
    );
  });
});
