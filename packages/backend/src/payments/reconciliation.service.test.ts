// @shopscale/backend/payments/reconciliation.service.test - Unit tests for PaymentReconciliationService (T052)
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Sql } from 'postgres';
import { PaymentReconciliationService } from './reconciliation.service.js';
import type { OrderCompletionService } from '../commerce/order-completion.js';

describe('PaymentReconciliationService (T052 Unit Tests)', () => {
  let executedSql: string[];
  let mockSql: Sql;
  let mockOrderCompletion: OrderCompletionService;

  beforeEach(() => {
    vi.clearAllMocks();
    executedSql = [];
  });

  function setupService(options: {
    attempts?: Array<{
      id: string;
      order_id: string;
      effect_key: string;
      amount_cents: number;
      currency: string;
      status: string;
    }>;
    fetchFn: typeof fetch;
  }): PaymentReconciliationService {
    const fn = (strings: TemplateStringsArray, ..._values: unknown[]) => {
      const query = strings.join('?');
      executedSql.push(query);

      if (query.includes('FROM payment_attempts')) {
        return Promise.resolve(options.attempts ?? []);
      }
      return Promise.resolve([]);
    };

    mockSql = fn as unknown as Sql;
    mockOrderCompletion = {
      handlePaymentObserved: vi.fn().mockResolvedValue({ status: 'confirmed', orderId: 'ord-1' }),
    } as unknown as OrderCompletionService;

    return new PaymentReconciliationService(mockSql, {
      mockPaymentsUrl: 'http://test-mock-payments:3005',
      fetchFn: options.fetchFn,
      orderCompletion: mockOrderCompletion,
    });
  }

  it('returns zero counts when no stale attempts found', async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch;
    const service = setupService({ attempts: [], fetchFn });

    const result = await service.reconcileStalePaymentAttempts();

    expect(result).toEqual({
      scannedCount: 0,
      resolvedPaid: 0,
      resolvedCancelled: 0,
      errorsCount: 0,
    });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(mockOrderCompletion.handlePaymentObserved).not.toHaveBeenCalled();
  });

  it('reconciles SUCCEEDED payment: confirms order and marks attempt PAID', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      status: 200,
      json: () => Promise.resolve({
        status: 'SUCCEEDED',
        providerRef: 'ref-reconciled-99',
        amountCents: '7500',
      }),
    });

    const service = setupService({
      attempts: [
        {
          id: 'att-1',
          order_id: 'ord-100',
          effect_key: 'eff-success-100',
          amount_cents: 7500,
          currency: 'USD',
          status: 'PENDING',
        },
      ],
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const result = await service.reconcileStalePaymentAttempts();

    expect(result).toEqual({
      scannedCount: 1,
      resolvedPaid: 1,
      resolvedCancelled: 0,
      errorsCount: 0,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://test-mock-payments:3005/mock-payments/charges/eff-success-100',
      expect.objectContaining({ method: 'GET' }),
    );

    expect(mockOrderCompletion.handlePaymentObserved).toHaveBeenCalledWith({
      aggregateId: 'ord-100',
      payload: {
        status: 'PAID',
        type: 'payment.succeeded',
        effectKey: 'eff-success-100',
        providerRef: 'ref-reconciled-99',
        amountCents: '7500',
      },
      correlationId: 'eff-success-100',
    });

    expect(
      executedSql.some(
        (q) => q.includes('UPDATE payment_attempts') && q.includes("status = 'PAID'"),
      ),
    ).toBe(true);
  });

  it('reconciles FAILED payment: compensates order and marks attempt FAILED', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      status: 200,
      json: () => Promise.resolve({
        status: 'FAILED',
        providerRef: 'ref-reconciled-fail',
      }),
    });

    const service = setupService({
      attempts: [
        {
          id: 'att-2',
          order_id: 'ord-200',
          effect_key: 'eff-failed-200',
          amount_cents: 3000,
          currency: 'USD',
          status: 'PENDING',
        },
      ],
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const result = await service.reconcileStalePaymentAttempts();

    expect(result).toEqual({
      scannedCount: 1,
      resolvedPaid: 0,
      resolvedCancelled: 1,
      errorsCount: 0,
    });

    expect(mockOrderCompletion.handlePaymentObserved).toHaveBeenCalledWith({
      aggregateId: 'ord-200',
      payload: {
        status: 'FAILED',
        type: 'payment.failed',
        effectKey: 'eff-failed-200',
      },
      correlationId: 'eff-failed-200',
    });

    expect(
      executedSql.some(
        (q) => q.includes('UPDATE payment_attempts') && q.includes("status = 'FAILED'"),
      ),
    ).toBe(true);
  });

  it('reconciles 404 NOT_FOUND payment: abandons session, compensates order, and marks attempt FAILED', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      status: 404,
    });

    const service = setupService({
      attempts: [
        {
          id: 'att-3',
          order_id: 'ord-300',
          effect_key: 'eff-notfound-300',
          amount_cents: 4000,
          currency: 'USD',
          status: 'PENDING',
        },
      ],
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const result = await service.reconcileStalePaymentAttempts();

    expect(result).toEqual({
      scannedCount: 1,
      resolvedPaid: 0,
      resolvedCancelled: 1,
      errorsCount: 0,
    });

    expect(mockOrderCompletion.handlePaymentObserved).toHaveBeenCalledWith({
      aggregateId: 'ord-300',
      payload: {
        status: 'FAILED',
        type: 'payment.failed',
        effectKey: 'eff-notfound-300',
      },
      correlationId: 'eff-notfound-300',
    });

    expect(
      executedSql.some(
        (q) => q.includes('UPDATE payment_attempts') && q.includes("status = 'FAILED'"),
      ),
    ).toBe(true);
  });

  it('handles provider network errors gracefully without modifying database', async () => {
    const mockFetch = vi.fn().mockRejectedValueOnce(new Error('Connection reset'));

    const service = setupService({
      attempts: [
        {
          id: 'att-4',
          order_id: 'ord-400',
          effect_key: 'eff-err-400',
          amount_cents: 2000,
          currency: 'USD',
          status: 'PENDING',
        },
      ],
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const result = await service.reconcileStalePaymentAttempts();

    expect(result).toEqual({
      scannedCount: 1,
      resolvedPaid: 0,
      resolvedCancelled: 0,
      errorsCount: 1,
    });

    expect(mockOrderCompletion.handlePaymentObserved).not.toHaveBeenCalled();
    expect(executedSql.some((q) => q.includes('UPDATE payment_attempts'))).toBe(false);
  });
});
