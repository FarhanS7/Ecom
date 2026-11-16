// @shopscale/backend/payments/signature-validator - Timing-safe HMAC webhook validator (T050).
// Invariants:
// 1. Validates presence of X-ShopScale-Timestamp and X-ShopScale-Signature.
// 2. Rejects timestamps drifting beyond tolerance (default 5 minutes).
// 3. Compares HMAC-SHA256 digest using timingSafeEqual to prevent side-channel timing attacks.
// 4. Operates strictly over raw request payload buffer / string.

import { createHmac, timingSafeEqual } from 'node:crypto';

export class MissingSignatureHeadersError extends Error {
  constructor(message = 'Missing X-ShopScale-Timestamp or X-ShopScale-Signature header') {
    super(message);
    this.name = 'MissingSignatureHeadersError';
  }
}

export class ExpiredTimestampError extends Error {
  constructor(message = 'Webhook timestamp expired') {
    super(message);
    this.name = 'ExpiredTimestampError';
  }
}

export class InvalidSignatureError extends Error {
  constructor(message = 'Invalid webhook HMAC signature') {
    super(message);
    this.name = 'InvalidSignatureError';
  }
}

export interface SignatureValidationResult {
  valid: boolean;
  timestamp: number;
}

export function validateWebhookSignature(params: {
  secret: string;
  signatureHeader?: string | string[] | undefined;
  timestampHeader?: string | string[] | undefined;
  rawBody: string | Buffer;
  toleranceMs?: number | undefined;
}): SignatureValidationResult {
  const { secret, signatureHeader, timestampHeader, rawBody, toleranceMs = 300_000 } = params;

  const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
  const timestampStr = Array.isArray(timestampHeader) ? timestampHeader[0] : timestampHeader;

  if (!signature || !timestampStr) {
    throw new MissingSignatureHeadersError();
  }

  const rawTs = parseInt(timestampStr, 10);
  if (isNaN(rawTs) || rawTs <= 0) {
    throw new MissingSignatureHeadersError('Malformed X-ShopScale-Timestamp header');
  }

  // Handle both second-based and millisecond-based timestamps
  const timestampMs = rawTs < 10_000_000_000 ? rawTs * 1000 : rawTs;

  const now = Date.now();
  if (Math.abs(now - timestampMs) > toleranceMs) {
    throw new ExpiredTimestampError(
      `Webhook timestamp out of tolerance (${Math.abs(now - timestampMs)}ms > ${toleranceMs}ms)`,
    );
  }

  const bodyStr = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
  const payloadToSign = `${rawTs}.${bodyStr}`;
  const expectedSignature = createHmac('sha256', secret).update(payloadToSign).digest('hex');

  const sigBuf = Buffer.from(signature, 'utf8');
  const expectedBuf = Buffer.from(expectedSignature, 'utf8');

  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    throw new InvalidSignatureError();
  }

  return { valid: true, timestamp: rawTs };
}

export function generateWebhookSignature(
  rawBody: string | Buffer,
  secret: string,
  timestamp: number,
): string {
  const bodyStr = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
  return createHmac('sha256', secret).update(`${timestamp}.${bodyStr}`).digest('hex');
}

export function verifyWebhookSignature(params: {
  secret: string;
  signatureHeader?: string | string[] | undefined;
  timestampHeader?: string | string[] | undefined;
  rawBody: string | Buffer;
  maxAgeMs?: number;
}): SignatureValidationResult {
  return validateWebhookSignature({
    secret: params.secret,
    signatureHeader: params.signatureHeader,
    timestampHeader: params.timestampHeader,
    rawBody: params.rawBody,
    toleranceMs: params.maxAgeMs,
  });
}
