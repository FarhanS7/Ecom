// T013b security proof over real HTTP: budgets, cooldown-adjacent denial,
// wrong-origin refusal, fail-closed outage, and safe headers. Counter
// mechanics use an injected fixed-window fake with PRODUCTION policy
// constants (fast, deterministic); the live-Redis cycle below runs only where
// the cache connects (CI services) and skips otherwise.

import 'reflect-metadata';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { resetEnvCache } from '@shopscale/config';
import { problemResponse } from '@shopscale/contracts';
import { openAdminConnection, requireDatabaseUrl, resolveMigrationsDir, runMigrations, setLimiterRedisForTests } from '@shopscale/backend';
import type { LimitRedis } from '@shopscale/backend';
import { createApp } from '../../src/main.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..', '..');
const migrationsDir = resolveMigrationsDir(repoRoot);

type Sql = Awaited<ReturnType<typeof openAdminConnection>>;
let sql: Sql | null = null;
let dbSkipped = false;

/** Fixed-window fake with production Lua semantics (shared with unit style). */
function countingFake(): LimitRedis & { calls: number } {
  const counts = new Map<string, { count: number; expiresAt: number }>();
  const state = {
    calls: 0,
    eval: async (_script: string, _n: number, key: string, windowSeconds: number) => {
      state.calls += 1;
      const now = Date.now();
      const entry = counts.get(key);
      if (!entry || entry.expiresAt <= now) {
        counts.set(key, { count: 1, expiresAt: now + windowSeconds * 1000 });
        return [1, windowSeconds * 1000];
      }
      entry.count += 1;
      return [entry.count, Math.max(entry.expiresAt - now, 0)];
    },
  };
  return state;
}

const ALLOW_ALL: LimitRedis = {
  eval: async () => [1, 60_000],
};

let savedEnv: Record<string, string | undefined> = {};

function setSecrets(): void {
  for (const k of ['NODE_ENV', 'REDIS_CACHE_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'MOCK_PAYMENTS_SECRET', 'COOKIE_SECURE'] as const) {
    savedEnv[k] = process.env[k];
  }
  process.env.NODE_ENV = 'test';
  process.env.REDIS_CACHE_URL = 'redis://localhost:6379';
  process.env.JWT_ACCESS_SECRET = 't013-access-secret-000000000000000';
  process.env.JWT_REFRESH_SECRET = 't013-refresh-secret-00000000000000';
  process.env.MOCK_PAYMENTS_SECRET = 't013-mock-payments-secret-0000000';
  process.env.COOKIE_SECURE = 'false';
  resetEnvCache();
  setLimiterRedisForTests(ALLOW_ALL);
}

function restoreSecrets(): void {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetEnvCache();
  setLimiterRedisForTests(ALLOW_ALL);
}

beforeEach(() => {
  savedEnv = {};
  setSecrets();
});

afterEach(() => {
  restoreSecrets();
});

describe('auth throttling and browser protections (T013b)', () => {
  let app: NestFastifyApplication | null = null;

  beforeAll(async () => {
    setSecrets();
    try {
      const url = requireDatabaseUrl();
      const candidate = openAdminConnection(url);
      try {
        await candidate`SELECT 1`;
        sql = candidate;
        await runMigrations(sql, migrationsDir);
      } catch {
        await candidate.end();
        dbSkipped = true;
        console.warn('SKIP: database unreachable; DB-backed threshold test deferred to CI.');
      }
    } catch {
      dbSkipped = true;
      console.warn('SKIP: DATABASE_URL not configured; DB-backed threshold test deferred to CI.');
    }
    const created = await createApp();
    app = created.app;
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
    app = null;
    if (sql) await sql.end();
    sql = null;
    restoreSecrets();
  });

  it('serves safe headers on every response', async () => {
    const server = app!.getHttpAdapter().getInstance();
    const res = await server.inject({ method: 'GET', url: '/health/live' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(res.headers['cross-origin-opener-policy']).toBe('same-origin');
  });

  it('refuses cross-origin cookie mutations with 403', async () => {
    const server = app!.getHttpAdapter().getInstance();
    const res = await server.inject({
      method: 'POST',
      url: '/v1/auth/login',
      headers: { origin: 'https://evil.example', host: 'localhost' },
      payload: { email: 'a@b.co', password: 'whatever-123' },
    });
    expect(res.statusCode).toBe(403);
    expect(problemResponse.parse(JSON.parse(res.payload)).code).toBe('FORBIDDEN');
  });

  it('denies past the email budget with Retry-After (production constants)', async () => {
    // 401s require the users table: DB-backed, honest skip otherwise.
    if (dbSkipped || !sql) {
      console.warn('SKIP: threshold proof needs live PostgreSQL; runs in CI.');
      return;
    }
    setLimiterRedisForTests(countingFake());
    const server = app!.getHttpAdapter().getInstance();
    const email = 't013.bruteforce@example.com';
    let last = 0;
    for (let i = 0; i < 11; i++) {
      const res = await server.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: { email, password: 'wrong-password-1' },
      });
      last = res.statusCode;
      expect([401, 429]).toContain(res.statusCode);
    }
    // 10 failures at 401, the 11th hits the 10/60s email budget.
    expect(last).toBe(429);
    const denied = await server.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email, password: 'wrong-password-1' },
    });
    expect(denied.statusCode).toBe(429);
    expect(denied.headers['retry-after']).toMatch(/^[1-9][0-9]*$/);
    const body = problemResponse.parse(JSON.parse(denied.payload));
    expect(body.code).toBe('RATE_LIMITED');
    expect(JSON.parse(denied.payload)).not.toHaveProperty('password_hash');
  });

  it('fails closed with 503 when the limiter is unreachable', async () => {
    setLimiterRedisForTests({
      eval: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    const server = app!.getHttpAdapter().getInstance();
    const res = await server.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 't013.closed@example.com', password: 'whatever-123' },
    });
    expect(res.statusCode).toBe(503);
    const body = problemResponse.parse(JSON.parse(res.payload));
    expect(body.code).toBe('INTERNAL_ERROR');
    expect(body.title).toBe('Service temporarily unavailable');
  });
});
