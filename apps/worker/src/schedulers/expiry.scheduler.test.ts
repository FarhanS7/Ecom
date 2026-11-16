// Unit tests for ExpiryScheduler (T039).
import { describe, expect, it, vi } from 'vitest';
import { ExpiryScheduler } from './expiry.scheduler.js';
import type { Job } from 'bullmq';
import type { InventoryService } from '@shopscale/backend';

describe('ExpiryScheduler (T039 Unit Tests)', () => {
  it('triggers sweep and delegates to releaseExpiredReservations', async () => {
    const mockInventoryService = {
      releaseExpiredReservations: vi.fn().mockResolvedValue({
        releasedCount: 3,
        releasedUnits: 7,
      }),
    };

    const scheduler = new ExpiryScheduler(
      'test-inventory-expiry',
      {
        batchSize: 50,
      },
      mockInventoryService as unknown as InventoryService,
    );

    const result = await scheduler.triggerNow();

    expect(result).toEqual({ releasedCount: 3, releasedUnits: 7 });
    expect(mockInventoryService.releaseExpiredReservations).toHaveBeenCalledWith(50);

    // Test handleJob execution
    const mockJob = {
      name: 'inventory-expiry-sweep',
    } as Job;

    await scheduler.handleJob(mockJob);
    expect(mockInventoryService.releaseExpiredReservations).toHaveBeenCalledTimes(2);

    await scheduler.close();
  });
});
