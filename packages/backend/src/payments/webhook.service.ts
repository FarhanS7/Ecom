// @shopscale/backend/payments/webhook.service - Ingestion, signature validation, deduplication, and outbox event recording (T050).
// Invariants (OR-3, G3, PRD 6.5):
// 1. Signature validation over raw request buffer ensures cryptographic tamper resistance.
// 2. PRIMARY KEY(provider, event_id) guarantees deduplication of repeated webhook deliveries.
// 3. Detecting altered payload for an existing event_id flags quarantine and throws 409 Conflict.
// 4. Atomic transaction commits webhook receipt, payment_attempts update, and PaymentObserved outbox event.

import { createHash } from 'node:crypto';
import type { Sql } from 'postgres';
import { paymentWebhookPayloadSchema } from '@shopscale/contracts';
import { getDb } from '../db/client.js';
import { writeOutboxEvent } from '../platform/outbox.service.js';
import { validateWebhookSignature } from './signature-validator.js';

export class WebhookQuarantineConflictError extends Error {
  constructor(
    public readonly provider: string,
    public readonly eventId: string,
  ) {
    super(`Quarantined webhook event '${eventId}' for provider '${provider}': payload hash mismatch`);
    this.name = 'WebhookQuarantineConflictError';
  }
}

export interface IngestWebhookInput {
  provider: string;
  rawBody: string | Buffer;
  signatureHeader?: string | string[] | undefined;
  timestampHeader?: string | string[] | undefined;
  secret: string;
}

export interface IngestWebhookResult {
  status: 'processed' | 'deduplicated';
  eventId: string;
  provider: string;
}

interface PaymentAttemptDbRow {
  id: string;
  order_id: string;
  status: string;
  amount_cents: number;
}

interface WebhookEventDbRow {
  provider: string;
  event_id: string;
  payload_hash: string;
  status: string;
}

export class WebhookService {
  constructor(private readonly explicitSql?: Sql) {}

  private getSql(): Sql {
    return this.explicitSql ?? getDb();
  }

  public async ingestPaymentWebhook(input: IngestWebhookInput): Promise<IngestWebhookResult> {
    const { provider, rawBody, signatureHeader, timestampHeader, secret } = input;

    // 1. Validate signature & timestamp
    validateWebhookSignature({
      secret,
      signatureHeader,
      timestampHeader,
      rawBody,
    });

    // 2. Parse & validate JSON payload
    const bodyStr = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
    const rawParsed: unknown = JSON.parse(bodyStr || '{}');
    const payload = paymentWebhookPayloadSchema.parse(rawParsed);

    // 3. Compute deterministic payload hash for conflict detection
    const payloadHash = createHash('sha256').update(bodyStr).digest('hex');

    const sql = this.getSql();

    return await sql.begin(async (tx) => {
      // 4. Check for existing webhook event with (provider, event_id)
      const existing = (await tx`
        SELECT provider, event_id, payload_hash, status
        FROM webhook_events
        WHERE provider = ${provider} AND event_id = ${payload.eventId}
        FOR UPDATE
      `) as unknown as WebhookEventDbRow[];

      if (existing.length > 0) {
        const row = existing[0]!;
        if (row.payload_hash === payloadHash) {
          // Identical replay: deduplicate cleanly
          return {
            status: 'deduplicated',
            eventId: payload.eventId,
            provider,
          };
        }

        // Altered payload for same event ID: mark quarantined & throw 409
        await tx`
          UPDATE webhook_events
          SET status = 'quarantined'
          WHERE provider = ${provider} AND event_id = ${payload.eventId}
        `;
        throw new WebhookQuarantineConflictError(provider, payload.eventId);
      }

      // 5. Insert new webhook_events row
      await tx`
        INSERT INTO webhook_events (
          provider,
          event_id,
          payload_hash,
          payload,
          status,
          processed_at
        ) VALUES (
          ${provider},
          ${payload.eventId},
          ${payloadHash},
          ${JSON.stringify(payload)}::jsonb,
          'processed',
          NOW()
        )
      `;

      // 6. Look up associated payment attempt by effectKey
      const paymentAttemptRows = (await tx`
        SELECT id, order_id, status, amount_cents
        FROM payment_attempts
        WHERE effect_key = ${payload.effectKey}
        FOR UPDATE
      `) as unknown as PaymentAttemptDbRow[];

      const paymentStatus = payload.type === 'payment.succeeded' ? 'PAID' : 'FAILED';
      let orderId: string | null = null;

      if (paymentAttemptRows.length > 0) {
        const attempt = paymentAttemptRows[0]!;
        orderId = attempt.order_id;

        await tx`
          UPDATE payment_attempts
          SET
            status = ${paymentStatus},
            provider_ref = ${payload.providerRef},
            updated_at = NOW()
          WHERE id = ${attempt.id}
        `;
      }

      // 7. Write PaymentObserved domain event to transactional outbox
      const aggregateId = orderId ?? payload.eventId;

      await writeOutboxEvent(tx, {
        aggregateType: 'order',
        aggregateId,
        type: 'order.payment_observed',
        payload: {
          eventId: payload.eventId,
          type: payload.type,
          effectKey: payload.effectKey,
          amountCents: payload.amountCents,
          providerRef: payload.providerRef,
          status: paymentStatus,
          timestamp: payload.timestamp,
        },
        correlationId: payload.effectKey,
        causationId: payload.eventId,
      });

      return {
        status: 'processed',
        eventId: payload.eventId,
        provider,
      };
    });
  }
}

export const webhookService = new WebhookService();
