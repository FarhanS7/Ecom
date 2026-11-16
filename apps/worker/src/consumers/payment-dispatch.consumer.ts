// @shopscale/worker/consumers/payment-dispatch.consumer - Payment dispatch consumer (T050).
// Invariants:
// 1. Consumes order.checkout_reserved domain events.
// 2. Inserts or updates payment_attempts record with status PENDING.
// 3. Dispatches HTTP POST to mock payment provider /mock-payments/charges with stable effectKey.
// 4. Updates payment_attempts with providerRef.
// 5. Retries on failure via BullMQ exponential backoff.

import type { OutboxRecord, SqlClient } from '@shopscale/backend';

export interface CheckoutReservedPayload {
  orderId: string;
  userId: string;
  channelKey: string;
  totalCents: number;
  paymentEffectKey: string;
  sellersCount?: number;
  itemsCount?: number;
}

export interface PaymentDispatchConsumerOptions {
  mockPaymentsUrl?: string;
  webhookUrl?: string;
  fetchFn?: typeof fetch;
  logger?: {
    info(msg: string, ...args: unknown[]): void;
    warn(msg: string, ...args: unknown[]): void;
    error(msg: string, ...args: unknown[]): void;
  };
}

export class PaymentDispatchConsumer {
  private readonly sql: SqlClient;
  private readonly mockPaymentsUrl: string;
  private readonly webhookUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly logger: NonNullable<PaymentDispatchConsumerOptions['logger']>;

  constructor(sql: SqlClient, options?: PaymentDispatchConsumerOptions) {
    this.sql = sql;
    this.mockPaymentsUrl =
      options?.mockPaymentsUrl ??
      process.env['MOCK_PAYMENTS_BASE_URL'] ??
      'http://localhost:3005';
    this.webhookUrl =
      options?.webhookUrl ??
      `${process.env['API_BASE_URL'] ?? 'http://localhost:3000'}/v1/webhooks/payments`;
    this.fetchFn = options?.fetchFn ?? globalThis.fetch;
    this.logger = options?.logger ?? {
      info: () => {},
      warn: () => {},
      error: () => {},
    };
  }

  async processEvent(event: OutboxRecord): Promise<void> {
    if (event.eventType !== 'order.checkout_reserved') {
      return;
    }

    const payload = event.payload as Partial<CheckoutReservedPayload>;
    if (
      !payload ||
      typeof payload.orderId !== 'string' ||
      typeof payload.paymentEffectKey !== 'string' ||
      typeof payload.totalCents !== 'number'
    ) {
      this.logger.warn(`Invalid or incomplete checkout_reserved payload in event ${event.id}`);
      return;
    }

    this.logger.info(
      `Dispatching payment for order ${payload.orderId} with effectKey ${payload.paymentEffectKey} (${payload.totalCents} cents)`,
    );

    // 1. Ensure payment_attempts row exists
    await this.sql`
      INSERT INTO payment_attempts (
        order_id,
        provider,
        effect_key,
        amount_cents,
        currency,
        status,
        created_at,
        updated_at
      ) VALUES (
        ${payload.orderId},
        'mock',
        ${payload.paymentEffectKey},
        ${payload.totalCents},
        'USD',
        'PENDING',
        NOW(),
        NOW()
      )
      ON CONFLICT (provider, effect_key) DO NOTHING
    `;

    // 2. Dispatch charge to mock payment provider
    const targetUrl = `${this.mockPaymentsUrl}/mock-payments/charges`;
    const chargeBody = {
      effectKey: payload.paymentEffectKey,
      amountCents: String(payload.totalCents),
      currency: 'USD',
      webhookUrl: this.webhookUrl,
      simulateOutcome: 'SUCCESS',
    };

    const res = await this.fetchFn(targetUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(chargeBody),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      this.logger.error(`Payment provider returned ${res.status}: ${errText}`);
      throw new Error(`Payment provider charge failed with status ${res.status}: ${errText}`);
    }

    const data = (await res.json()) as { providerRef?: string; status?: string };
    if (data.providerRef) {
      await this.sql`
        UPDATE payment_attempts
        SET
          provider_ref = ${data.providerRef},
          updated_at = NOW()
        WHERE provider = 'mock' AND effect_key = ${payload.paymentEffectKey}
      `;
    }

    this.logger.info(
      `Payment dispatched successfully for order ${payload.orderId}: providerRef=${data.providerRef}`,
    );
  }
}
