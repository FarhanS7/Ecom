// @shopscale/worker/schedulers/expiry.scheduler - Scheduled stock reservation expiry sweep (T039).
// Invariants:
// 1. Runs repeatable BullMQ job 'inventory-expiry-sweep' every 60 seconds.
// 2. Polls expired active reservations and releases them via InventoryService.releaseExpiredReservations().
// 3. Decrements inventory.reserved counters and writes 'reservation_expired' ledger records.
// 4. Provides triggerNow() for manual/CLI execution.

import { Queue, Worker, type ConnectionOptions, type Job } from 'bullmq';
import { inventoryService, type InventoryService } from '@shopscale/backend';

export interface ExpirySchedulerOptions {
  connection?: ConnectionOptions;
  batchSize?: number;
  sweepIntervalMs?: number; // default: 60000 (1 minute)
  logger?: {
    info(msg: string, ...args: unknown[]): void;
    warn(msg: string, ...args: unknown[]): void;
    error(msg: string, ...args: unknown[]): void;
  };
}

export class ExpiryScheduler {
  readonly queue: Queue;
  readonly worker: Worker;
  private readonly inventoryService: InventoryService;
  private readonly batchSize: number;
  private readonly sweepIntervalMs: number;
  private readonly logger: NonNullable<ExpirySchedulerOptions['logger']>;

  constructor(
    queueName = 'inventory-expiry',
    options?: ExpirySchedulerOptions,
    customInventoryService?: InventoryService,
  ) {
    const connection = options?.connection ?? {};
    this.batchSize = options?.batchSize ?? 100;
    this.sweepIntervalMs = options?.sweepIntervalMs ?? 60_000;
    this.inventoryService = customInventoryService ?? inventoryService;
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
          delay: 2000,
        },
      },
    });

    this.worker = new Worker(
      queueName,
      async (job: Job) => {
        await this.handleJob(job);
      },
      {
        connection,
        concurrency: 1,
      },
    );
  }

  async start(): Promise<void> {
    await this.queue.add(
      'inventory-expiry-sweep',
      {},
      {
        repeat: {
          every: this.sweepIntervalMs,
        },
        jobId: 'inventory-expiry-sweep-repeatable',
      },
    );
    this.logger.info(`[ExpiryScheduler] Repeatable sweep scheduled every ${this.sweepIntervalMs}ms.`);
  }

  async triggerNow(): Promise<{ releasedCount: number; releasedUnits: number }> {
    return await this.inventoryService.releaseExpiredReservations(this.batchSize);
  }

  async handleJob(job: Job): Promise<void> {
    if (job.name === 'inventory-expiry-sweep') {
      const result = await this.inventoryService.releaseExpiredReservations(this.batchSize);
      if (result.releasedCount > 0) {
        this.logger.info(
          `[ExpiryScheduler] Released ${result.releasedCount} reservations (${result.releasedUnits} units).`,
        );
      }
    }
  }

  async close(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
  }
}
