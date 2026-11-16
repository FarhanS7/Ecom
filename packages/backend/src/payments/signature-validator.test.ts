// @shopscale/backend/payments/signature-validator.test.ts - Unit tests for webhook signature validator (T050).

import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  ExpiredTimestampError,
  InvalidSignatureError,
  MissingSignatureHeadersError,
  validateWebhookSignature,
} from './signature-validator.js';

describe('Webhook Signature Validator (T050)', () => {
  const SECRET = 'test-secret-at-least-32-chars-long-security-requirement';
  const RAW_BODY = JSON.stringify({
    eventId: '11111111-2222-3333-4444-555555555555',
    type: 'payment.succeeded',
    effectKey: 'eff_test_123',
    amountCents: '15000',
    providerRef: 'mock_ch_xyz',
  });

  function sign(timestamp: number, body: string, secret = SECRET): string {
    return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  }

  it('validates a genuine HMAC signature within the timestamp tolerance window', () => {
    const now = Date.now();
    const signature = sign(now, RAW_BODY);

    const result = validateWebhookSignature({
      secret: SECRET,
      signatureHeader: signature,
      timestampHeader: now.toString(),
      rawBody: RAW_BODY,
    });

    expect(result.valid).toBe(true);
    expect(result.timestamp).toBe(now);
  });

  it('supports raw body as Buffer', () => {
    const now = Date.now();
    const signature = sign(now, RAW_BODY);

    const result = validateWebhookSignature({
      secret: SECRET,
      signatureHeader: signature,
      timestampHeader: now.toString(),
      rawBody: Buffer.from(RAW_BODY, 'utf8'),
    });

    expect(result.valid).toBe(true);
  });

  it('throws MissingSignatureHeadersError when signature or timestamp is missing', () => {
    const now = Date.now();
    const signature = sign(now, RAW_BODY);

    expect(() =>
      validateWebhookSignature({
        secret: SECRET,
        signatureHeader: undefined,
        timestampHeader: now.toString(),
        rawBody: RAW_BODY,
      }),
    ).toThrow(MissingSignatureHeadersError);

    expect(() =>
      validateWebhookSignature({
        secret: SECRET,
        signatureHeader: signature,
        timestampHeader: undefined,
        rawBody: RAW_BODY,
      }),
    ).toThrow(MissingSignatureHeadersError);
  });

  it('throws MissingSignatureHeadersError when timestamp is malformed', () => {
    expect(() =>
      validateWebhookSignature({
        secret: SECRET,
        signatureHeader: 'some-hex',
        timestampHeader: 'not-a-number',
        rawBody: RAW_BODY,
      }),
    ).toThrow(MissingSignatureHeadersError);
  });

  it('throws ExpiredTimestampError when timestamp is older than 5 minutes', () => {
    const oldTimestamp = Date.now() - 301_000;
    const signature = sign(oldTimestamp, RAW_BODY);

    expect(() =>
      validateWebhookSignature({
        secret: SECRET,
        signatureHeader: signature,
        timestampHeader: oldTimestamp.toString(),
        rawBody: RAW_BODY,
      }),
    ).toThrow(ExpiredTimestampError);
  });

  it('throws ExpiredTimestampError when timestamp is too far in future', () => {
    const futureTimestamp = Date.now() + 350_000;
    const signature = sign(futureTimestamp, RAW_BODY);

    expect(() =>
      validateWebhookSignature({
        secret: SECRET,
        signatureHeader: signature,
        timestampHeader: futureTimestamp.toString(),
        rawBody: RAW_BODY,
      }),
    ).toThrow(ExpiredTimestampError);
  });

  it('throws InvalidSignatureError when single character in body is modified', () => {
    const now = Date.now();
    const signature = sign(now, RAW_BODY);
    const tampered = RAW_BODY.replace('15000', '15001');

    expect(() =>
      validateWebhookSignature({
        secret: SECRET,
        signatureHeader: signature,
        timestampHeader: now.toString(),
        rawBody: tampered,
      }),
    ).toThrow(InvalidSignatureError);
  });

  it('throws InvalidSignatureError when signed with wrong secret', () => {
    const now = Date.now();
    const wrongSignature = sign(now, RAW_BODY, 'wrong-secret-key-32-chars-long-00000000');

    expect(() =>
      validateWebhookSignature({
        secret: SECRET,
        signatureHeader: wrongSignature,
        timestampHeader: now.toString(),
        rawBody: RAW_BODY,
      }),
    ).toThrow(InvalidSignatureError);
  });

  it('throws InvalidSignatureError on short or empty signature without throwing range error', () => {
    const now = Date.now();

    expect(() =>
      validateWebhookSignature({
        secret: SECRET,
        signatureHeader: 'short',
        timestampHeader: now.toString(),
        rawBody: RAW_BODY,
      }),
    ).toThrow(InvalidSignatureError);
  });
});
