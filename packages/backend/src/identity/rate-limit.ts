// @shopscale/backend/identity/rate-limit - Redis fixed-window rate limiter.
// Atomic Lua consume: INCR + first-write EXPIRE + PTTL in one step, so
// concurrent callers serialize on the counter and windows never slide.
// Windows EXPIRE — budgets reset on their own; nothing here can permanently
// lock an account out (acceptance requirement).
//
// Redis failure policy (explicit): every check throws LimiterUnavailableError
// and callers MUST fail closed (503 on auth mutations). Fail-open on limiter
// outage would silently remove brute-force protection.

import Redis from 'ioredis';
import { getEnv } from '@shopscale/config';

export class LimiterUnavailableError extends Error {
  readonly code = 'LIMITER_UNAVAILABLE';
}

export interface RateLimitPolicy {
  key: string;
  limit: number;
  windowSeconds: number;
}

export interface RateLimitOutcome {
  allowed: boolean;
  /** Seconds until the window resets (0 when allowed). */
  retryAfterSeconds: number;
}

/** Structural redis surface: real ioredis or the unit fake. */
export interface LimitRedis {
  eval(script: string, numberOfKeys: number, key: string, windowSeconds: number): Promise<unknown>;
}

const CONSUME_SCRIPT = [
  "local current = redis.call('INCR', KEYS[1])",
  "if current == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end",
  "return {current, redis.call('PTTL', KEYS[1])}",
].join('\n');

function toOutcome(count: number, pttlMs: number, policy: RateLimitPolicy): RateLimitOutcome {
  if (count <= policy.limit) return { allowed: true, retryAfterSeconds: 0 };
  const retry = pttlMs > 0 ? Math.ceil(pttlMs / 1000) : policy.windowSeconds;
  return { allowed: false, retryAfterSeconds: retry };
}

/**
 * Consume one unit of budget. Throws LimiterUnavailableError when Redis is
 * unreachable — callers fail closed, never open.
 */
export async function consumeLimit(redis: LimitRedis, policy: RateLimitPolicy): Promise<RateLimitOutcome> {
  let count: number;
  let pttlMs: number;
  try {
    const raw = (await redis.eval(CONSUME_SCRIPT, 1, policy.key, policy.windowSeconds)) as [
      number | string,
      number | string,
    ];
    count = Number(raw[0]);
    pttlMs = Number(raw[1]);
  } catch {
    throw new LimiterUnavailableError(`Rate limiter unreachable for ${policy.key}. Failing closed.`);
  }
  if (!Number.isFinite(count) || !Number.isFinite(pttlMs)) {
    throw new LimiterUnavailableError(`Rate limiter returned garbage for ${policy.key}. Failing closed.`);
  }
  return toOutcome(count, pttlMs, policy);
}

/** Documented budgets (T013b wires them into auth mutations). */
export const loginIpPolicy = (ip: string): RateLimitPolicy => ({
  key: `rl:login:ip:${ip}`,
  limit: 20,
  windowSeconds: 60,
});

export const loginEmailPolicy = (email: string): RateLimitPolicy => ({
  key: `rl:login:email:${email}`,
  limit: 10,
  windowSeconds: 60,
});

export const refreshIpPolicy = (ip: string): RateLimitPolicy => ({
  key: `rl:refresh:ip:${ip}`,
  limit: 20,
  windowSeconds: 60,
});

export const refreshTokenPolicy = (tokenHash: string): RateLimitPolicy => ({
  key: `rl:refresh:token:${tokenHash.slice(0, 16)}`,
  limit: 30,
  windowSeconds: 60,
});

export const applicationIpPolicy = (ip: string): RateLimitPolicy => ({
  key: `rl:apply:ip:${ip}`,
  limit: 10,
  windowSeconds: 60,
});

let sharedRedis: Redis | null = null;
let testDouble: LimitRedis | null = null;

/** Test seam (documented): inject a fake for deterministic suites. */
export function setLimiterRedisForTests(client: LimitRedis | null): void {
  testDouble = client;
}

function realRedis(): Redis {
  if (!sharedRedis) {
    const env = getEnv();
    const client = new Redis(env.REDIS_CACHE_URL, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      lazyConnect: true,
      // Fail fast while disconnected: queueing would stall fail-closed
      // mutations behind reconnect backoff (observed 1.4s stalls).
      enableOfflineQueue: false,
    });
    // ioredis emits 'error' on every failed reconnect; without a listener
    // Node treats it as unhandled (crash risk). Command failures still
    // surface per-call via maxRetriesPerRequest → LimiterUnavailableError.
    client.on('error', () => {
      // Intentionally quiet: connection state is observable through command
      // outcomes, and this process must not log per-retry noise.
    });
    sharedRedis = client;
  }
  return sharedRedis;
}

/** Singleton redis for limits (cache instance: core profile always runs it). */
export function getLimiterRedis(): LimitRedis {
  if (testDouble) return testDouble;
  const client = realRedis();
  return {
    eval: (script, numberOfKeys, key, windowSeconds) =>
      client.eval(script, numberOfKeys, key, windowSeconds),
  };
}

export function closeLimiterRedis(): void {
  if (sharedRedis) {
    sharedRedis.disconnect();
    sharedRedis = null;
  }
}
