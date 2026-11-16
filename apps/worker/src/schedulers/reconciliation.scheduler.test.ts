// @shopscale/worker/schedulers/reconciliation.scheduler.test - Unit tests for ReconciliationScheduler (T052)
import { describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';
import type { PaymentReconciliationService } from '@shopscale/backend';
import { ReconciliationScheduler } from './reconciliation.scheduler.js';

describe('ReconciliationScheduler (T052 Unit Tests)', () => {
  it('triggers sweep and delegates to reconcileStalePaymentAttempts', async () => {
    const mockReconciliationService = {
      reconcileStalePaymentAttempts: vi.fn().mockResolvedValue({
        scannedCount: 2,
        resolvedPaid: 1,
        resolvedCancelled: 1,
        errorsCount: 0,
      }),
    };

    const scheduler = new ReconciliationScheduler(
      'test-payment-reconciliation',
      {
        batchSize: 25,
        olderThanMs: 300_000,
      },
      mockReconciliationService as unknown as PaymentReconciliationService,
    );

    const result = await scheduler.triggerNow();

    expect(result).toEqual({
      scannedCount: 2,
      resolvedPaid: 1,
      resolvedCancelled: 1,
      errorsCount: 0,
    });
    expect(mockReconciliationService.reconcileStalePaymentAttempts).toHaveBeenCalledWith({
      batchSize: 25,
      olderThanMs: 300_000,
    });

    // Test handleJob execution
    const mockJob = {
      id: 'job-recon-1',
      name: 'payment-reconciliation-sweep',
    } as Job;

    await scheduler.handleJob(mockJob);
    expect(mockReconciliationService.reconcileStalePaymentAttempts).toHaveBeenCalledTimes(2);

    await scheduler.close();
  });
});
