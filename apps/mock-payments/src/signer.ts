// @shopscale/mock-payments/signer - HMAC-SHA256 signature generator and timing-safe validator (T049).
// Invariants:
// 1. Signature = HMAC-SHA256(secret, `${timestamp}.${rawBody}`).
// 2. Sent in headers: X-ShopScale-Timestamp and X-ShopScale-Signature.
// 3. Timing-safe comparison prevents timing side-channel attacks.
// 4. Maximum tolerance window: 5 minutes (300,000ms) by default.

import { createHmac, timingSafeEqual } from 'node:crypto';

export interface SignedWebhookResult {
  timestamp: number;
  signature: string;
  rawBody: string;
}

export interface VerifySignatureResult {
  valid: boolean;
  reason?: 'EXPIRED_TIMESTAMP' | 'INVALID_SIGNATURE' | 'MALFORMED_TIMESTAMP' | 'EMPTY_SIGNATURE';
}

export function computeHmacSignature(secret: string, timestamp: number, rawBody: string): string {
  const payloadToSign = `${timestamp}.${rawBody}`;
  return createHmac('sha256', secret).update(payloadToSign).digest('hex');
}

export function signWebhookPayload(
  secret: string,
  payload: unknown,
  timestamp: number = Date.now(),
): SignedWebhookResult {
  const rawBody = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const signature = computeHmacSignature(secret, timestamp, rawBody);
  return { timestamp, signature, rawBody };
}

export function verifyWebhookSignature(
  secret: string,
  signature: string,
  timestamp: number,
  rawBody: string,
  maxAgeMs = 300_000,
): VerifySignatureResult {
  if (!signature || typeof signature !== 'string') {
    return { valid: false, reason: 'EMPTY_SIGNATURE' };
  }
  if (!timestamp || typeof timestamp !== 'number' || Number.isNaN(timestamp) || timestamp <= 0) {
    return { valid: false, reason: 'MALFORMED_TIMESTAMP' };
  }

  // Tolerance window check
  const now = Date.now();
  if (Math.abs(now - timestamp) > maxAgeMs) {
    return { valid: false, reason: 'EXPIRED_TIMESTAMP' };
  }

  const expectedSignature = computeHmacSignature(secret, timestamp, rawBody);

  const sigBuffer = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

  if (sigBuffer.length !== expectedBuffer.length) {
    return { valid: false, reason: 'INVALID_SIGNATURE' };
  }

  const match = timingSafeEqual(sigBuffer, expectedBuffer);
  if (!match) {
    return { valid: false, reason: 'INVALID_SIGNATURE' };
  }

  return { valid: true };
}
