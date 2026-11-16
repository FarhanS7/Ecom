// apps/worker/src/schedulers/settlement.scheduler.test.ts - Unit tests for SettlementScheduler (T070).
import { describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';
import type { SettlementService } from '@shopscale/backend';
import { SettlementScheduler } from './settlement.scheduler.js';

describe('SettlementScheduler (T070 Unit Tests)', () => {
  it('triggers settlement and aggregates store metrics', async () => {
    const mockSettlementService = {
      settleAllStoresPeriod: vi.fn().mockResolvedValue([
        {
          payoutId: 'payout-1',
          storeId: 'store-1',
          periodStart: new Date('2026-03-01T00:00:00Z'),
          periodEnd: new Date('2026-03-08T00:00:00Z'),
          grossSalesCents: 10000,
          refundDeductionsCents: 1000,
          netSalesCents: 9000,
          commissionBps: 1000,
          commissionCents: 900,
          amountCents: 8100,
          carriedForwardCents: 0,
          status: 'COMPLETED',
          effectKey: 'settlement:store-1:...',
        },
        {
          payoutId: 'payout-2',
          storeId: 'store-2',
          periodStart: new Date('2026-03-01T00:00:00Z'),
          periodEnd: new Date('2026-03-08T00:00:00Z'),
          grossSalesCents: 20000,
          refundDeductionsCents: 0,
          netSalesCents: 20000,
          commissionBps: 1000,
          commissionCents: 2000,
          amountCents: 18000,
          carriedForwardCents: 0,
          status: 'COMPLETED',
          effectKey: 'settlement:store-2:...',
        },
      ]),
    };

    const scheduler = new SettlementScheduler(
      'test-seller-settlements',
      {
        intervalMs: 86_400_000,
      },
      mockSettlementService as unknown as SettlementService,
    );

    const start = new Date('2026-03-01T00:00:00Z');
    const end = new Date('2026-03-08T00:00:00Z');

    const summary = await scheduler.triggerNow(start, end);

    expect(summary.storesSettled).toBe(2);
    expect(summary.totalGrossSalesCents).toBe(30000);
    expect(summary.totalRefundDeductionsCents).toBe(1000);
    expect(summary.totalNetSalesCents).toBe(29000);
    expect(summary.totalCommissionCents).toBe(2900);
    expect(summary.totalPayoutCents).toBe(26100);
    expect(mockSettlementService.settleAllStoresPeriod).toHaveBeenCalledWith({
      periodStart: start,
      periodEnd: end,
    });

    const mockJob = {
      id: 'job-settlement-1',
      name: 'settle-sellers',
      data: {
        periodStart: start.toISOString(),
        periodEnd: end.toISOString(),
      },
    } as unknown as Job;

    await scheduler.handleJob(mockJob);
    expect(mockSettlementService.settleAllStoresPeriod).toHaveBeenCalledTimes(2);

    await scheduler.close();
  });
});
