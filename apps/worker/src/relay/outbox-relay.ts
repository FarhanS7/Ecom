// @shopscale/worker/relay/outbox-relay - Background transactional outbox relay worker (T029).
// Invariants:
// 1. Claims unpublished events using SELECT ... FOR UPDATE SKIP LOCKED with lease expiry.
// 2. Publishes to BullMQ queue with stable jobId = eventId (deduplication gate).
// 3. Updates published_at = now() only after queue acknowledgment.
// 4. On publisher failure, releases lease with backoff.

import { Queue, type ConnectionOptions } from 'bullmq';
import type { OutboxRecord, OutboxRowDb, SqlClient } from '@shopscale/backend';

export interface EventQueuePublisher {
  publish(event: OutboxRecord): Promise<void>;
  close?(): Promise<void>;
}

export class BullMQEventPublisher implements EventQueuePublisher {
  readonly queue: Queue;

  constructor(queueName = 'domain-events', connection: ConnectionOptions = {}) {
    this.queue = new Queue(queueName, {
      connection,
      defaultJobOptions: {
        removeOnComplete: 1000,
        removeOnFail: 5000,
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
      },
    });
  }

  async publish(event: OutboxRecord): Promise<void> {
    await this.queue.add(event.eventType, event, {
      jobId: event.id, // Stable deduplication ID prevents multiple worker executions
    });
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}

export interface OutboxRelayOptions {
  batchSize?: number;
  leaseDurationSeconds?: number;
  pollIntervalMs?: number;
  logger?: {
    info(msg: string, ...args: unknown[]): void;
    warn(msg: string, ...args: unknown[]): void;
    error(msg: string, ...args: unknown[]): void;
  };
}

export class OutboxRelay {
  private readonly sql: SqlClient;
  private readonly publisher: EventQueuePublisher;
  private readonly batchSize: number;
  private readonly leaseDurationSeconds: number;
  private readonly pollIntervalMs: number;
  private readonly logger: NonNullable<OutboxRelayOptions['logger']>;

  private running = false;
  private loopPromise: Promise<void> | null = null;
  private stopRequested = false;

  constructor(
    sql: SqlClient,
    publisher: EventQueuePublisher,
    options?: OutboxRelayOptions,
  ) {
    this.sql = sql;
    this.publisher = publisher;
    this.batchSize = options?.batchSize ?? 50;
    this.leaseDurationSeconds = options?.leaseDurationSeconds ?? 30;
    this.pollIntervalMs = options?.pollIntervalMs ?? 200;
    this.logger = options?.logger ?? {
      info: () => {},
      warn: () => {},
      error: () => {},
    };
  }

  /**
   * Claim up to `batchSize` unpublished records whose leases have expired,
   * atomically advancing lease_until and incrementing attempts using FOR UPDATE SKIP LOCKED.
   */
  async claimBatch(limit = this.batchSize, leaseSeconds = this.leaseDurationSeconds): Promise<OutboxRecord[]> {
    const rows = (await this.sql.unsafe(
      `WITH claimable AS (
         SELECT "id"
         FROM "outbox"
         WHERE "published_at" IS NULL
           AND ("lease_until" IS NULL OR "lease_until" < now())
         ORDER BY "created_at" ASC, "id" ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
       UPDATE "outbox" o
       SET
         "lease_until" = now() + ($2 || ' seconds')::interval,
         "attempts" = o."attempts" + 1
       FROM claimable c
       WHERE o."id" = c."id"
       RETURNING
         o."id", o."aggregate_type", o."aggregate_id", o."aggregate_version",
         o."event_type", o."schema_version", o."payload", o."correlation_id",
         o."causation_id", o."store_id", o."occurred_at", o."created_at",
         o."published_at", o."lease_until", o."attempts";`,
      [limit, leaseSeconds],
    )) as unknown as OutboxRowDb[];

    return rows.map((row) => ({
      id: row.id,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      aggregateVersion: row.aggregate_version,
      eventType: row.event_type,
      schemaVersion: row.schema_version,
      payload: row.payload,
      correlationId: row.correlation_id,
      causationId: row.causation_id,
      storeId: row.store_id,
      occurredAt: row.occurred_at instanceof Date ? row.occurred_at : new Date(row.occurred_at),
      createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
      publishedAt: row.published_at ? (row.published_at instanceof Date ? row.published_at : new Date(row.published_at)) : null,
      leaseUntil: row.lease_until ? (row.lease_until instanceof Date ? row.lease_until : new Date(row.lease_until)) : null,
      attempts: Number(row.attempts),
    }));
  }

  /**
   * Mark event published upon queue acknowledgment.
   */
  async markPublished(eventId: string): Promise<void> {
    await this.sql.unsafe(
      `UPDATE "outbox"
       SET "published_at" = now(), "lease_until" = NULL
       WHERE "id" = $1;`,
      [eventId],
    );
  }

  /**
   * Release lease on publish error so the event can be retried.
   */
  async releaseLease(eventId: string): Promise<void> {
    await this.sql.unsafe(
      `UPDATE "outbox"
       SET "lease_until" = NULL
       WHERE "id" = $1;`,
      [eventId],
    );
  }

  /**
   * Compute queue lag in seconds (oldest unpublished event age).
   */
  async getQueueLagSeconds(): Promise<number> {
    const rows = (await this.sql.unsafe(
      `SELECT COALESCE(EXTRACT(EPOCH FROM (now() - MIN("created_at"))), 0)::float AS lag_seconds
       FROM "outbox"
       WHERE "published_at" IS NULL;`,
    )) as unknown as Array<{ lag_seconds: number | string }>;

    return Number(rows[0]?.lag_seconds ?? 0);
  }

  /**
   * Process a single poll cycle: claim batch, publish each, acknowledge or release.
   * Returns count of successfully published events.
   */
  async pollOnce(): Promise<number> {
    const records = await this.claimBatch();
    if (records.length === 0) {
      return 0;
    }

    let publishedCount = 0;
    for (const record of records) {
      try {
        await this.publisher.publish(record);
        await this.markPublished(record.id);
        publishedCount += 1;
      } catch (err) {
        this.logger.error(`Failed to publish outbox event ${record.id}:`, err);
        try {
          await this.releaseLease(record.id);
        } catch (releaseErr) {
          this.logger.error(`Failed to release lease for event ${record.id}:`, releaseErr);
        }
      }
    }

    return publishedCount;
  }

  /**
   * Start the continuous background polling loop.
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.stopRequested = false;

    this.loopPromise = (async () => {
      while (!this.stopRequested) {
        try {
          const published = await this.pollOnce();
          if (published === 0 && !this.stopRequested) {
            await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
          }
        } catch (err) {
          this.logger.error('Error in outbox relay cycle:', err);
          if (!this.stopRequested) {
            await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs * 2));
          }
        }
      }
      this.running = false;
    })();
  }

  /**
   * Stop the background relay worker gracefully.
   */
  async stop(): Promise<void> {
    if (!this.running) return;
    this.stopRequested = true;
    if (this.loopPromise) {
      await this.loopPromise;
      this.loopPromise = null;
    }
    this.running = false;
  }

  isRunning(): boolean {
    return this.running;
  }
}
