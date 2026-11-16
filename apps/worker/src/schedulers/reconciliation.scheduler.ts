// @shopscale/worker/schedulers/reconciliation.scheduler - Scheduled payment reconciliation worker (T052).
// Invariants:
// 1. Runs repeatable BullMQ job 'payment-reconciliation-sweep' every 5 minutes (default: 300,000ms).
// 2. Polls stale pending payment attempts and reconciles them against payment provider.
// 3. Resolves abandoned sessions via compensation and captures delayed webhooks.
// 4. Provides triggerNow() for manual/CLI execution and integration test orchestration.

import { Queue, Worker, type ConnectionOptions, type Job } from 'bullmq';
import {
  paymentReconciliationService,
  type PaymentReconciliationService,
  type ReconcileResult,
} from '@shopscale/backend';

export interface ReconciliationSchedulerOptions {
  connection?: ConnectionOptions;
  batchSize?: number;
  sweepIntervalMs?: number; // default: 300,000 (5 minutes)
  olderThanMs?: number; // default: 600,000 (10 minutes)
  logger?: {
    info(msg: string, ...args: unknown[]): void;
    warn(msg: string, ...args: unknown[]): void;
    error(msg: string, ...args: unknown[]): void;
  };
}

export class ReconciliationScheduler {
  readonly queue: Queue;
  readonly worker: Worker;
  private readonly reconciliationService: PaymentReconciliationService;
  private readonly batchSize: number;
  private readonly sweepIntervalMs: number;
  private readonly olderThanMs: number;
  private readonly logger: NonNullable<ReconciliationSchedulerOptions['logger']>;

  constructor(
    queueName = 'payment-reconciliation',
    options?: ReconciliationSchedulerOptions,
    customService?: PaymentReconciliationService,
  ) {
    const connection = options?.connection ?? {};
    this.batchSize = options?.batchSize ?? 50;
    this.sweepIntervalMs = options?.sweepIntervalMs ?? 300_000;
    this.olderThanMs = options?.olderThanMs ?? 600_000;
    this.reconciliationService = customService ?? paymentReconciliationService;
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
          delay: 5000,
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
        concurrency: 1, // Single worker avoids reconciliation contention
      },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Reconciliation job ${job?.id} failed:`, err);
    });
  }

  async handleJob(job: Job): Promise<ReconcileResult> {
    this.logger.info(`Starting reconciliation sweep job ${job.id}`);
    return await this.executeSweep();
  }

  async start(): Promise<void> {
    await this.queue.add(
      'payment-reconciliation-sweep',
      {},
      {
        repeat: {
          every: this.sweepIntervalMs,
        },
        jobId: 'payment-reconciliation-repeatable',
      },
    );
    this.logger.info(`ReconciliationScheduler registered repeatable sweep every ${this.sweepIntervalMs}ms`);
  }

  async triggerNow(): Promise<ReconcileResult> {
    return await this.executeSweep();
  }

  private async executeSweep(): Promise<ReconcileResult> {
    const result = await this.reconciliationService.reconcileStalePaymentAttempts({
      batchSize: this.batchSize,
      olderThanMs: this.olderThanMs,
    });

    if (result.scannedCount > 0) {
      this.logger.info(
        `Reconciliation sweep complete: scanned=${result.scannedCount}, paid=${result.resolvedPaid}, cancelled=${result.resolvedCancelled}, errors=${result.errorsCount}`,
      );
    }
    return result;
  }

  async close(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
  }
}
