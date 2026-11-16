// @shopscale/worker/consumers/order-completion.consumer - Order payment completion & compensation consumer (T051).
// Invariants:
// 1. Consumes order.payment_observed domain events.
// 2. Delegates to OrderCompletionService for atomic order status transition and inventory settlement.
// 3. Emits downstream OrderPaid or OrderCancelled events via transactional outbox.
// 4. Retries on transient failure via BullMQ backoff.

import {
  orderCompletionService,
  type OrderCompletionResult,
  type OutboxRecord,
  type SqlClient,
} from '@shopscale/backend';

export interface OrderCompletionConsumerOptions {
  logger?: {
    info(msg: string, ...args: unknown[]): void;
    warn(msg: string, ...args: unknown[]): void;
    error(msg: string, ...args: unknown[]): void;
  };
}

export class OrderCompletionConsumer {
  private readonly logger: NonNullable<OrderCompletionConsumerOptions['logger']>;

  constructor(_sql?: SqlClient, options?: OrderCompletionConsumerOptions) {
    this.logger = options?.logger ?? {
      info: () => {},
      warn: () => {},
      error: () => {},
    };
  }

  async processEvent(event: OutboxRecord): Promise<OrderCompletionResult | null> {
    if (event.eventType !== 'order.payment_observed') {
      return null;
    }

    this.logger.info(`Processing payment_observed event ${event.id} for aggregate ${event.aggregateId}`);

    const result = await orderCompletionService.handlePaymentObserved({
      aggregateId: event.aggregateId,
      payload: event.payload,
      causationId: event.id,
      correlationId: event.correlationId ?? undefined,
    });

    this.logger.info(`Order ${result.orderId} completion outcome: ${result.status}`);
    return result;
  }
}
