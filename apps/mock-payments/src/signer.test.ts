// @shopscale/mock-payments/signer.test.ts - Unit tests for HMAC webhook signing and verification (T049).

import { describe, expect, it } from 'vitest';
import {
  computeHmacSignature,
  signWebhookPayload,
  verifyWebhookSignature,
} from './signer.js';

describe('HMAC Webhook Signer (T049)', () => {
  const SECRET = 'test-mock-payments-secret-12345678901234567890';
  const SAMPLE_PAYLOAD = {
    eventId: '11111111-2222-3333-4444-555555555555',
    type: 'payment.succeeded',
    effectKey: 'eff_test_123',
    amountCents: '10000',
    providerRef: 'mock_ch_abc',
    timestamp: 1700000000000,
  };

  it('generates a 64-character hex HMAC-SHA256 signature', () => {
    const timestamp = Date.now();
    const rawBody = JSON.stringify(SAMPLE_PAYLOAD);
    const signature = computeHmacSignature(SECRET, timestamp, rawBody);

    expect(signature).toHaveLength(64);
    expect(signature).toMatch(/^[a-f0-9]{64}$/);
  });

  it('includes timestamp and rawBody in signed content', () => {
    const t1 = 1700000000000;
    const t2 = 1700000000001;
    const rawBody = JSON.stringify(SAMPLE_PAYLOAD);

    const sig1 = computeHmacSignature(SECRET, t1, rawBody);
    const sig2 = computeHmacSignature(SECRET, t2, rawBody);

    expect(sig1).not.toBe(sig2);
  });

  it('signWebhookPayload returns timestamp, signature, and rawBody', () => {
    const fixedNow = 1700000000000;
    const result = signWebhookPayload(SECRET, SAMPLE_PAYLOAD, fixedNow);

    expect(result.timestamp).toBe(fixedNow);
    expect(result.signature).toHaveLength(64);
    expect(JSON.parse(result.rawBody)).toEqual(SAMPLE_PAYLOAD);
  });

  it('verifyWebhookSignature validates genuine signature within tolerance window', () => {
    const now = Date.now();
    const signed = signWebhookPayload(SECRET, SAMPLE_PAYLOAD, now);

    const check = verifyWebhookSignature(SECRET, signed.signature, signed.timestamp, signed.rawBody);
    expect(check.valid).toBe(true);
    expect(check.reason).toBeUndefined();
  });

  it('rejects tampered raw payload body (one character difference)', () => {
    const now = Date.now();
    const signed = signWebhookPayload(SECRET, SAMPLE_PAYLOAD, now);

    const tamperedBody = signed.rawBody.replace('payment.succeeded', 'payment.failed');
    const check = verifyWebhookSignature(SECRET, signed.signature, signed.timestamp, tamperedBody);

    expect(check.valid).toBe(false);
    expect(check.reason).toBe('INVALID_SIGNATURE');
  });

  it('rejects tampered timestamp', () => {
    const now = Date.now();
    const signed = signWebhookPayload(SECRET, SAMPLE_PAYLOAD, now);

    const check = verifyWebhookSignature(SECRET, signed.signature, now - 1000, signed.rawBody);
    expect(check.valid).toBe(false);
    expect(check.reason).toBe('INVALID_SIGNATURE');
  });

  it('rejects signature generated with a different secret', () => {
    const now = Date.now();
    const signed = signWebhookPayload('different-secret-key-1234567890123456', SAMPLE_PAYLOAD, now);

    const check = verifyWebhookSignature(SECRET, signed.signature, signed.timestamp, signed.rawBody);
    expect(check.valid).toBe(false);
    expect(check.reason).toBe('INVALID_SIGNATURE');
  });

  it('rejects expired timestamp exceeding maxAgeMs window', () => {
    const oldTimestamp = Date.now() - 400_000; // > 5 minutes ago
    const signed = signWebhookPayload(SECRET, SAMPLE_PAYLOAD, oldTimestamp);

    const check = verifyWebhookSignature(SECRET, signed.signature, signed.timestamp, signed.rawBody, 300_000);
    expect(check.valid).toBe(false);
    expect(check.reason).toBe('EXPIRED_TIMESTAMP');
  });

  it('safely handles empty or malformed inputs without throwing', () => {
    expect(verifyWebhookSignature(SECRET, '', Date.now(), '{}')).toEqual({
      valid: false,
      reason: 'EMPTY_SIGNATURE',
    });

    expect(verifyWebhookSignature(SECRET, 'invalid-hex', 0, '{}')).toEqual({
      valid: false,
      reason: 'MALFORMED_TIMESTAMP',
    });

    expect(verifyWebhookSignature(SECRET, 'short', Date.now(), '{}')).toEqual({
      valid: false,
      reason: 'INVALID_SIGNATURE',
    });
  });
});
