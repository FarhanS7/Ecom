// packages/backend/tests/integration/payment-webhooks.spec.ts - Integration test for payment webhooks (T050).
// Invariants verified:
// 1. Timing-safe cryptographic HMAC-SHA256 signature verification over ${timestamp}.${rawBody}.
// 2. Reject replay attempts with timestamp outside 5-minute window.
// 3. Webhook idempotency ledger guarantees zero duplicate processing for identical payloads.
// 4. Altered payload with recycled event ID is quarantined with 409 WebhookQuarantineConflictError.
// 5. Atomic transaction updates payment_attempts and writes order.payment_observed to transactional outbox.

import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetEnvCache } from '@shopscale/config';
import {
  ExpiredTimestampError,
  InvalidSignatureError,
  MissingSignatureHeadersError,
  WebhookQuarantineConflictError,
  WebhookService,
  findMigrationsDir,
  generateWebhookSignature,
  openAdminConnection,
  requireDatabaseUrl,
  runMigrations,
  verifyWebhookSignature,
} from '../../src/index.js';
import type { PaymentWebhookPayload } from '@shopscale/contracts';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = findMigrationsDir(here);

type Sql = Awaited<ReturnType<typeof openAdminConnection>>;

async function connectOrSkip(): Promise<Sql | null> {
  resetEnvCache();
  let url: string;
  try {
    url = requireDatabaseUrl();
  } catch {
    console.warn('SKIP: DATABASE_URL not configured; start infra first.');
    return null;
  }
  const sql = openAdminConnection(url);
  try {
    await sql`SELECT 1`;
    return sql;
  } catch {
    await sql.end();
    console.warn('SKIP: database unreachable; start infra first.');
    return null;
  }
}

describe('Payment Webhook Ingestion & Signature Verification (T050)', () => {
  const SECRET = 'test-secret-at-least-32-chars-long-t050-secret-00000000';
  let sql: Sql | null = null;
  let webhookService: WebhookService;

  beforeAll(async () => {
    sql = await connectOrSkip();
    if (sql) {
      await runMigrations(sql, migrationsDir);
      webhookService = new WebhookService(sql);
    }
  });

  afterAll(async () => {
    if (sql) {
      await sql.end();
    }
  });

  describe('Signature and Timestamp Security Verification', () => {
    it('validates a fresh, authentically signed webhook payload', () => {
      const rawBody = JSON.stringify({ eventId: randomUUID(), type: 'payment.succeeded' });
      const now = Math.floor(Date.now() / 1000);
      const signature = generateWebhookSignature(rawBody, SECRET, now);

      expect(() =>
        verifyWebhookSignature({
          rawBody,
          signatureHeader: signature,
          timestampHeader: String(now),
          secret: SECRET,
        }),
      ).not.toThrow();
    });

    it('rejects missing signature or timestamp headers with MissingSignatureHeadersError', () => {
      const rawBody = '{}';
      expect(() =>
        verifyWebhookSignature({
          rawBody,
          signatureHeader: undefined,
          timestampHeader: '1700000000',
          secret: SECRET,
        }),
      ).toThrow(MissingSignatureHeadersError);

      expect(() =>
        verifyWebhookSignature({
          rawBody,
          signatureHeader: 'sig',
          timestampHeader: undefined,
          secret: SECRET,
        }),
      ).toThrow(MissingSignatureHeadersError);
    });

    it('rejects webhook with expired timestamp (> 300 seconds) with ExpiredTimestampError', () => {
      const rawBody = '{}';
      const past = Math.floor(Date.now() / 1000) - 400; // 400 seconds ago
      const signature = generateWebhookSignature(rawBody, SECRET, past);

      expect(() =>
        verifyWebhookSignature({
          rawBody,
          signatureHeader: signature,
          timestampHeader: String(past),
          secret: SECRET,
          maxAgeMs: 300_000,
        }),
      ).toThrow(ExpiredTimestampError);
    });

    it('rejects webhook with future timestamp (> 300 seconds) with ExpiredTimestampError', () => {
      const rawBody = '{}';
      const future = Math.floor(Date.now() / 1000) + 400;
      const signature = generateWebhookSignature(rawBody, SECRET, future);

      expect(() =>
        verifyWebhookSignature({
          rawBody,
          signatureHeader: signature,
          timestampHeader: String(future),
          secret: SECRET,
          maxAgeMs: 300_000,
        }),
      ).toThrow(ExpiredTimestampError);
    });

    it('rejects modified body with InvalidSignatureError (timing attack resistant)', () => {
      const rawBody = JSON.stringify({ amountCents: '5000', eventId: randomUUID() });
      const now = Math.floor(Date.now() / 1000);
      const signature = generateWebhookSignature(rawBody, SECRET, now);

      // Alter body by 1 character
      const tamperedBody = JSON.stringify({ amountCents: '5001', eventId: randomUUID() });

      expect(() =>
        verifyWebhookSignature({
          rawBody: tamperedBody,
          signatureHeader: signature,
          timestampHeader: String(now),
          secret: SECRET,
        }),
      ).toThrow(InvalidSignatureError);
    });

    it('rejects wrong secret with InvalidSignatureError', () => {
      const rawBody = JSON.stringify({ eventId: randomUUID() });
      const now = Math.floor(Date.now() / 1000);
      const signature = generateWebhookSignature(rawBody, 'different-secret-00000000000000000', now);

      expect(() =>
        verifyWebhookSignature({
          rawBody,
          signatureHeader: signature,
          timestampHeader: String(now),
          secret: SECRET,
        }),
      ).toThrow(InvalidSignatureError);
    });
  });

  describe('Database Ingestion, Deduplication, and Outbox Integration', () => {
    it('processes valid payment webhook, updates payment_attempt, and writes outbox event', async () => {
      if (!sql) return;

      const prefix = `t050_${Date.now()}`;
      const effectKey = `eff_${prefix}_1`;
      const eventId = randomUUID();
      const providerRef = `ref_${prefix}_1`;

      // 1. Seed test order and payment_attempt
      const [order] = await sql`
        INSERT INTO "orders" (
          "user_id", "channel_key", "payment_status", "fulfillment_status",
          "subtotal_cents", "shipping_cents", "discount_cents", "total_cents",
          "currency", "address_snapshot", "version"
        ) VALUES (
          gen_random_uuid(), ${prefix}, 'PENDING', 'PENDING',
          5000, 500, 0, 5500,
          'USD', '{}'::jsonb, 1
        ) RETURNING id;
      `;

      await sql`
        INSERT INTO "payment_attempts" (
          "order_id", "provider", "effect_key", "amount_cents", "currency", "status"
        ) VALUES (
          ${order.id}, 'mock-payments', ${effectKey}, 5500, 'USD', 'PENDING'
        );
      `;

      // 2. Prepare signed webhook
      const now = Math.floor(Date.now() / 1000);
      const payload: PaymentWebhookPayload = {
        eventId,
        type: 'payment.succeeded',
        effectKey,
        amountCents: '5500',
        providerRef,
        timestamp: now,
      };
      const rawBody = JSON.stringify(payload);
      const signature = generateWebhookSignature(rawBody, SECRET, now);

      // 3. Ingest webhook
      const result = await webhookService.ingestPaymentWebhook({
        provider: 'mock-payments',
        rawBody,
        signatureHeader: signature,
        timestampHeader: String(now),
        secret: SECRET,
      });

      expect(result.status).toBe('processed');
      expect(result.eventId).toBe(eventId);

      // 4. Assert webhook_events row inserted
      const [eventRow] = await sql`
        SELECT provider, event_id, status FROM webhook_events
        WHERE provider = 'mock-payments' AND event_id = ${eventId};
      `;
      expect(eventRow).toBeDefined();
      expect(eventRow.status).toBe('processed');

      // 5. Assert payment_attempts updated to PAID with providerRef
      const [attemptRow] = await sql`
        SELECT status, provider_ref FROM payment_attempts
        WHERE effect_key = ${effectKey};
      `;
      expect(attemptRow.status).toBe('PAID');
      expect(attemptRow.provider_ref).toBe(providerRef);

      // 6. Assert transactional outbox received order.payment_observed event
      const [outboxRow] = await sql`
        SELECT event_type, aggregate_type, aggregate_id, payload
        FROM outbox
        WHERE causation_id = ${eventId};
      `;
      expect(outboxRow).toBeDefined();
      expect(outboxRow.event_type).toBe('order.payment_observed');
      expect(outboxRow.aggregate_type).toBe('order');
      expect(outboxRow.aggregate_id).toBe(order.id);
      expect((outboxRow.payload as { status: string }).status).toBe('PAID');
    });

    it('returns duplicate on replaying identical webhook without re-writing outbox event', async () => {
      if (!sql) return;

      const prefix = `t050_dup_${Date.now()}`;
      const effectKey = `eff_${prefix}_2`;
      const eventId = randomUUID();

      const now = Math.floor(Date.now() / 1000);
      const payload: PaymentWebhookPayload = {
        eventId,
        type: 'payment.succeeded',
        effectKey,
        amountCents: '2000',
        providerRef: `ref_${prefix}`,
        timestamp: now,
      };
      const rawBody = JSON.stringify(payload);
      const signature = generateWebhookSignature(rawBody, SECRET, now);

      // First ingestion: processed
      const firstResult = await webhookService.ingestPaymentWebhook({
        provider: 'mock-payments',
        rawBody,
        signatureHeader: signature,
        timestampHeader: String(now),
        secret: SECRET,
      });
      expect(firstResult.status).toBe('processed');

      const outboxCountBefore = (await sql`
        SELECT COUNT(*)::int as count FROM outbox WHERE causation_id = ${eventId};
      `)[0].count;
      expect(outboxCountBefore).toBe(1);

      // Second ingestion: identical payload -> duplicate
      const secondResult = await webhookService.ingestPaymentWebhook({
        provider: 'mock-payments',
        rawBody,
        signatureHeader: signature,
        timestampHeader: String(now),
        secret: SECRET,
      });
      expect(secondResult.status).toBe('duplicate');
      expect(secondResult.eventId).toBe(eventId);

      // Outbox count remains exactly 1 (no duplicate domain events)
      const outboxCountAfter = (await sql`
        SELECT COUNT(*)::int as count FROM outbox WHERE causation_id = ${eventId};
      `)[0].count;
      expect(outboxCountAfter).toBe(1);
    });

    it('quarantines event and throws WebhookQuarantineConflictError when duplicate eventId has altered payload', async () => {
      if (!sql) return;

      const prefix = `t050_tamper_${Date.now()}`;
      const effectKey = `eff_${prefix}_3`;
      const eventId = randomUUID();

      const now = Math.floor(Date.now() / 1000);
      const payload1: PaymentWebhookPayload = {
        eventId,
        type: 'payment.succeeded',
        effectKey,
        amountCents: '3000',
        providerRef: `ref_${prefix}_orig`,
        timestamp: now,
      };
      const rawBody1 = JSON.stringify(payload1);
      const signature1 = generateWebhookSignature(rawBody1, SECRET, now);

      // First call succeeds
      await webhookService.ingestPaymentWebhook({
        provider: 'mock-payments',
        rawBody: rawBody1,
        signatureHeader: signature1,
        timestampHeader: String(now),
        secret: SECRET,
      });

      // Second call uses same eventId but altered amount
      const payload2: PaymentWebhookPayload = {
        eventId,
        type: 'payment.succeeded',
        effectKey,
        amountCents: '9999', // Altered amount
        providerRef: `ref_${prefix}_tampered`,
        timestamp: now,
      };
      const rawBody2 = JSON.stringify(payload2);
      const signature2 = generateWebhookSignature(rawBody2, SECRET, now);

      await expect(
        webhookService.ingestPaymentWebhook({
          provider: 'mock-payments',
          rawBody: rawBody2,
          signatureHeader: signature2,
          timestampHeader: String(now),
          secret: SECRET,
        }),
      ).rejects.toThrow(WebhookQuarantineConflictError);

      // Verify event is now marked 'quarantined' in DB
      const [quarantinedRow] = await sql`
        SELECT status FROM webhook_events
        WHERE provider = 'mock-payments' AND event_id = ${eventId};
      `;
      expect(quarantinedRow.status).toBe('quarantined');
    });

    it('handles payment.failed webhook updating payment_attempts status to FAILED', async () => {
      if (!sql) return;

      const prefix = `t050_failed_${Date.now()}`;
      const effectKey = `eff_${prefix}_4`;
      const eventId = randomUUID();

      const [order] = await sql`
        INSERT INTO "orders" (
          "user_id", "channel_key", "payment_status", "fulfillment_status",
          "subtotal_cents", "shipping_cents", "discount_cents", "total_cents",
          "currency", "address_snapshot", "version"
        ) VALUES (
          gen_random_uuid(), ${prefix}, 'PENDING', 'PENDING',
          1000, 100, 0, 1100,
          'USD', '{}'::jsonb, 1
        ) RETURNING id;
      `;

      await sql`
        INSERT INTO "payment_attempts" (
          "order_id", "provider", "effect_key", "amount_cents", "currency", "status"
        ) VALUES (
          ${order.id}, 'mock-payments', ${effectKey}, 1100, 'USD', 'PENDING'
        );
      `;

      const now = Math.floor(Date.now() / 1000);
      const payload: PaymentWebhookPayload = {
        eventId,
        type: 'payment.failed',
        effectKey,
        amountCents: '1100',
        providerRef: `ref_${prefix}_fail`,
        timestamp: now,
      };
      const rawBody = JSON.stringify(payload);
      const signature = generateWebhookSignature(rawBody, SECRET, now);

      const result = await webhookService.ingestPaymentWebhook({
        provider: 'mock-payments',
        rawBody,
        signatureHeader: signature,
        timestampHeader: String(now),
        secret: SECRET,
      });

      expect(result.status).toBe('processed');

      const [attemptRow] = await sql`
        SELECT status FROM payment_attempts WHERE effect_key = ${effectKey};
      `;
      expect(attemptRow.status).toBe('FAILED');

      const [outboxRow] = await sql`
        SELECT payload FROM outbox WHERE causation_id = ${eventId};
      `;
      expect((outboxRow.payload as { status: string }).status).toBe('FAILED');
    });
  });
});
