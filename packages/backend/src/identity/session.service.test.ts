// T011a: rotation decision table without a database. A scripted fake stands
// in for postgres: it honors the token-row contract (find → consume → link
// replacement) so the unit proves decisions, while true row-lock concurrency
// belongs to the T011b HTTP race test against real PostgreSQL.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { resetEnvCache } from '@shopscale/config';
import { rotateRefresh } from './session.service.js';

interface FakeToken {
  id: string;
  family_id: string;
  used_at: Date | null;
  expires_at: Date;
  revoked_at: Date | null;
  family_expires_at: Date;
  user_status: string;
  user_id: string;
}

const FAR_FUTURE = new Date('2099-01-01T00:00:00.000Z');
const LONG_PAST = new Date('2001-01-01T00:00:00.000Z');

/** Minimal postgres double: dispatches on query markers, runs begin inline
 * (no lock simulation — sequential decisions only). */
function fakeSql(token: FakeToken | null, log: string[]): Sql {
  const tx = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    unsafe: async (query: string): Promise<any> => {
      if (query.includes('FROM "refresh_tokens" t')) {
        log.push('find-for-update');
        return token ? [{ ...token }] : [];
      }
      if (query.startsWith('UPDATE "session_families"')) {
        log.push('revoke-family');
        if (token) token.revoked_at = new Date();
        return [];
      }
      if (query.startsWith('INSERT INTO "refresh_tokens"')) {
        log.push('insert-replacement');
        return [{ id: 'next-id' }];
      }
      if (query.startsWith('UPDATE "refresh_tokens"')) {
        log.push('consume');
        if (token) token.used_at = new Date();
        return [];
      }
      if (query.includes('FROM "platform_roles"')) {
        return [{ key: 'customer' }];
      }
      if (query.includes('FROM "users"')) {
        return [
          {
            id: 'u1',
            email_normalized: 't011@example.com',
            password_hash: 'x',
            status: 'active',
            created_at: new Date(),
          },
        ];
      }
      throw new Error(`unexpected query in fake: ${query.slice(0, 80)}`);
    },
  };
  return {
    unsafe: tx.unsafe,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    begin: async (cb: any) => cb(tx),
  } as unknown as Sql;
}

function freshToken(): FakeToken {
  return {
    id: 't1',
    family_id: 'f1',
    used_at: null,
    expires_at: FAR_FUTURE,
    revoked_at: null,
    family_expires_at: FAR_FUTURE,
    user_status: 'active',
    user_id: 'u1',
  };
}

describe('rotation decisions (T011a)', () => {
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
    process.env.JWT_ACCESS_SECRET = 't011a-access-secret-0000000000000';
    process.env.JWT_REFRESH_SECRET = 't011a-refresh-secret-000000000000';
    process.env.MOCK_PAYMENTS_SECRET = 't011a-mock-payments-secret-00000';
    resetEnvCache();
  });

  afterEach(() => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k] as string;
    }
    resetEnvCache();
  });
  it('rotates a fresh token and links the replacement', async () => {
    const log: string[] = [];
    const token = freshToken();
    const out = await rotateRefresh('raw-value', fakeSql(token, log));
    expect(out.kind).toBe('rotated');
    if (out.kind !== 'rotated') return;
    expect(out.refreshRaw).not.toBe('raw-value');
    expect(out.familyId).toBe('f1');
    expect(log).toEqual(['find-for-update', 'insert-replacement', 'consume']);
    expect(token.used_at).not.toBeNull();
  });

  it('revokes the family on consumed-token reuse', async () => {
    const log: string[] = [];
    const token = { ...freshToken(), used_at: new Date() };
    const out = await rotateRefresh('raw-value', fakeSql(token, log));
    expect(out).toEqual({ kind: 'revoked' });
    expect(token.revoked_at).not.toBeNull();
    expect(log).toEqual(['find-for-update', 'revoke-family']);
  });

  it('rejects expired tokens as invalid without revoking', async () => {
    const log: string[] = [];
    const token = { ...freshToken(), expires_at: LONG_PAST };
    const out = await rotateRefresh('raw-value', fakeSql(token, log));
    expect(out).toEqual({ kind: 'invalid' });
    expect(token.revoked_at).toBeNull();
    expect(log).toEqual(['find-for-update']);
  });

  it('rejects unknown token values as invalid', async () => {
    const log: string[] = [];
    const out = await rotateRefresh('never-issued', fakeSql(null, log));
    expect(out).toEqual({ kind: 'invalid' });
  });
});
