// packages/backend/src/payments/settlement.service.test.ts - TDD unit tests for SettlementService (T070)
import { describe, expect, it } from 'vitest';
import {
  SettlementService,
  calculateCommissionAndPayout,
  generateSettlementEffectKey,
} from './settlement.service.js';
import { FinancialLedgerService } from './financial-ledger.service.js';

describe('SettlementService Unit Tests (T070)', () => {
  const ledgerService = new FinancialLedgerService();

  describe('calculateCommissionAndPayout', () => {
    it('calculates 10% commission and net payout with no refunds', () => {
      // $1,000 gross sales, 1000 bps (10.00%)
      const result = calculateCommissionAndPayout({
        grossSalesCents: 100000,
        refundCents: 0,
        priorCarriedForwardCents: 0,
        commissionBps: 1000,
      });

      expect(result.grossSalesCents).toBe(100000);
      expect(result.refundDeductionsCents).toBe(0);
      expect(result.netSalesCents).toBe(100000);
      expect(result.commissionBps).toBe(1000);
      expect(result.commissionCents).toBe(10000); // $100
      expect(result.amountCents).toBe(90000); // $900
      expect(result.carriedForwardCents).toBe(0);
      expect(result.status).toBe('COMPLETED');
    });

    it('deducts refunds before calculating commission', () => {
      // $1,000 gross sales, $100 refunds -> $900 net sales -> 10% commission ($90) -> $810 payout
      const result = calculateCommissionAndPayout({
        grossSalesCents: 100000,
        refundCents: 10000,
        priorCarriedForwardCents: 0,
        commissionBps: 1000,
      });

      expect(result.grossSalesCents).toBe(100000);
      expect(result.refundDeductionsCents).toBe(10000);
      expect(result.netSalesCents).toBe(90000);
      expect(result.commissionCents).toBe(9000); // $90
      expect(result.amountCents).toBe(81000); // $810
      expect(result.carriedForwardCents).toBe(0);
      expect(result.status).toBe('COMPLETED');
    });

    it('supports custom commission basis points (e.g. 1500 bps = 15%)', () => {
      // $2,000 gross sales, $0 refunds, 1500 bps (15%) -> $300 commission -> $1,700 payout
      const result = calculateCommissionAndPayout({
        grossSalesCents: 200000,
        refundCents: 0,
        priorCarriedForwardCents: 0,
        commissionBps: 1500,
      });

      expect(result.grossSalesCents).toBe(200000);
      expect(result.netSalesCents).toBe(200000);
      expect(result.commissionBps).toBe(1500);
      expect(result.commissionCents).toBe(30000); // $300
      expect(result.amountCents).toBe(170000); // $1,700
      expect(result.status).toBe('COMPLETED');
    });

    it('handles rounding correctly on fractional cents', () => {
      // 9,999 cents at 1000 bps (10%) -> 999.9 cents -> rounds to 1000 cents commission
      const result = calculateCommissionAndPayout({
        grossSalesCents: 9999,
        refundCents: 0,
        priorCarriedForwardCents: 0,
        commissionBps: 1000,
      });

      expect(result.commissionCents).toBe(1000);
      expect(result.amountCents).toBe(8999);
      expect(result.commissionCents + result.amountCents).toBe(result.netSalesCents);
    });

    it('carries forward negative balance when refunds exceed gross sales', () => {
      // $200 gross sales, $500 refunds -> -$300 net -> $0 payout, $0 commission, $300 carried forward
      const result = calculateCommissionAndPayout({
        grossSalesCents: 20000,
        refundCents: 50000,
        priorCarriedForwardCents: 0,
        commissionBps: 1000,
      });

      expect(result.grossSalesCents).toBe(20000);
      expect(result.refundDeductionsCents).toBe(50000);
      expect(result.netSalesCents).toBe(-30000);
      expect(result.commissionCents).toBe(0);
      expect(result.amountCents).toBe(0);
      expect(result.carriedForwardCents).toBe(30000);
      expect(result.status).toBe('CARRIED_FORWARD');
    });

    it('offsets carried forward negative balance against subsequent sales', () => {
      // $1,000 gross sales, $100 refunds, $300 prior carried forward ->
      // Total deductions = $400 -> net sales = $600 -> 10% commission ($60) -> $540 payout
      const result = calculateCommissionAndPayout({
        grossSalesCents: 100000,
        refundCents: 10000,
        priorCarriedForwardCents: 30000,
        commissionBps: 1000,
      });

      expect(result.grossSalesCents).toBe(100000);
      expect(result.refundDeductionsCents).toBe(40000);
      expect(result.netSalesCents).toBe(60000);
      expect(result.commissionCents).toBe(6000);
      expect(result.amountCents).toBe(54000);
      expect(result.carriedForwardCents).toBe(0);
      expect(result.status).toBe('COMPLETED');
    });

    it('handles store with 0 sales and 0 refunds', () => {
      const result = calculateCommissionAndPayout({
        grossSalesCents: 0,
        refundCents: 0,
        priorCarriedForwardCents: 0,
        commissionBps: 1000,
      });

      expect(result.grossSalesCents).toBe(0);
      expect(result.netSalesCents).toBe(0);
      expect(result.commissionCents).toBe(0);
      expect(result.amountCents).toBe(0);
      expect(result.carriedForwardCents).toBe(0);
      expect(result.status).toBe('COMPLETED');
    });
  });

  describe('Financial Ledger Double-Entry Balance Verification', () => {
    it('creates perfectly balanced double-entry entries for completed settlements', () => {
      const calculation = calculateCommissionAndPayout({
        grossSalesCents: 100000,
        refundCents: 10000,
        priorCarriedForwardCents: 0,
        commissionBps: 1000,
      });

      const storeId = '00000000-0000-0000-0000-000000000001';
      const payoutId = '00000000-0000-0000-0000-000000000002';
      const operationKey = 'settlement:test-op';

      const entries = SettlementService.buildLedgerEntries({
        operationKey,
        storeId,
        payoutId,
        calculation,
      });

      // Assert 3 entries:
      // 1. Debit seller_payable (netSalesCents = 90000)
      // 2. Credit platform_commission (commissionCents = 9000)
      // 3. Credit payment_gateway_clearing (amountCents = 81000)
      expect(entries).toHaveLength(3);

      const debitEntry = entries.find((e) => e.account === 'seller_payable');
      expect(debitEntry?.debitCents).toBe(90000);
      expect(debitEntry?.creditCents).toBe(0);
      expect(debitEntry?.payoutId).toBe(payoutId);
      expect(debitEntry?.storeId).toBe(storeId);

      const commissionEntry = entries.find((e) => e.account === 'platform_commission');
      expect(commissionEntry?.debitCents).toBe(0);
      expect(commissionEntry?.creditCents).toBe(9000);
      expect(commissionEntry?.payoutId).toBe(payoutId);

      const clearingEntry = entries.find((e) => e.account === 'payment_gateway_clearing');
      expect(clearingEntry?.debitCents).toBe(0);
      expect(clearingEntry?.creditCents).toBe(81000);
      expect(clearingEntry?.payoutId).toBe(payoutId);

      // Verify assertBalanced passes without throwing
      expect(() => ledgerService.assertBalanced(entries)).not.toThrow();
    });

    it('returns empty ledger entries for CARRIED_FORWARD status (no funds disbursed)', () => {
      const calculation = calculateCommissionAndPayout({
        grossSalesCents: 20000,
        refundCents: 50000,
        priorCarriedForwardCents: 0,
        commissionBps: 1000,
      });

      const entries = SettlementService.buildLedgerEntries({
        operationKey: 'settlement:test-op-cf',
        storeId: '00000000-0000-0000-0000-000000000001',
        payoutId: '00000000-0000-0000-0000-000000000002',
        calculation,
      });

      expect(entries).toEqual([]);
    });

    it('returns empty ledger entries when net sales is 0', () => {
      const calculation = calculateCommissionAndPayout({
        grossSalesCents: 0,
        refundCents: 0,
        priorCarriedForwardCents: 0,
        commissionBps: 1000,
      });

      const entries = SettlementService.buildLedgerEntries({
        operationKey: 'settlement:test-op-zero',
        storeId: '00000000-0000-0000-0000-000000000001',
        payoutId: '00000000-0000-0000-0000-000000000002',
        calculation,
      });

      expect(entries).toEqual([]);
    });
  });

  describe('generateSettlementEffectKey', () => {
    it('produces deterministic unique key across stores and time periods', () => {
      const storeId = '11111111-1111-1111-1111-111111111111';
      const periodStart = new Date('2026-01-01T00:00:00.000Z');
      const periodEnd = new Date('2026-01-08T00:00:00.000Z');

      const key = generateSettlementEffectKey(storeId, periodStart, periodEnd);
      expect(key).toBe('settlement:11111111-1111-1111-1111-111111111111:2026-01-01T00:00:00.000Z:2026-01-08T00:00:00.000Z');
    });
  });
});
