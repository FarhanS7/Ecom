// T013a: limiter semantics without infrastructure. The fake honors the Lua
// contract (atomic INCR + first-write EXPIRE + PTTL) against a manual clock:
// thresholds, isolation, window reset, and fail-closed outage — no sleeps.

import { describe, expect, it } from 'vitest';
import {
  LimiterUnavailableError,
  consumeLimit,
  loginEmailPolicy,
} from './rate-limit.js';
import type { LimitRedis } from './rate-limit.js';

function fakeRedis(clock: { nowMs: number }): LimitRedis & { counts: Map<string, { count: number; expiresAt: number }> } {
  const counts = new Map<string, { count: number; expiresAt: number }>();
  return {
    counts,
    eval: async (_script: string, _n: number, key: string, windowSeconds: number) => {
      const entry = counts.get(key);
      if (!entry || entry.expiresAt <= clock.nowMs) {
        const fresh = { count: 1, expiresAt: clock.nowMs + windowSeconds * 1000 };
        counts.set(key, fresh);
        return [1, windowSeconds * 1000];
      }
      entry.count += 1;
      return [entry.count, entry.expiresAt - clock.nowMs];
    },
  };
}

describe('fixed-window limits (T013a)', () => {
  it('denies past the threshold with a retry delay, then resets with the window', async () => {
    const clock = { nowMs: 0 };
    const redis = fakeRedis(clock);
    const policy = loginEmailPolicy('victim@example.com');
    for (let i = 0; i < 10; i++) {
      expect((await consumeLimit(redis, policy)).allowed).toBe(true);
    }
    const denied = await consumeLimit(redis, policy);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBeGreaterThan(0);
    expect(denied.retryAfterSeconds).toBeLessThanOrEqual(60);

    clock.nowMs += 61_000;
    expect((await consumeLimit(redis, policy)).allowed).toBe(true);
  });

  it('isolates budgets per key', async () => {
    const clock = { nowMs: 0 };
    const redis = fakeRedis(clock);
    const a = loginEmailPolicy('a@example.com');
    const b = loginEmailPolicy('b@example.com');
    for (let i = 0; i < 10; i++) await consumeLimit(redis, a);
    expect((await consumeLimit(redis, a)).allowed).toBe(false);
    expect((await consumeLimit(redis, b)).allowed).toBe(true);
  });

  it('fails closed when redis is unreachable', async () => {
    const dead: LimitRedis = {
      eval: async () => {
        throw new Error('ECONNREFUSED');
      },
    };
    await expect(consumeLimit(dead, loginEmailPolicy('x@example.com'))).rejects.toBeInstanceOf(
      LimiterUnavailableError,
    );
  });
});
