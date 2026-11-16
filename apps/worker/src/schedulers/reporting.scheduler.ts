// @shopscale/worker/schedulers/reporting.scheduler - Scheduled sales materialized view refresh worker (AD-2, REQ-ENG-002 / T066).
// Invariants:
// 1. Runs repeatable BullMQ job 'refresh-materialized-views' hourly (default: 3,600,000ms).
// 2. Refreshes mv_daily_sales and mv_store_performance concurrently without blocking OLTP reads.
// 3. Provides triggerNow() for on-demand/test execution.

import { Queue, Worker, type ConnectionOptions, type Job } from 'bullmq';
import {
  analyticsQueryService,
  type AnalyticsQueryService,
} from '@shopscale/backend';

export interface ReportingSchedulerOptions {
  connection?: ConnectionOptions;
  refreshIntervalMs?: number; // default: 3,600,000 (1 hour)
  concurrently?: boolean;
  logger?: {
    info(msg: string, ...args: unknown[]): void;
    warn(msg: string, ...args: unknown[]): void;
    error(msg: string, ...args: unknown[]): void;
  };
}

export interface RefreshResult {
  refreshed: boolean;
  durationMs: number;
}

export class ReportingScheduler {
  readonly queue: Queue;
  readonly worker: Worker;
  private readonly analyticsService: AnalyticsQueryService;
  private readonly refreshIntervalMs: number;
  private readonly concurrently: boolean;
  private readonly logger: NonNullable<ReportingSchedulerOptions['logger']>;

  constructor(
    queueName = 'reporting-refresh',
    options?: ReportingSchedulerOptions,
    customService?: AnalyticsQueryService,
  ) {
    const connection = options?.connection ?? {};
    this.refreshIntervalMs = options?.refreshIntervalMs ?? 3_600_000;
    this.concurrently = options?.concurrently ?? true;
    this.analyticsService = customService ?? analyticsQueryService;
    this.logger = options?.logger ?? {
      info: () => {},
      warn: () => {},
      error: () => {},
    };

    this.queue = new Queue(queueName, {
      connection,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 500,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 10000,
        },
      },
    });

    this.worker = new Worker(
      queueName,
      async (job: Job) => {
        return await this.handleJob(job);
      },
      {
        connection,
        concurrency: 1, // Single worker avoids refresh contention
      },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Reporting refresh job ${job?.id} failed:`, err);
    });
  }

  async handleJob(job: Job): Promise<RefreshResult> {
    this.logger.info(`Starting materialized views refresh job ${job.id}`);
    return await this.executeRefresh();
  }

  async start(): Promise<void> {
    await this.queue.add(
      'refresh-materialized-views',
      {},
      {
        repeat: {
          every: this.refreshIntervalMs,
        },
        jobId: 'reporting-refresh-repeatable',
      },
    );
    this.logger.info(
      `ReportingScheduler registered repeatable refresh every ${this.refreshIntervalMs}ms`,
    );
  }

  async triggerNow(): Promise<RefreshResult> {
    return await this.executeRefresh();
  }

  private async executeRefresh(): Promise<RefreshResult> {
    const result = await this.analyticsService.refreshMaterializedViews(this.concurrently);
    this.logger.info(
      `Reporting materialized views refreshed successfully in ${result.durationMs}ms`,
    );
    return result;
  }

  async close(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
  }
}
