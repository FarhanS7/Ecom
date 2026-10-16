// COOKIE_SECURE used to be z.coerce.boolean(), which applies Boolean(value) and so
// parses the string "false" as TRUE. The flag could never be turned off from the
// environment, which is what the T010b login spec hit live (it sets
// COOKIE_SECURE=false and still got a `Secure` cookie). These tests pin the parsing
// and the secure-by-default behaviour so the regression cannot come back.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getEnv, resetEnvCache } from './env.js';

const BASE: Record<string, string> = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://user:pass@127.0.0.1:5432/shopscale',
  REDIS_CACHE_URL: 'redis://127.0.0.1:6379/0',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  MOCK_PAYMENTS_SECRET: 'c'.repeat(32),
};

function setEnv(extra: Record<string, string>): void {
  delete process.env['COOKIE_SECURE'];
  for (const [key, value] of Object.entries({ ...BASE, ...extra })) {
    process.env[key] = value;
  }
  resetEnvCache();
}

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of [...Object.keys(BASE), 'COOKIE_SECURE']) {
    saved[key] = process.env[key];
  }
});

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetEnvCache();
});

describe('env schema', () => {
  it('parses COOKIE_SECURE=false as false, not Boolean("false")', () => {
    setEnv({ COOKIE_SECURE: 'false' });
    expect(getEnv().COOKIE_SECURE).toBe(false);
  });

  it('parses the conventional true spellings as true', () => {
    setEnv({ COOKIE_SECURE: 'true' });
    expect(getEnv().COOKIE_SECURE).toBe(true);
    setEnv({ COOKIE_SECURE: '1' });
    expect(getEnv().COOKIE_SECURE).toBe(true);
  });

  it('defaults to secure when the variable is absent', () => {
    setEnv({});
    expect(getEnv().COOKIE_SECURE).toBe(true);
  });

  it('rejects an unrecognised spelling instead of silently defaulting', () => {
    setEnv({ COOKIE_SECURE: 'yes' });
    expect(() => getEnv()).toThrow(/COOKIE_SECURE/);
  });
});
