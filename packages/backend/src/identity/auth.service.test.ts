// T010a: auth primitives without a database. DB-backed paths (duplicate
// collapse, session persistence) are proven over HTTP in T010b.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetEnvCache } from '@shopscale/config';
import {
  AuthError,
  authenticateAccount,
  hashPassword,
  isUniqueViolation,
  mintAccessToken,
  normalizeEmail,
  registerAccount,
  verifyAccessToken,
  verifyPassword,
} from './auth.service.js';

describe('email normalization (T010a)', () => {
  it('lowercases, trims, and normalizes once', () => {
    expect(normalizeEmail('  CUSTOMER@Example.COM ')).toBe('customer@example.com');
    expect(normalizeEmail('a@b.co')).toBe('a@b.co');
  });
});

describe('password hashing (T010a)', () => {
  it('round-trips argon2id and rejects wrong passwords', async () => {
    const hash = await hashPassword('correct-horse-8');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(hash, 'correct-horse-8')).toBe(true);
    expect(await verifyPassword(hash, 'wrong-password')).toBe(false);
    expect(await verifyPassword('not-a-hash', 'x')).toBe(false);
  });
});

describe('access tokens (T010a)', () => {
  const keys = [
    'DATABASE_URL',
    'REDIS_CACHE_URL',
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
    'MOCK_PAYMENTS_SECRET',
  ] as const;
  let saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    saved = {};
    for (const k of keys) saved[k] = process.env[k];
    process.env.DATABASE_URL = 'postgres://shopscale:shopscale@localhost:5432/shopscale';
    process.env.REDIS_CACHE_URL = 'redis://localhost:6379';
    process.env.JWT_ACCESS_SECRET = 't010a-access-secret-00000000000000';
    process.env.JWT_REFRESH_SECRET = 't010a-refresh-secret-0000000000000';
    process.env.MOCK_PAYMENTS_SECRET = 't010a-mock-payments-secret-0000000';
    resetEnvCache();
  });

  afterEach(() => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k] as string;
    }
    resetEnvCache();
  });

  it('round-trips claims and rejects tampering', async () => {
    const token = await mintAccessToken({ userId: 'u1', familyId: 'f1', roles: ['customer'] });
    const claims = await verifyAccessToken(token);
    expect(claims).toMatchObject({ userId: 'u1', familyId: 'f1', roles: ['customer'] });
    expect(await verifyAccessToken(`${token}x`)).toBeNull();
    expect(await verifyAccessToken('not-a-token')).toBeNull();
  });
});

describe('auth error mapping (T010a)', () => {
  it('detects unique violations and nothing else', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
    expect(isUniqueViolation({ code: '23503' })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation('23505')).toBe(false);
  });

  it('carries stable failure codes', () => {
    expect(registerAccount).toBeTypeOf('function');
    expect(authenticateAccount).toBeTypeOf('function');
    const dup = new AuthError('ACCOUNT_EXISTS', 'x');
    expect(dup.failure).toBe('ACCOUNT_EXISTS');
  });
});
