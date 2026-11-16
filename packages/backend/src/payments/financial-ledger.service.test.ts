// packages/backend/src/payments/financial-ledger.service.test.ts - Unit tests for double-entry financial ledger (T060).

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Sql } from 'postgres';
import { FinancialLedgerService } from './financial-ledger.service.js';
import type { FinancialEntryInput } from './financial-ledger.service.js';
import { UnbalancedLedgerError } from './errors.js';

describe('FinancialLedgerService (T060 Unit Tests)', () => {
  let service: FinancialLedgerService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new FinancialLedgerService();
  });

  const orderId = '11111111-1111-4111-8111-111111111111';
  const refundId = '22222222-2222-4222-8222-222222222222';
  const storeId = '33333333-3333-4333-8333-333333333333';

  describe('assertBalanced', () => {
    it('throws UnbalancedLedgerError when debits do not equal credits', () => {
      const unbalancedEntries: FinancialEntryInput[] = [
        {
          operationKey: 'op-1',
          orderId,
          refundId,
          account: 'seller_payable',
          debitCents: 5000,
          creditCents: 0,
        },
        {
          operationKey: 'op-1',
          orderId,
          refundId,
          account: 'payment_gateway_clearing',
          debitCents: 0,
          creditCents: 4500, // 500 cent discrepancy
        },
      ];

      expect(() => service.assertBalanced(unbalancedEntries)).toThrow(UnbalancedLedgerError);
    });

    it('throws error when fewer than 2 entries are provided', () => {
      const singleEntry: FinancialEntryInput[] = [
        {
          operationKey: 'op-single',
          orderId,
          account: 'seller_payable',
          debitCents: 1000,
          creditCents: 0,
        },
      ];

      expect(() => service.assertBalanced(singleEntry)).toThrow(UnbalancedLedgerError);
    });

    it('throws error on negative debit or credit', () => {
      const negativeEntry: FinancialEntryInput[] = [
        {
          operationKey: 'op-neg',
          orderId,
          account: 'seller_payable',
          debitCents: -500,
          creditCents: 0,
        },
        {
          operationKey: 'op-neg',
          orderId,
          account: 'payment_gateway_clearing',
          debitCents: 0,
          creditCents: -500,
        },
      ];

      expect(() => service.assertBalanced(negativeEntry)).toThrow(
        /Debit and credit amounts must be non-negative/i,
      );
    });

    it('throws error when an entry has both 0 debit and 0 credit', () => {
      const zeroEntry: FinancialEntryInput[] = [
        {
          operationKey: 'op-zero',
          orderId,
          account: 'seller_payable',
          debitCents: 1000,
          creditCents: 0,
        },
        {
          operationKey: 'op-zero',
          orderId,
          account: 'platform_commission',
          debitCents: 0,
          creditCents: 0,
        },
        {
          operationKey: 'op-zero',
          orderId,
          account: 'payment_gateway_clearing',
          debitCents: 0,
          creditCents: 1000,
        },
      ];

      expect(() => service.assertBalanced(zeroEntry)).toThrow(
        /strictly positive debit or credit/i,
      );
    });

    it('throws error on invalid account name', () => {
      const invalidAccountEntry: FinancialEntryInput[] = [
        {
          operationKey: 'op-inv',
          orderId,
          // @ts-expect-error invalid account name testing
          account: 'slush_fund',
          debitCents: 1000,
          creditCents: 0,
        },
        {
          operationKey: 'op-inv',
          orderId,
          account: 'payment_gateway_clearing',
          debitCents: 0,
          creditCents: 1000,
        },
      ];

      expect(() => service.assertBalanced(invalidAccountEntry)).toThrow(/Invalid financial account/i);
    });

    it('passes validation when multi-entry batch is perfectly balanced', () => {
      // Order captured: $100 total
      // $85 net to seller, $15 commission to platform, $100 from gateway
      const balancedEntries: FinancialEntryInput[] = [
        {
          operationKey: 'capture-order-1',
          orderId,
          storeId,
          account: 'payment_gateway_clearing',
          debitCents: 10000,
          creditCents: 0,
        },
        {
          operationKey: 'capture-order-1',
          orderId,
          storeId,
          account: 'seller_payable',
          debitCents: 0,
          creditCents: 8500,
        },
        {
          operationKey: 'capture-order-1',
          orderId,
          storeId,
          account: 'platform_commission',
          debitCents: 0,
          creditCents: 1500,
        },
      ];

      expect(() => service.assertBalanced(balancedEntries)).not.toThrow();
    });
  });

  describe('recordEntries', () => {
    it('records valid entries to database via mock sql', async () => {
      const balancedEntries: FinancialEntryInput[] = [
        {
          operationKey: 'refund-1',
          orderId,
          refundId,
          account: 'seller_payable',
          debitCents: 3000,
          creditCents: 0,
        },
        {
          operationKey: 'refund-1',
          orderId,
          refundId,
          account: 'payment_gateway_clearing',
          debitCents: 0,
          creditCents: 3000,
        },
      ];

      const insertedDbRows: unknown[] = [];
      const mockSql = (async () => {
        const row = {
          id: 'entry-uuid-1',
          operation_key: 'refund-1',
          order_id: orderId,
          refund_id: refundId,
          store_id: null,
          account: 'seller_payable',
          debit_cents: 3000,
          credit_cents: 0,
          created_at: new Date(),
        };
        insertedDbRows.push(row);
        return [row];
      }) as unknown as Sql;

      const ledgerService = new FinancialLedgerService(mockSql);
      const result = await ledgerService.recordEntries(mockSql, balancedEntries);

      expect(result.length).toBe(2);
      expect(insertedDbRows.length).toBe(2);
    });
  });

  describe('getOrderLedgerSummary', () => {
    it('summarizes order debits and credits and reports balanced state', async () => {
      const mockSql = (async () => [
        {
          total_debits: '15000',
          total_credits: '15000',
          entries_count: 4,
        },
      ]) as unknown as Sql;

      const ledgerService = new FinancialLedgerService(mockSql);
      const summary = await ledgerService.getOrderLedgerSummary(orderId);

      expect(summary.totalDebits).toBe(15000);
      expect(summary.totalCredits).toBe(15000);
      expect(summary.isBalanced).toBe(true);
      expect(summary.entriesCount).toBe(4);
    });
  });

  describe('getAccountSummary', () => {
    it('aggregates debits, credits, and net balance for account', async () => {
      const mockSql = (async () => [
        {
          total_debits: '25000',
          total_credits: '10000',
        },
      ]) as unknown as Sql;

      const ledgerService = new FinancialLedgerService(mockSql);
      const summary = await ledgerService.getAccountSummary('seller_payable', storeId);

      expect(summary.totalDebits).toBe(25000);
      expect(summary.totalCredits).toBe(10000);
      expect(summary.netBalance).toBe(15000);
    });
  });
});
