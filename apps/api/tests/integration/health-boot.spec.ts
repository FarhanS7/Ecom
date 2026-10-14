// T005 negative path: missing secrets stop boot with a redacted error.
//
// Exercises the exported createApp() factory — the same creation path
// production bootstrap uses — with DATABASE_URL stripped. createApp() calls
// getEnv() before touching Nest, so the failure is deterministic and carries
// no module-registry side effects.

import 'reflect-metadata';
import { afterEach, describe, expect, it } from 'vitest';
import { resetEnvCache } from '@shopscale/config';
import { createApp } from '../../src/main.js';

const STRIPPED_ENV: Record<string, string | undefined> = {
  NODE_ENV: 'test',
  DATABASE_URL: undefined,
  REDIS_CACHE_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 't005-access-secret-000000000000000',
  JWT_REFRESH_SECRET: 't005-refresh-secret-00000000000000',
  MOCK_PAYMENTS_SECRET: 't005-mock-payments-secret-00000000',
};

let savedEnv: Record<string, string | undefined> = {};

function restoreEnv(): void {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetEnvCache();
}

afterEach(() => {
  restoreEnv();
});

describe('boot without secrets (T005)', () => {
  it('stops boot with a redacted error when DATABASE_URL is missing', async () => {
    savedEnv = {};
    for (const k of Object.keys(STRIPPED_ENV)) {
      savedEnv[k] = process.env[k];
    }
    for (const [k, v] of Object.entries(STRIPPED_ENV)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    resetEnvCache();

    await expect(createApp()).rejects.toThrow(/Invalid configuration/);
    try {
      await createApp();
      expect.unreachable('boot should reject without DATABASE_URL');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toMatch(/DATABASE_URL/);
      // Names the field; never the value.
      expect(msg).not.toContain('postgres://');
      expect(msg).not.toContain('t005-access-secret');
      expect(msg).not.toContain('t005-refresh-secret');
      expect(msg).not.toContain('t005-mock-payments-secret');
    }
  });
});
