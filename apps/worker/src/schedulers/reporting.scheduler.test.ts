// @shopscale/worker/schedulers/reporting.scheduler.test - Unit tests for ReportingScheduler (AD-2, REQ-ENG-002 / T066).

import { describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';
import type { AnalyticsQueryService } from '@shopscale/backend';
import { ReportingScheduler } from './reporting.scheduler.js';

describe('ReportingScheduler (T066 Unit Tests)', () => {
  it('triggers refresh and delegates to refreshMaterializedViews', async () => {
    const mockAnalyticsService = {
      refreshMaterializedViews: vi.fn().mockResolvedValue({
        refreshed: true,
        durationMs: 42,
      }),
    };

    const scheduler = new ReportingScheduler(
      'test-reporting-refresh',
      {
        refreshIntervalMs: 3_600_000,
        concurrently: true,
      },
      mockAnalyticsService as unknown as AnalyticsQueryService,
    );

    const result = await scheduler.triggerNow();

    expect(result).toEqual({
      refreshed: true,
      durationMs: 42,
    });
    expect(mockAnalyticsService.refreshMaterializedViews).toHaveBeenCalledWith(true);

    const mockJob = {
      id: 'job-reporting-1',
      name: 'refresh-materialized-views',
    } as Job;

    await scheduler.handleJob(mockJob);
    expect(mockAnalyticsService.refreshMaterializedViews).toHaveBeenCalledTimes(2);

    await scheduler.close();
  });
});
