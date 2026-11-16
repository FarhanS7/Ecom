// @shopscale/mock-payments/simulator - Mock payment simulator engine with signed webhook dispatcher (T049).
// Invariants:
// 1. Simulates charges, delays, declines, and timeouts deterministically.
// 2. Dispatches asynchronous HMAC-SHA256 signed webhooks to target receiver.
// 3. Captures attempt records in ledger with conflict rejection.

import { randomUUID } from 'node:crypto';
import type {
  MockChargeRequestDto,
  MockChargeResponseDto,
  PaymentOutcome,
  PaymentWebhookPayload,
} from '@shopscale/contracts';
import { mockChargeRequestSchema } from '@shopscale/contracts';
import { MockPaymentLedger } from './ledger.js';
import { signWebhookPayload } from './signer.js';

export interface MockPaymentSimulatorOptions {
  secret: string;
  defaultWebhookUrl?: string;
  fetcher?: typeof fetch;
}

export interface WebhookDispatchResult {
  eventId: string;
  url: string;
  status: number;
  ok: boolean;
  error?: string;
}

export class MockPaymentSimulator {
  public readonly ledger = new MockPaymentLedger();
  private readonly secret: string;
  private readonly defaultWebhookUrl: string;
  private readonly fetcher: typeof fetch;
  private readonly dispatchedWebhooks: WebhookDispatchResult[] = [];

  constructor(options: MockPaymentSimulatorOptions) {
    this.secret = options.secret;
    this.defaultWebhookUrl = options.defaultWebhookUrl ?? 'http://127.0.0.1:3000/v1/webhooks/payments';
    this.fetcher = options.fetcher ?? globalThis.fetch;
  }

  public charge(
    request: MockChargeRequestDto,
    headerOverrides: { outcome?: string; delayMs?: number } = {},
  ): MockChargeResponseDto {
    const validated = mockChargeRequestSchema.parse(request);

    const outcome: PaymentOutcome =
      (headerOverrides.outcome as PaymentOutcome) ?? validated.simulateOutcome ?? 'SUCCESS';
    const delayMs = headerOverrides.delayMs ?? validated.delayMs ?? 0;
    const webhookUrl = validated.webhookUrl ?? this.defaultWebhookUrl;
    const providerRef = `mock_ch_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

    const { entry, isNew } = this.ledger.recordAttempt({
      effectKey: validated.effectKey,
      providerRef,
      amountCents: validated.amountCents,
      currency: validated.currency,
      simulateOutcome: outcome,
      returnUrl: validated.returnUrl,
      webhookUrl,
    });

    if (isNew) {
      if (outcome === 'SUCCESS' || outcome === 'DECLINED') {
        const scheduleDispatch = () => {
          void this.dispatchWebhook({
            effectKey: entry.effectKey,
            amountCents: entry.amountCents,
            providerRef: entry.providerRef,
            outcome,
            webhookUrl,
          });
        };

        if (delayMs > 0) {
          setTimeout(scheduleDispatch, delayMs);
        } else {
          // Asynchronous dispatch via microtask
          queueMicrotask(scheduleDispatch);
        }
      }
    }

    return {
      effectKey: entry.effectKey,
      providerRef: entry.providerRef,
      status: entry.status,
      amountCents: entry.amountCents,
      currency: entry.currency,
      simulateOutcome: entry.simulateOutcome,
      createdAt: entry.createdAt,
    };
  }

  public async dispatchWebhook(params: {
    effectKey: string;
    amountCents: string;
    providerRef: string;
    outcome: 'SUCCESS' | 'DECLINED';
    webhookUrl: string;
  }): Promise<WebhookDispatchResult> {
    const eventId = randomUUID();
    const type = params.outcome === 'SUCCESS' ? 'payment.succeeded' : 'payment.failed';
    const payload: PaymentWebhookPayload = {
      eventId,
      type,
      effectKey: params.effectKey,
      amountCents: params.amountCents,
      providerRef: params.providerRef,
      timestamp: Date.now(),
    };

    const signed = signWebhookPayload(this.secret, payload);

    try {
      const response = await this.fetcher(params.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-ShopScale-Timestamp': signed.timestamp.toString(),
          'X-ShopScale-Signature': signed.signature,
        },
        body: signed.rawBody,
      });

      const nextStatus = params.outcome === 'SUCCESS' ? 'SUCCEEDED' : 'FAILED';
      this.ledger.updateStatus(params.effectKey, nextStatus);

      const result: WebhookDispatchResult = {
        eventId,
        url: params.webhookUrl,
        status: response.status,
        ok: response.ok,
      };
      this.dispatchedWebhooks.push(result);
      return result;
    } catch (err) {
      const result: WebhookDispatchResult = {
        eventId,
        url: params.webhookUrl,
        status: 0,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
      this.dispatchedWebhooks.push(result);
      return result;
    }
  }

  public getDispatchedWebhooks(): readonly WebhookDispatchResult[] {
    return this.dispatchedWebhooks;
  }

  public clear(): void {
    this.ledger.clear();
    this.dispatchedWebhooks.length = 0;
  }
}
