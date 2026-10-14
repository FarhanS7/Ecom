// T006b verification through actual HTTP: request IDs, problem contract,
// versioning boundary, and validation mapping — all against a real Nest +
// Fastify stack via inject (no network ports).
// Canonical location: package-colocated per repo layout (T003 precedent).

import 'reflect-metadata';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { resetEnvCache } from '@shopscale/config';
import { problemResponse } from '@shopscale/contracts';
import { createApp } from '../../src/main.js';

const VALID_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://shopscale:shopscale@127.0.0.1:54329/shopscale',
  REDIS_CACHE_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 't006-access-secret-000000000000000',
  JWT_REFRESH_SECRET: 't006-refresh-secret-00000000000000',
  MOCK_PAYMENTS_SECRET: 't006-mock-payments-secret-00000000',
};

const SECRET_VALUES = Object.values(VALID_ENV).filter((v) => v.length > 10);

let savedEnv: Record<string, string | undefined> = {};

function setEnv(vars: Record<string, string>): void {
  for (const [k, v] of Object.entries(vars)) process.env[k] = v;
  resetEnvCache();
}

function expectSecretFree(text: string): void {
  for (const secret of SECRET_VALUES) expect(text).not.toContain(secret);
  expect(text).not.toContain('S3cr3t');
}

function parseProblem(payload: string) {
  return problemResponse.parse(JSON.parse(payload));
}

beforeEach(() => {
  savedEnv = {};
  for (const k of Object.keys(VALID_ENV)) savedEnv[k] = process.env[k];
  setEnv(VALID_ENV);
});

afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetEnvCache();
});

describe('HTTP contract (T006b)', () => {
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
  });

  it('echoes a client request ID in header and body', async () => {
    const server = app!.getHttpAdapter().getInstance();
    const res = await server.inject({
      method: 'GET',
      url: '/health/live',
      headers: { 'x-request-id': 'contract-probe-1' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-request-id']).toBe('contract-probe-1');
    expect(JSON.parse(res.payload)).toMatchObject({ status: 'ok' });
  });

  it('generates a request ID when absent', async () => {
    const server = app!.getHttpAdapter().getInstance();
    const res = await server.inject({ method: 'GET', url: '/health/live' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('rejects a malformed request ID with a 400 problem', async () => {
    const server = app!.getHttpAdapter().getInstance();
    const res = await server.inject({
      method: 'GET',
      url: '/health/live',
      headers: { 'x-request-id': 'bad\nid' },
    });
    expect(res.statusCode).toBe(400);
    const body = parseProblem(res.payload);
    expect(body.code).toBe('INVALID_REQUEST_ID');
    expectSecretFree(res.payload);
  });

  it('maps unknown routes to a 404 problem without stack or secrets', async () => {
    const server = app!.getHttpAdapter().getInstance();
    const res = await server.inject({ method: 'GET', url: '/nope?token=one-time-secret-xyz' });
    expect(res.statusCode).toBe(404);
    const body = parseProblem(res.payload);
    expect(body.code).toBe('NOT_FOUND');
    expect(body).toHaveProperty('requestId');
    expect(res.headers['x-request-id']).toBe(body.requestId);
    expectSecretFree(res.payload);
    expect(res.payload).not.toMatch(/stack|at .*\(/);
  });

  it('keeps versioned and unversioned boundaries: /v1/ping works, /v1/health/live does not shadow', async () => {
    const server = app!.getHttpAdapter().getInstance();
    const ping = await server.inject({ method: 'GET', url: '/v1/ping?limit=5' });
    expect(ping.statusCode).toBe(200);
    expect(JSON.parse(ping.payload)).toEqual({ pong: true, limit: 5 });

    const shadowed = await server.inject({ method: 'GET', url: '/v1/health/live' });
    expect(shadowed.statusCode).toBe(404);
    expect(parseProblem(shadowed.payload).code).toBe('NOT_FOUND');
  });

  it('maps invalid query input to a 422 problem with keys, never values', async () => {
    const server = app!.getHttpAdapter().getInstance();
    const res = await server.inject({ method: 'GET', url: '/v1/ping?limit=999' });
    expect(res.statusCode).toBe(422);
    const body = parseProblem(res.payload);
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(body.errors?.['limit']).toContain('max');
    expectSecretFree(res.payload);
    expect(JSON.stringify(body.errors)).not.toContain('999');
  });

  it('committed OpenAPI artifact matches the implemented contract', async () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const raw = await readFile(join(here, '..', '..', '..', '..', 'docs', 'openapi.json'), 'utf8');
    expectSecretFree(raw);
    const doc = JSON.parse(raw) as {
      openapi: string;
      info: { title: string; version: string };
      paths: Record<string, unknown>;
    };
    // Recorded as measured: @nestjs/swagger 7 emits 3.0.x, not 3.1.
    // The contract doc aspires to 3.1; the value below must be updated —
    // never faked — when the generator changes.
    expect(doc.openapi).toMatch(/^3\.0\./);
    expect(doc.info.title).toBe('ShopScale API');
    expect(doc.info.version).toBe('1.0');
    expect(doc.paths).toHaveProperty('/health/live');
    expect(doc.paths).toHaveProperty('/health/ready');
    expect(doc.paths).toHaveProperty('/v1/ping');
  });
});
