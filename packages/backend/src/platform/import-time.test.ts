// T005a: importing the backend root must have no environment side effects.
// Missing secrets fail fast at first USE (getEnv/getDb), never at import.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetEnvCache } from '@shopscale/config';

const REQUIRED_KEYS = [
  'DATABASE_URL',
  'REDIS_CACHE_URL',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'MOCK_PAYMENTS_SECRET',
] as const;

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {};
  for (const k of REQUIRED_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  resetEnvCache();
});

afterEach(() => {
  for (const k of REQUIRED_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  resetEnvCache();
});

describe('backend import-time behavior (T005a)', () => {
  it('imports without env and keeps pure helpers usable', async () => {
    const mod = await import('../index.js');
    expect(mod.isLivenessOk()).toBe(true);
  });

  it('fails fast with a redacted error on first config use', async () => {
    const mod = await import('../index.js');
    try {
      mod.getEnv();
      expect.unreachable('getEnv should throw without configuration');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toMatch(/Invalid configuration/);
      for (const k of REQUIRED_KEYS) {
        if (saved[k] !== undefined) expect(msg).not.toContain(saved[k] as string);
      }
    }
  });
});
