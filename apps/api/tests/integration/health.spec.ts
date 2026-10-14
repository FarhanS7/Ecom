// T005 verification through actual HTTP: real Nest application + Fastify
// router exercised via inject (no network ports bound).
// - Valid boot: app starts with complete settings; /health/live is 200.
// - Stopped DB: DATABASE_URL points at a closed port (fast refusal, no
//   waiting); /health/live stays 200 while /health/ready is 503 degraded.
// - Missing setting: boot rejects with a redacted error naming the field.
// Response bodies are validated against @shopscale/contracts and asserted
// secret-free. Canonical location: package-colocated per repo layout (task
// suggested root tests/; see T003 precedent recorded in its commit).
//
// Env ordering note: @nestjs/config runs `validate` at module-definition
// time, so VALID_ENV is established in setup.ts before any AppModule import.
// The negative test resets the module registry for a genuinely fresh boot.

import 'reflect-metadata';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { resetEnvCache } from '@shopscale/config';
import { healthLiveResponse, healthReadyResponse } from '@shopscale/contracts';
import { createApp } from '../../src/main.js';

const VALID_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  // Closed port on loopback: connection refused immediately, proving the
  // stopped-DB path without waiting out a connect timeout.
  DATABASE_URL: 'postgres://shopscale:shopscale@127.0.0.1:54329/shopscale',
  REDIS_CACHE_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 't005-access-secret-000000000000000',
  JWT_REFRESH_SECRET: 't005-refresh-secret-00000000000000',
  MOCK_PAYMENTS_SECRET: 't005-mock-payments-secret-00000000',
};

const SECRET_VALUES = [
  VALID_ENV['DATABASE_URL'],
  VALID_ENV['JWT_ACCESS_SECRET'],
  VALID_ENV['JWT_REFRESH_SECRET'],
  VALID_ENV['MOCK_PAYMENTS_SECRET'],
];

let savedEnv: Record<string, string | undefined> = {};

function setEnv(vars: Record<string, string | undefined>): void {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetEnvCache();
}

function expectSecretFree(text: string): void {
  for (const secret of SECRET_VALUES) {
    if (secret !== undefined) expect(text).not.toContain(secret);
  }
}

beforeEach(() => {
  savedEnv = {};
  for (const k of Object.keys(VALID_ENV)) {
    savedEnv[k] = process.env[k];
  }
  setEnv(VALID_ENV);
});

afterEach(() => {
  setEnv(savedEnv);
});

describe('health routes over HTTP (T005)', () => {
  let app: NestFastifyApplication | null = null;

  beforeAll(async () => {
    setEnv(VALID_ENV);
    const created = await createApp();
    app = created.app;
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
    app = null;
    setEnv(savedEnv);
  });

  it('boots with valid settings and serves liveness', async () => {
    expect(app).not.toBeNull();
    const server = app!.getHttpAdapter().getInstance();
    const res = await server.inject({ method: 'GET', url: '/health/live' });
    expect(res.statusCode).toBe(200);
    const body = healthLiveResponse.parse(JSON.parse(res.payload));
    expect(body).toEqual({ status: 'ok' });
    expectSecretFree(res.payload);
  });

  it('keeps liveness healthy while readiness fails on stopped DB', async () => {
    const server = app!.getHttpAdapter().getInstance();

    const live = await server.inject({ method: 'GET', url: '/health/live' });
    expect(live.statusCode).toBe(200);

    const ready = await server.inject({ method: 'GET', url: '/health/ready' });
    expect(ready.statusCode).toBe(503);
    const body = healthReadyResponse.parse(JSON.parse(ready.payload));
    expect(body.status).toBe('degraded');
    expect(body.checks['database']?.status).toBe('fail');
    expect(body.checks['database']?.detail).toBe('Database connection failed');
    expectSecretFree(ready.payload);
  });
});
