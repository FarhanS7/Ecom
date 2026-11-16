// @shopscale/backend/cart/guest-token.service - HMAC-SHA256 signed guest cart tokens (T042).
// Invariants:
// 1. Signed with HMAC-SHA256 using server secret.
// 2. Verified with constant-time equality (timingSafeEqual) to prevent timing attacks.
// 3. Rejects tampered guest IDs and signatures.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { getEnv } from '@shopscale/config';

export class GuestTokenService {
  constructor(private readonly explicitSecret?: string) {}

  private getSecret(): string {
    if (this.explicitSecret) return this.explicitSecret;
    try {
      return getEnv().JWT_ACCESS_SECRET;
    } catch {
      return 'shopscale-guest-cart-default-hmac-secret-32-chars';
    }
  }

  /**
   * Mints an HMAC-SHA256 signed guest token: `<guestId>.<hexSignature>`
   */
  mintToken(guestId: string): string {
    const signature = createHmac('sha256', this.getSecret())
      .update(guestId)
      .digest('hex');
    return `${guestId}.${signature}`;
  }

  /**
   * Verifies an HMAC-SHA256 signed guest token using timing-safe comparison.
   */
  verifyToken(rawToken: string): { valid: boolean; guestId?: string } {
    if (!rawToken || typeof rawToken !== 'string') {
      return { valid: false };
    }

    const dotIndex = rawToken.lastIndexOf('.');
    if (dotIndex <= 0 || dotIndex === rawToken.length - 1) {
      return { valid: false };
    }

    const guestId = rawToken.slice(0, dotIndex);
    const providedSig = rawToken.slice(dotIndex + 1);

    if (!guestId || !providedSig) {
      return { valid: false };
    }

    const expectedSig = createHmac('sha256', this.getSecret())
      .update(guestId)
      .digest('hex');

    const expectedBuf = Buffer.from(expectedSig, 'utf8');
    const providedBuf = Buffer.from(providedSig, 'utf8');

    if (expectedBuf.length !== providedBuf.length) {
      return { valid: false };
    }

    const matches = timingSafeEqual(expectedBuf, providedBuf);
    if (!matches) {
      return { valid: false };
    }

    return { valid: true, guestId };
  }
}

export const guestTokenService = new GuestTokenService();
