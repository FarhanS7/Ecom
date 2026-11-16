// @shopscale/worker/schedulers/settlement.scheduler - Scheduled seller settlement accounting worker (OR-8, DEC-012 / T070).
// Invariants:
// 1. Runs periodic repeatable BullMQ job 'settle-sellers' (default: 86,400,000ms / 24 hours).
// 2. Dispatches simulated seller settlement accounting over delivered orders and deductions.
// 3. Provides triggerNow() for CLI or integration test execution.

import { Queue, Worker, type ConnectionOptions, type Job } from 'bullmq';
import {
  settlementService,
  type SettlementService,
  type SettlementResult,
} from '@shopscale/backend';

export interface SettlementSchedulerOptions {
  connection?: ConnectionOptions;
  intervalMs?: number; // default: 86,400,000 (24 hours)
  logger?: {
    info(msg: string, ...args: unknown[]): void;
    warn(msg: string, ...args: unknown[]): void;
    error(msg: string, ...args: unknown[]): void;
  };
}

export interface SettlementSummary {
  storesSettled: number;
  totalGrossSalesCents: number;
  totalRefundDeductionsCents: number;
  totalNetSalesCents: number;
  totalCommissionCents: number;
  totalPayoutCents: number;
  durationMs: number;
  results: SettlementResult[];
}

export class SettlementScheduler {
  readonly queue: Queue;
  readonly worker: Worker;
  private readonly settlementService: SettlementService;
  private readonly intervalMs: number;
  private readonly logger: NonNullable<SettlementSchedulerOptions['logger']>;

  constructor(
    queueName = 'seller-settlements',
    options?: SettlementSchedulerOptions,
    customService?: SettlementService,
  ) {
    const connection = options?.connection ?? {};
    this.intervalMs = options?.intervalMs ?? 86_400_000;
    this.settlementService = customService ?? settlementService;
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
        concurrency: 1,
      },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Settlement job ${job?.id} failed:`, err);
    });
  }

  async start(): Promise<void> {
    await this.queue.add(
      'settle-sellers',
      {},
      {
        repeat: {
          every: this.intervalMs,
        },
        jobId: 'repeatable-seller-settlement',
      },
    );
    this.logger.info(`SettlementScheduler started with interval ${this.intervalMs}ms`);
  }

  async triggerNow(periodStart?: Date, periodEnd?: Date): Promise<SettlementSummary> {
    const now = new Date();
    const end = periodEnd ?? now;
    // Default 7-day period window ending at end
    const start = periodStart ?? new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);

    return await this.executeSettlement(start, end);
  }

  async handleJob(job: Job): Promise<SettlementSummary> {
    const now = new Date();
    const periodEnd = (job.data as { periodEnd?: string })?.periodEnd
      ? new Date((job.data as { periodEnd: string }).periodEnd)
      : now;
    const periodStart = (job.data as { periodStart?: string })?.periodStart
      ? new Date((job.data as { periodStart: string }).periodStart)
      : new Date(periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000);

    return await this.executeSettlement(periodStart, periodEnd);
  }

  private async executeSettlement(periodStart: Date, periodEnd: Date): Promise<SettlementSummary> {
    const startTime = Date.now();
    this.logger.info(
      `Executing seller settlements for window [${periodStart.toISOString()} -> ${periodEnd.toISOString()}]`,
    );

    const results = await this.settlementService.settleAllStoresPeriod({
      periodStart,
      periodEnd,
    });

    let totalGrossSalesCents = 0;
    let totalRefundDeductionsCents = 0;
    let totalNetSalesCents = 0;
    let totalCommissionCents = 0;
    let totalPayoutCents = 0;

    for (const r of results) {
      totalGrossSalesCents += r.grossSalesCents;
      totalRefundDeductionsCents += r.refundDeductionsCents;
      totalNetSalesCents += r.netSalesCents;
      totalCommissionCents += r.commissionCents;
      totalPayoutCents += r.amountCents;
    }

    const durationMs = Date.now() - startTime;
    this.logger.info(
      `Seller settlement complete: ${results.length} stores settled, ` +
        `net sales: $${(totalNetSalesCents / 100).toFixed(2)}, ` +
        `commission: $${(totalCommissionCents / 100).toFixed(2)}, ` +
        `disbursed: $${(totalPayoutCents / 100).toFixed(2)} in ${durationMs}ms`,
    );

    return {
      storesSettled: results.length,
      totalGrossSalesCents,
      totalRefundDeductionsCents,
      totalNetSalesCents,
      totalCommissionCents,
      totalPayoutCents,
      durationMs,
      results,
    };
  }

  async close(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
  }
}
