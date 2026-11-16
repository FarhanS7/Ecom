// @shopscale/backend/platform/audit-sanitizer.test - Unit tests for audit sanitizer (T062).
import { describe, it, expect } from 'vitest';
import { sanitizeAuditPayload } from './audit-sanitizer.js';

describe('sanitizeAuditPayload (T062 Unit Tests)', () => {
  it('returns null for null or undefined input', () => {
    expect(sanitizeAuditPayload(null)).toBeNull();
    expect(sanitizeAuditPayload(undefined)).toBeNull();
  });

  it('redacts sensitive keys regardless of case or affixes', () => {
    const input = {
      username: 'admin',
      password: 'supersecretpassword123',
      user_password_hash: '$2b$10$xyz',
      accessToken: 'jwt.token.here',
      refresh_token: 'secret-refresh',
      api_secret_key: 'sk_live_123456',
      card_number: '4111222233334444',
      cvv: '123',
      session_id: 'sess_abc',
    };

    const sanitized = sanitizeAuditPayload(input);

    expect(sanitized).toEqual({
      username: 'admin',
      password: '[REDACTED]',
      user_password_hash: '[REDACTED]',
      accessToken: '[REDACTED]',
      refresh_token: '[REDACTED]',
      api_secret_key: '[REDACTED]',
      card_number: '[REDACTED]',
      cvv: '[REDACTED]',
      session_id: '[REDACTED]',
    });
  });

  it('redacts credit card numbers embedded inside generic text strings', () => {
    const input = {
      notes: 'Customer provided card 4111 2222 3333 4444 during call',
      reference: 'Ref 5500-1234-5678-9012 transaction',
    };

    const sanitized = sanitizeAuditPayload(input);

    expect(sanitized?.notes).toBe('Customer provided card [REDACTED_PAN] during call');
    expect(sanitized?.reference).toBe('Ref [REDACTED_PAN] transaction');
  });

  it('truncates strings longer than 1000 characters to prevent DB bloat', () => {
    const hugeString = 'A'.repeat(1500);
    const input = {
      description: hugeString,
      normal: 'Short string',
    };

    const sanitized = sanitizeAuditPayload(input);

    expect(typeof sanitized?.description).toBe('string');
    const desc = sanitized?.description as string;
    expect(desc.length).toBeLessThan(1100);
    expect(desc.endsWith('... [TRUNCATED]')).toBe(true);
    expect(desc.startsWith('A'.repeat(1000))).toBe(true);
    expect(sanitized?.normal).toBe('Short string');
  });

  it('recursively sanitizes nested objects and arrays', () => {
    const input = {
      store: {
        id: 'store-1',
        credentials: {
          webhook_secret: 'whsec_secret_123',
        },
      },
      items: [
        {
          sku: 'SKU-1',
          auth_token: 'secret-token-1',
        },
        {
          sku: 'SKU-2',
          auth_token: 'secret-token-2',
        },
      ],
    };

    const sanitized = sanitizeAuditPayload(input);

    expect(sanitized).toEqual({
      store: {
        id: 'store-1',
        credentials: {
          webhook_secret: '[REDACTED]',
        },
      },
      items: [
        {
          sku: 'SKU-1',
          auth_token: '[REDACTED]',
        },
        {
          sku: 'SKU-2',
          auth_token: '[REDACTED]',
        },
      ],
    });
  });

  it('handles deep nesting without infinite recursion', () => {
    let deepObj: Record<string, unknown> = { key: 'bottom' };
    for (let i = 0; i < 20; i++) {
      deepObj = { level: i, nested: deepObj };
    }

    const sanitized = sanitizeAuditPayload(deepObj);
    expect(sanitized).toBeDefined();
  });
});
