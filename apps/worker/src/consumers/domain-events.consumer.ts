// @shopscale/worker/consumers/domain-events.consumer - Domain events BullMQ consumer (T030).
// Invariants:
// 1. Receives domain events from BullMQ queue 'domain-events'.
// 2. Dispatches product events to projectProductEvent inside a database transaction.
// 3. Automatically deduplicates via consumer_receipts.
// 4. Retries on transient failure with BullMQ backoff.

import { Worker, type ConnectionOptions, type Job } from 'bullmq';
import {
  metricsService,
  parseTraceparent,
  projectProductEvent,
  redisCacheService,
  withSpan,
  type OutboxRecord,
  type SqlClient,
} from '@shopscale/backend';
import { PaymentDispatchConsumer } from './payment-dispatch.consumer.js';
import { OrderCompletionConsumer } from './order-completion.consumer.js';
import { OrderPaidConsumer } from './order-paid.consumer.js';
import { ReviewProjectorConsumer } from './review-projector.consumer.js';
import { LowStockAlertConsumer } from './low-stock-alert.consumer.js';

export interface DomainEventsConsumerOptions {
  concurrency?: number;
  connection?: ConnectionOptions;
  cache?: {
    invalidatePattern(pattern: string): Promise<void>;
  };
  paymentDispatch?: PaymentDispatchConsumer;
  orderCompletion?: OrderCompletionConsumer;
  orderPaid?: OrderPaidConsumer;
  reviewProjector?: ReviewProjectorConsumer;
  lowStockAlert?: LowStockAlertConsumer;
  logger?: {
    info(msg: string, ...args: unknown[]): void;
    warn(msg: string, ...args: unknown[]): void;
    error(msg: string, ...args: unknown[]): void;
  };
}

export class DomainEventsConsumer {
  readonly worker: Worker;
  private readonly sql: SqlClient;
  private readonly cache?: { invalidatePattern(pattern: string): Promise<void> } | undefined;
  private readonly paymentDispatch: PaymentDispatchConsumer;
  private readonly orderCompletion: OrderCompletionConsumer;
  private readonly orderPaid: OrderPaidConsumer;
  private readonly reviewProjector: ReviewProjectorConsumer;
  private readonly lowStockAlert: LowStockAlertConsumer;
  private readonly logger: NonNullable<DomainEventsConsumerOptions['logger']>;

  constructor(
    sql: SqlClient,
    queueName = 'domain-events',
    options?: DomainEventsConsumerOptions,
  ) {
    this.sql = sql;
    this.cache = options?.cache ?? redisCacheService;
    this.logger = options?.logger ?? {
      info: () => {},
      warn: () => {},
      error: () => {},
    };
    this.paymentDispatch =
      options?.paymentDispatch ??
      new PaymentDispatchConsumer(sql, { logger: this.logger });
    this.orderCompletion =
      options?.orderCompletion ??
      new OrderCompletionConsumer(sql, { logger: this.logger });
    this.orderPaid =
      options?.orderPaid ??
      new OrderPaidConsumer({ logger: this.logger });
    this.reviewProjector =
      options?.reviewProjector ??
      new ReviewProjectorConsumer({ logger: this.logger, cache: this.cache });
    this.lowStockAlert =
      options?.lowStockAlert ??
      new LowStockAlertConsumer({ logger: this.logger });

    this.worker = new Worker(
      queueName,
      async (job: Job<OutboxRecord>) => {
        try {
          await this.handleJob(job);
          metricsService.recordBullMqJob(queueName, 'completed');
        } catch (err) {
          metricsService.recordBullMqJob(queueName, 'failed');
          throw err;
        }
      },
      {
        connection: options?.connection ?? {},
        concurrency: options?.concurrency ?? 5,
      },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Job ${job?.id} failed with error:`, err);
    });
  }

  async handleJob(job: Job<OutboxRecord>): Promise<void> {
    const event = job.data;
    this.logger.info(`Processing event ${event.id} (${event.eventType}) for aggregate ${event.aggregateId}`);

    const parsed = parseTraceparent(event.correlationId);
    const traceId = parsed.valid ? parsed.traceId : undefined;
    const parentSpanId = parsed.valid ? parsed.spanId : (event.causationId ?? undefined);

    await withSpan(
      `worker.consumer:${event.eventType}`,
      async (span) => {
        span.setAttribute('messaging.system', 'bullmq');
        span.setAttribute('messaging.destination', 'domain-events');
        span.setAttribute('messaging.message_id', event.id);
        span.setAttribute('event.type', event.eventType);
        span.setAttribute('event.aggregate_type', event.aggregateType);
        span.setAttribute('event.aggregate_id', event.aggregateId);

        if (
          event.aggregateType === 'product' ||
          event.eventType === 'ProductChanged' ||
          event.eventType === 'PublicationChanged'
        ) {
          await this.sql.begin(async (tx) => {
            const outcome = await projectProductEvent(tx, {
              id: event.id,
              aggregateId: event.aggregateId,
              aggregateVersion: event.aggregateVersion,
              type: event.eventType,
              payload: event.payload,
            });

            this.logger.info(`Projection outcome for product ${event.aggregateId}:`, outcome.status);
          });

          if (this.cache) {
            try {
              await this.cache.invalidatePattern('cache:pdp:*');
            } catch {
              // Ignore cache invalidation failures
            }
          }
        } else if (
          event.aggregateType === 'order' &&
          event.eventType === 'order.checkout_reserved'
        ) {
          await this.paymentDispatch.processEvent(event);
        } else if (
          event.eventType === 'order.payment_observed'
        ) {
          await this.orderCompletion.processEvent(event);
        } else if (
          event.eventType === 'order.paid' ||
          event.eventType === 'OrderPaid'
        ) {
          await this.orderPaid.processEvent(event);
        } else if (
          event.aggregateType === 'review' ||
          event.eventType === 'review.created' ||
          event.eventType === 'ReviewCreated' ||
          event.eventType === 'ReviewChanged'
        ) {
          await this.reviewProjector.processEvent(event);
        } else if (
          event.eventType === 'inventory.low_stock_alert'
        ) {
          await this.lowStockAlert.processEvent(event);
        }
      },
      { traceId, parentSpanId },
    );
  }

  async close(): Promise<void> {
    await this.worker.close();
  }
}
