// @shopscale/worker/consumers/low-stock-alert.consumer - Low stock notification dispatcher (TASK-076, PRD P2 IN-5).
// Invariants:
// 1. Consumes inventory.low_stock_alert domain events.
// 2. Records idempotent low-stock alert delivery in notification_deliveries ledger.
// 3. Effect key deterministic: low_stock:{variantId}:{dateString}.
// 4. Zero duplicate side effects on re-delivery.

import {
  notificationService,
  type NotificationService,
  type OutboxRecord,
} from '@shopscale/backend';

export interface LowStockAlertPayload {
  variantId: string;
  storeId: string;
  onHand: number;
  reserved: number;
  available: number;
  threshold: number;
}

export interface LowStockAlertConsumerOptions {
  notificationService?: NotificationService;
  logger?: {
    info(msg: string, ...args: unknown[]): void;
    warn(msg: string, ...args: unknown[]): void;
    error(msg: string, ...args: unknown[]): void;
  };
}

export class LowStockAlertConsumer {
  private readonly notificationService: NotificationService;
  private readonly logger: NonNullable<LowStockAlertConsumerOptions['logger']>;

  constructor(options?: LowStockAlertConsumerOptions) {
    this.notificationService = options?.notificationService ?? notificationService;
    this.logger = options?.logger ?? {
      info: () => {},
      warn: () => {},
      error: () => {},
    };
  }

  async processEvent(event: OutboxRecord): Promise<{ deliveryId: string; alreadyDelivered: boolean } | null> {
    if (event.eventType !== 'inventory.low_stock_alert') {
      return null;
    }

    const payload = event.payload as LowStockAlertPayload;
    if (!payload?.variantId || !payload?.storeId) {
      this.logger.warn(`Invalid low_stock_alert event payload for event ${event.id}`);
      return null;
    }

    const today = new Date().toISOString().slice(0, 10);
    const effectKey = `low_stock:${payload.variantId}:${today}`;

    this.logger.info(
      `Processing low stock alert for variant ${payload.variantId} (available: ${payload.available}, threshold: ${payload.threshold})`,
    );

    const result = await this.notificationService.recordDelivery({
      effectKey,
      channel: 'EMAIL',
      template: 'low_stock_warning',
      recipient: `store-owner-${payload.storeId}@shopscale.local`,
      status: 'DELIVERED',
      payload: {
        variantId: payload.variantId,
        storeId: payload.storeId,
        available: payload.available,
        onHand: payload.onHand,
        reserved: payload.reserved,
        threshold: payload.threshold,
      },
    });

    return {
      deliveryId: result.delivery.id,
      alreadyDelivered: result.alreadyDelivered,
    };
  }
}

export const lowStockAlertConsumer = new LowStockAlertConsumer();
