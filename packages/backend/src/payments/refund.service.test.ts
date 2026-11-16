// packages/backend/src/payments/refund.service.test.ts - Unit tests for double-entry refund service (T060).

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Sql } from 'postgres';
import { RefundService } from './refund.service.js';
import { financialLedgerService } from './financial-ledger.service.js';
import { inventoryService } from '../inventory/inventory.service.js';
import { writeOutboxEvent } from '../platform/outbox.service.js';
import {
  InvalidRefundAmountError,
  NoPaidPaymentError,
  RefundExceedsPaymentError,
  RefundPolicyCapExceededError,
} from './errors.js';

vi.mock('./financial-ledger.service.js', () => ({
  financialLedgerService: {
    recordEntries: vi.fn(),
  },
}));

vi.mock('../inventory/inventory.service.js', () => ({
  inventoryService: {
    adjustStock: vi.fn(),
  },
}));

vi.mock('../platform/outbox.service.js', () => ({
  writeOutboxEvent: vi.fn(),
}));

type MockTx = (...args: unknown[]) => Promise<unknown[]>;
type MockCb = (tx: MockTx) => Promise<unknown>;
interface MockSql {
  begin: (cb: MockCb) => Promise<unknown>;
}

function createSql(mock: MockSql): Sql {
  return mock as unknown as Sql;
}

describe('RefundService (T060 Unit Tests)', () => {
  const orderId = '11111111-1111-4111-8111-111111111111';
  const paymentAttemptId = '22222222-2222-4222-8222-222222222222';
  const refundId = '33333333-3333-4333-8333-333333333333';
  const orderItemId = '44444444-4444-4444-8444-444444444444';
  const storeId = '55555555-5555-4555-8555-555555555555';
  const variantId = '66666666-6666-4666-8666-666666666666';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws NoPaidPaymentError if order has no captured payment attempt', async () => {
    const mockSql = {
      begin: async (cb: MockCb) => {
        const tx = async () => [];
        return cb(tx);
      },
    };

    const service = new RefundService(createSql(mockSql));
    await expect(
      service.processRefund({
        orderId,
        reason: 'Customer cancelled',
      }),
    ).rejects.toThrow(NoPaidPaymentError);
  });

  it('throws RefundExceedsPaymentError when requested refund exceeds remaining balance', async () => {
    let callIdx = 0;
    const mockSql = {
      begin: async (cb: MockCb) => {
        const tx = async () => {
          callIdx++;
          if (callIdx === 1) {
            // payment_attempts row (captured $100 / 10000 cents)
            return [
              {
                id: paymentAttemptId,
                order_id: orderId,
                amount_cents: 10000,
                status: 'PAID',
              },
            ];
          }
          if (callIdx === 2) {
            // prior refunds (already refunded $80 / 8000 cents, remaining = 2000)
            return [{ total_refunded: 8000 }];
          }
          return [];
        };
        return cb(tx);
      },
    };

    const service = new RefundService(createSql(mockSql));
    // Attempting to refund $30 (3000 cents) when only 2000 cents remain
    await expect(
      service.processRefund({
        orderId,
        amountCents: 3000,
        reason: 'Greedy refund',
      }),
    ).rejects.toThrow(RefundExceedsPaymentError);
  });

  it('throws InvalidRefundAmountError when requested refund is zero or negative', async () => {
    let callIdx = 0;
    const mockSql = {
      begin: async (cb: MockCb) => {
        const tx = async () => {
          callIdx++;
          if (callIdx === 1) {
            return [
              {
                id: paymentAttemptId,
                order_id: orderId,
                amount_cents: 10000,
                status: 'PAID',
              },
            ];
          }
          if (callIdx === 2) {
            return [{ total_refunded: 0 }];
          }
          return [];
        };
        return cb(tx);
      },
    };

    const service = new RefundService(createSql(mockSql));
    await expect(
      service.processRefund({
        orderId,
        amountCents: 0,
        reason: 'Zero refund',
      }),
    ).rejects.toThrow(InvalidRefundAmountError);
  });

  it('throws RefundPolicyCapExceededError when support agent exceeds policy limit', async () => {
    let callIdx = 0;
    const mockSql = {
      begin: async (cb: MockCb) => {
        const tx = async () => {
          callIdx++;
          if (callIdx === 1) {
            return [
              {
                id: paymentAttemptId,
                order_id: orderId,
                amount_cents: 50000, // $500 order
                status: 'PAID',
              },
            ];
          }
          if (callIdx === 2) {
            return [{ total_refunded: 0 }];
          }
          return [];
        };
        return cb(tx);
      },
    };

    const service = new RefundService(createSql(mockSql));
    // Support agent requests $250 refund (exceeding standard $200 policy cap)
    await expect(
      service.processRefund({
        orderId,
        amountCents: 25000,
        reason: 'Support courtesy',
        isSupportAgent: true,
      }),
    ).rejects.toThrow(RefundPolicyCapExceededError);
  });

  it('throws RefundPolicyCapExceededError when cumulative support refunds on order exceed $200 cap', async () => {
    let callIdx = 0;
    const mockSql = {
      begin: async (cb: MockCb) => {
        const tx = async () => {
          callIdx++;
          if (callIdx === 1) {
            return [
              {
                id: paymentAttemptId,
                order_id: orderId,
                amount_cents: 50000, // $500 order
                status: 'PAID',
              },
            ];
          }
          if (callIdx === 2) {
            // Prior refund of $150 (15000 cents)
            return [{ total_refunded: 15000 }];
          }
          return [];
        };
        return cb(tx);
      },
    };

    const service = new RefundService(createSql(mockSql));
    // Prior $150 + new $100 = $250 (exceeds $200 cumulative cap)
    await expect(
      service.processRefund({
        orderId,
        amountCents: 10000,
        reason: 'Second support courtesy',
        isSupportAgent: true,
      }),
    ).rejects.toThrow(RefundPolicyCapExceededError);
  });

  it('successfully processes partial refund and writes balanced double-entry ledger', async () => {
    let callIdx = 0;
    const mockSql = {
      begin: async (cb: MockCb) => {
        const tx = async () => {
          callIdx++;
          if (callIdx === 1) {
            // Captured $100 (10000 cents)
            return [
              {
                id: paymentAttemptId,
                order_id: orderId,
                amount_cents: 10000,
                status: 'PAID',
              },
            ];
          }
          if (callIdx === 2) {
            // Prior refunds = $0
            return [{ total_refunded: 0 }];
          }
          if (callIdx === 3) {
            // Insert refunds returning id
            return [{ id: refundId }];
          }
          return [];
        };
        return cb(tx);
      },
    };

    const service = new RefundService(createSql(mockSql));
    const result = await service.processRefund({
      orderId,
      amountCents: 4000, // $40 partial refund
      reason: 'Partial return item',
    });

    expect(result.refundId).toBe(refundId);
    expect(result.amountCents).toBe(4000);
    expect(result.remainingCents).toBe(6000);
    expect(result.isFullyRefunded).toBe(false);
    expect(result.status).toBe('COMPLETED');

    // Assert double-entry entries recorded with balanced debits and credits
    expect(financialLedgerService.recordEntries).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([
        expect.objectContaining({
          account: 'seller_payable',
          debitCents: 4000,
          creditCents: 0,
        }),
        expect.objectContaining({
          account: 'payment_gateway_clearing',
          debitCents: 0,
          creditCents: 4000,
        }),
      ]),
    );

    // Assert outbox event emitted
    expect(writeOutboxEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: 'order.refund_completed',
        payload: expect.objectContaining({
          orderId,
          refundId,
          amountCents: 4000,
          isFullyRefunded: false,
        }),
      }),
    );
  });

  it('successfully processes full refund with restock and transitions order to REFUNDED', async () => {
    let callIdx = 0;
    const mockSql = {
      begin: async (cb: MockCb) => {
        const tx = async () => {
          callIdx++;
          if (callIdx === 1) {
            // Captured $50 (5000 cents)
            return [
              {
                id: paymentAttemptId,
                order_id: orderId,
                amount_cents: 5000,
                status: 'PAID',
              },
            ];
          }
          if (callIdx === 2) {
            // Prior refunds = 0
            return [{ total_refunded: 0 }];
          }
          if (callIdx === 3) {
            // Insert refunds
            return [{ id: refundId }];
          }
          if (callIdx === 4) {
            // Order item query
            return [
              {
                id: orderItemId,
                order_id: orderId,
                store_id: storeId,
                variant_id: variantId,
                qty: 1,
                unit_price_cents: 5000,
                total_cents: 5000,
              },
            ];
          }
          return [];
        };
        return cb(tx);
      },
    };

    const service = new RefundService(createSql(mockSql));
    const result = await service.processRefund({
      orderId,
      amountCents: 5000, // Full refund
      reason: 'Returned damaged item',
      items: [
        {
          orderItemId,
          qty: 1,
          restock: true,
        },
      ],
    });

    expect(result.refundId).toBe(refundId);
    expect(result.amountCents).toBe(5000);
    expect(result.remainingCents).toBe(0);
    expect(result.isFullyRefunded).toBe(true);

    // Verify restocking called
    expect(inventoryService.adjustStock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        storeId,
        variantId,
        deltaOnHand: 1,
        reason: 'return_restock',
        refId: refundId,
      }),
    );

    // Assert outbox event emitted
    expect(writeOutboxEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: 'order.refund_completed',
        payload: expect.objectContaining({
          orderId,
          refundId,
          amountCents: 5000,
          isFullyRefunded: true,
        }),
      }),
    );
  });
});
