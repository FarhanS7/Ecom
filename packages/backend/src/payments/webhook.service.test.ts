// @shopscale/backend/payments/webhook.service.test.ts - Unit tests for WebhookService (T050).

import { createHmac } from 'node:crypto';
import type { Sql } from 'postgres';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WebhookQuarantineConflictError,
  WebhookService,
} from './webhook.service.js';

describe('WebhookService (T050)', () => {
  const SECRET = 'test-mock-payments-secret-12345678901234567890';
  let mockSql: {
    begin: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
  let mockTx: ReturnType<typeof vi.fn>;

  function sign(timestamp: number, body: string): string {
    return createHmac('sha256', SECRET).update(`${timestamp}.${body}`).digest('hex');
  }

  beforeEach(() => {
    mockTx = Object.assign(vi.fn(), {
      unsafe: vi.fn().mockResolvedValue([
        {
          id: 'outbox-1',
          aggregate_type: 'order',
          aggregate_id: 'ord-123',
          event_type: 'order.payment_observed',
        },
      ]),
    });
    mockSql = {
      begin: vi.fn(async (cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx)),
      json: vi.fn((val: unknown) => val),
    };
  });

  it('processes valid webhook, updates payment attempt, and writes outbox event', async () => {
    const now = Date.now();
    const payload = {
      eventId: '11111111-1111-4111-8111-111111111111',
      type: 'payment.succeeded' as const,
      effectKey: 'eff_test_1',
      amountCents: '10000',
      providerRef: 'mock_ch_123',
      timestamp: now,
    };
    const rawBody = JSON.stringify(payload);
    const signature = sign(now, rawBody);

    // Mock DB queries inside tx
    // 1. check existing webhook_events -> none
    mockTx.mockResolvedValueOnce([]);
    // 2. insert webhook_events -> ok
    mockTx.mockResolvedValueOnce([]);
    // 3. select payment_attempts -> found attempt
    mockTx.mockResolvedValueOnce([
      { id: 'att-1', order_id: 'ord-123', status: 'PENDING', amount_cents: 10000 },
    ]);
    // 4. update payment_attempts -> ok
    mockTx.mockResolvedValueOnce([]);
    // 5. writeOutboxEvent -> ok
    mockTx.mockResolvedValueOnce([
      {
        id: 'outbox-1',
        aggregate_type: 'order',
        aggregate_id: 'ord-123',
        event_type: 'order.payment_observed',
      },
    ]);

    const service = new WebhookService(mockSql as unknown as Sql);
    const result = await service.ingestPaymentWebhook({
      provider: 'mock',
      rawBody,
      signatureHeader: signature,
      timestampHeader: now.toString(),
      secret: SECRET,
    });

    expect(result.status).toBe('processed');
    expect(result.eventId).toBe(payload.eventId);
    expect(mockSql.begin).toHaveBeenCalled();
  });

  it('deduplicates identical replay without writing duplicate outbox event', async () => {
    const now = Date.now();
    const payload = {
      eventId: '22222222-2222-4222-8222-222222222222',
      type: 'payment.succeeded' as const,
      effectKey: 'eff_test_2',
      amountCents: '5000',
      providerRef: 'mock_ch_456',
      timestamp: now,
    };
    const rawBody = JSON.stringify(payload);
    const signature = sign(now, rawBody);

    // Compute expected hash
    const crypto = await import('node:crypto');
    const expectedHash = crypto.createHash('sha256').update(rawBody).digest('hex');

    // 1. check existing webhook_events -> found row with identical hash
    mockTx.mockResolvedValueOnce([
      {
        provider: 'mock',
        event_id: payload.eventId,
        payload_hash: expectedHash,
        status: 'processed',
      },
    ]);

    const service = new WebhookService(mockSql as unknown as Sql);
    const result = await service.ingestPaymentWebhook({
      provider: 'mock',
      rawBody,
      signatureHeader: signature,
      timestampHeader: now.toString(),
      secret: SECRET,
    });

    expect(result.status).toBe('deduplicated');
    expect(result.eventId).toBe(payload.eventId);
    // Should NOT have run inserts or updates
    expect(mockTx).toHaveBeenCalledTimes(1);
  });

  it('quarantines and throws 409 conflict when duplicate eventId has altered payload', async () => {
    const now = Date.now();
    const payload = {
      eventId: '33333333-3333-4333-8333-333333333333',
      type: 'payment.succeeded' as const,
      effectKey: 'eff_test_3',
      amountCents: '7000',
      providerRef: 'mock_ch_789',
      timestamp: now,
    };
    const rawBody = JSON.stringify(payload);
    const signature = sign(now, rawBody);

    // 1. check existing webhook_events -> found row with DIFFERENT hash
    mockTx.mockResolvedValueOnce([
      {
        provider: 'mock',
        event_id: payload.eventId,
        payload_hash: 'different-sha256-hash-value',
        status: 'processed',
      },
    ]);
    // 2. update to quarantined
    mockTx.mockResolvedValueOnce([]);

    const service = new WebhookService(mockSql as unknown as Sql);
    await expect(
      service.ingestPaymentWebhook({
        provider: 'mock',
        rawBody,
        signatureHeader: signature,
        timestampHeader: now.toString(),
        secret: SECRET,
      }),
    ).rejects.toThrow(WebhookQuarantineConflictError);
  });
});
