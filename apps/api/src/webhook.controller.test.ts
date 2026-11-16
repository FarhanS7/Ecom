// @shopscale/api/webhook.controller.test - Unit tests for WebhookController (T050)
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { WebhookController } from './webhook.controller.js';
import {
  ExpiredTimestampError,
  InvalidSignatureError,
  MissingSignatureHeadersError,
  WebhookQuarantineConflictError,
  webhookService,
} from '@shopscale/backend';

vi.mock('@shopscale/config', () => ({
  getEnv: vi.fn(() => ({
    MOCK_PAYMENTS_SECRET: 'test-secret-that-is-at-least-32-chars-long-000000',
  })),
}));

vi.mock('@shopscale/backend', () => ({
  webhookService: {
    ingestPaymentWebhook: vi.fn(),
  },
  MissingSignatureHeadersError: class MissingSignatureHeadersError extends Error {
    constructor(msg = 'Missing required webhook signature headers') {
      super(msg);
      this.name = 'MissingSignatureHeadersError';
    }
  },
  ExpiredTimestampError: class ExpiredTimestampError extends Error {
    constructor(msg = 'Webhook timestamp expired') {
      super(msg);
      this.name = 'ExpiredTimestampError';
    }
  },
  InvalidSignatureError: class InvalidSignatureError extends Error {
    constructor(msg = 'Invalid webhook HMAC signature') {
      super(msg);
      this.name = 'InvalidSignatureError';
    }
  },
  WebhookQuarantineConflictError: class WebhookQuarantineConflictError extends Error {
    constructor(provider: string, eventId: string) {
      super(`Webhook event ${provider}:${eventId} received with conflicting payload.`);
      this.name = 'WebhookQuarantineConflictError';
    }
  },
}));

describe('WebhookController (T050 Unit Tests)', () => {
  let controller: WebhookController;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new WebhookController();
  });

  it('processes valid payment webhook and returns 200 with eventId and processed status', async () => {
    vi.mocked(webhookService.ingestPaymentWebhook).mockResolvedValueOnce({
      status: 'processed',
      eventId: 'evt-123',
      provider: 'mock-payments',
    });

    const bodyBuffer = Buffer.from(JSON.stringify({ eventId: 'evt-123' }), 'utf-8');
    const result = await controller.handlePaymentWebhook(
      { rawBody: bodyBuffer },
      'valid-sig',
      '1700000000',
    );

    expect(result).toEqual({
      received: true,
      eventId: 'evt-123',
      status: 'processed',
    });
    expect(webhookService.ingestPaymentWebhook).toHaveBeenCalledWith({
      provider: 'mock-payments',
      rawBody: bodyBuffer.toString('utf-8'),
      signatureHeader: 'valid-sig',
      timestampHeader: '1700000000',
      secret: 'test-secret-that-is-at-least-32-chars-long-000000',
    });
  });

  it('handles duplicate webhook idempotently returning duplicate status', async () => {
    vi.mocked(webhookService.ingestPaymentWebhook).mockResolvedValueOnce({
      status: 'duplicate',
      eventId: 'evt-123',
      provider: 'mock-payments',
    });

    const result = await controller.handlePaymentWebhook(
      { rawBody: '{"eventId":"evt-123"}' },
      'valid-sig',
      '1700000000',
    );

    expect(result).toEqual({
      received: true,
      eventId: 'evt-123',
      status: 'duplicate',
    });
  });

  it('translates MissingSignatureHeadersError to 400 BadRequestException', async () => {
    vi.mocked(webhookService.ingestPaymentWebhook).mockRejectedValueOnce(
      new MissingSignatureHeadersError('Missing signature header'),
    );

    await expect(
      controller.handlePaymentWebhook({ rawBody: '{}' }, undefined, undefined),
    ).rejects.toThrow(BadRequestException);
  });

  it('translates ExpiredTimestampError to 400 BadRequestException', async () => {
    vi.mocked(webhookService.ingestPaymentWebhook).mockRejectedValueOnce(
      new ExpiredTimestampError('Expired timestamp'),
    );

    await expect(
      controller.handlePaymentWebhook({ rawBody: '{}' }, 'sig', '1000'),
    ).rejects.toThrow(BadRequestException);
  });

  it('translates InvalidSignatureError to 401 UnauthorizedException', async () => {
    vi.mocked(webhookService.ingestPaymentWebhook).mockRejectedValueOnce(
      new InvalidSignatureError('Invalid signature'),
    );

    await expect(
      controller.handlePaymentWebhook({ rawBody: '{}' }, 'bad-sig', '1700000000'),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('translates WebhookQuarantineConflictError to 409 ConflictException', async () => {
    vi.mocked(webhookService.ingestPaymentWebhook).mockRejectedValueOnce(
      new WebhookQuarantineConflictError('mock-payments', 'evt-123'),
    );

    await expect(
      controller.handlePaymentWebhook({ rawBody: '{}' }, 'sig', '1700000000'),
    ).rejects.toThrow(ConflictException);
  });

  it('falls back to stringifying req.body when req.rawBody is missing', async () => {
    vi.mocked(webhookService.ingestPaymentWebhook).mockResolvedValueOnce({
      status: 'processed',
      eventId: 'evt-fallback',
      provider: 'mock-payments',
    });

    const reqBody = { eventId: 'evt-fallback', type: 'payment.succeeded' };
    const result = await controller.handlePaymentWebhook(
      { body: reqBody },
      'sig',
      '1700000000',
    );

    expect(result).toEqual({
      received: true,
      eventId: 'evt-fallback',
      status: 'processed',
    });
    expect(webhookService.ingestPaymentWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        rawBody: JSON.stringify(reqBody),
      }),
    );
  });
});
