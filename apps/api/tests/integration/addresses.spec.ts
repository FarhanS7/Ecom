// T091a address book over real HTTP: owner CRUD, cross-customer denial on
// all verbs, validation, and safe-DTO shape. Needs a REAL database; skips
// honestly otherwise. Snapshot continuity with orders belongs to T047 (no
// order tables exist yet; nothing references addresses by design).

import 'reflect-metadata';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { resetEnvCache } from '@shopscale/config';
import { addressListResponse, addressResponse, problemResponse } from '@shopscale/contracts';
import {
  openAdminConnection,
  requireDatabaseUrl,
  resolveMigrationsDir,
  runMigrations,
} from '@shopscale/backend';
import { createApp } from '../../src/main.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..', '..');
const migrationsDir = resolveMigrationsDir(repoRoot);

const CUSTOMER_A = 't091.customer.a@example.com';
const CUSTOMER_B = 't091.customer.b@example.com';
const PASSWORD = 'correct-horse-99';
const EMAILS = [CUSTOMER_A, CUSTOMER_B];

const FIELDS = {
  name: 'Ada Tester',
  line1: '1 Infinite Loop',
  city: 'Springfield',
  region: 'IL',
  postalCode: '62701',
  country: 'us',
  phone: '+1-555-0100',
};

type Sql = Awaited<ReturnType<typeof openAdminConnection>>;
let sql: Sql | null = null;
let skipped = false;

let savedEnv: Record<string, string | undefined> = {};

function setSecrets(): void {
  for (const k of ['NODE_ENV', 'REDIS_CACHE_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'MOCK_PAYMENTS_SECRET', 'COOKIE_SECURE'] as const) {
    savedEnv[k] = process.env[k];
  }
  process.env.NODE_ENV = 'test';
  process.env.REDIS_CACHE_URL = 'redis://localhost:6379';
  process.env.JWT_ACCESS_SECRET = 't091-access-secret-000000000000000';
  process.env.JWT_REFRESH_SECRET = 't091-refresh-secret-00000000000000';
  process.env.MOCK_PAYMENTS_SECRET = 't091-mock-payments-secret-0000000';
  process.env.COOKIE_SECURE = 'false';
  resetEnvCache();
}

function restoreSecrets(): void {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetEnvCache();
}

async function cleanup(): Promise<void> {
  if (!sql) return;
  const list = EMAILS.map((e) => `'${e}'`).join(',');
  await sql.unsafe(
    `DELETE FROM "addresses" WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" IN (${list}));`,
  );
  await sql.unsafe(
    `DELETE FROM "identity_tokens" WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" IN (${list}));`,
  );
  await sql.unsafe(
    `DELETE FROM "refresh_tokens" WHERE "family_id" IN (SELECT "id" FROM "session_families" WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" IN (${list})));`,
  );
  await sql.unsafe(`DELETE FROM "session_families" WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" IN (${list}));`);
  await sql.unsafe(
    `DELETE FROM "user_platform_roles" WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" IN (${list}));`,
  );
  await sql.unsafe(`DELETE FROM "users" WHERE "email_normalized" IN (${list});`);
}

function accessCookieOf(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers['set-cookie'];
  const cookies = Array.isArray(raw) ? (raw as string[]) : [];
  return cookies.find((c) => c.startsWith('access_token='))?.split(';')[0] ?? '';
}

beforeEach(() => {
  savedEnv = {};
  setSecrets();
});

afterEach(() => {
  restoreSecrets();
});

describe('address book over HTTP (T091a)', () => {
  let app: NestFastifyApplication | null = null;

  beforeAll(async () => {
    setSecrets();
    let url: string;
    try {
      url = requireDatabaseUrl();
    } catch {
      skipped = true;
      console.warn('SKIP: DATABASE_URL not configured; start infra first (T004).');
      return;
    }
    const candidate = openAdminConnection(url);
    try {
      await candidate`SELECT 1`;
    } catch {
      await candidate.end();
      skipped = true;
      console.warn('SKIP: database unreachable; start infra first (T004).');
      return;
    }
    sql = candidate;
    await runMigrations(sql, migrationsDir);
    await cleanup();
    const created = await createApp();
    app = created.app;
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
    app = null;
    await cleanup();
    if (sql) await sql.end();
    sql = null;
    restoreSecrets();
  });

  async function loginCookie(email: string): Promise<string> {
    const server = app!.getHttpAdapter().getInstance();
    const reg = await server.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email, password: PASSWORD },
    });
    if (reg.statusCode === 201) return accessCookieOf(reg);
    const res = await server.inject({ method: 'POST', url: '/v1/auth/login', payload: { email, password: PASSWORD } });
    expect(res.statusCode).toBe(200);
    return accessCookieOf(res);
  }

  it('creates, lists, reads, updates, and deletes owned addresses', async () => {
    if (skipped || !app) return;
    const server = app.getHttpAdapter().getInstance();
    const cookie = await loginCookie(CUSTOMER_A);

    const created = await server.inject({
      method: 'POST',
      url: '/v1/me/addresses',
      headers: { cookie },
      payload: FIELDS,
    });
    expect(created.statusCode).toBe(201);
    const body = addressResponse.parse(JSON.parse(created.payload));
    expect(body.fields.country).toBe('US');
    // Safe DTO: no owner id, no hashes, nothing but the address.
    expect(Object.keys(JSON.parse(created.payload)).sort()).toEqual(['createdAt', 'fields', 'id']);

    const listed = await server.inject({ method: 'GET', url: '/v1/me/addresses', headers: { cookie } });
    expect(listed.statusCode).toBe(200);
    expect(addressListResponse.parse(JSON.parse(listed.payload)).items).toHaveLength(1);

    const read = await server.inject({
      method: 'GET',
      url: `/v1/me/addresses/${body.id}`,
      headers: { cookie },
    });
    expect(read.statusCode).toBe(200);

    const updated = await server.inject({
      method: 'PATCH',
      url: `/v1/me/addresses/${body.id}`,
      headers: { cookie },
      payload: { ...FIELDS, city: 'Shelbyville' },
    });
    expect(updated.statusCode).toBe(200);
    expect(addressResponse.parse(JSON.parse(updated.payload)).fields.city).toBe('Shelbyville');

    const deleted = await server.inject({
      method: 'DELETE',
      url: `/v1/me/addresses/${body.id}`,
      headers: { cookie },
    });
    expect(deleted.statusCode).toBe(200);
    const gone = await server.inject({
      method: 'GET',
      url: `/v1/me/addresses/${body.id}`,
      headers: { cookie },
    });
    expect(gone.statusCode).toBe(404);
  });

  it('denies cross-customer access on every verb with generic 404s', async () => {
    if (skipped || !app) return;
    const server = app.getHttpAdapter().getInstance();
    const cookieA = await loginCookie(CUSTOMER_A);
    const cookieB = await loginCookie(CUSTOMER_B);
    const created = await server.inject({
      method: 'POST',
      url: '/v1/me/addresses',
      headers: { cookie: cookieA },
      payload: FIELDS,
    });
    const id = addressResponse.parse(JSON.parse(created.payload)).id;

    for (const [method, url, payload] of [
      ['GET', `/v1/me/addresses/${id}`, undefined],
      ['PATCH', `/v1/me/addresses/${id}`, { ...FIELDS, city: 'X' }],
      ['DELETE', `/v1/me/addresses/${id}`, undefined],
    ] as const) {
      const res = await server.inject({ method, url, headers: { cookie: cookieB }, payload });
      expect(res.statusCode).toBe(404);
      expect(problemResponse.parse(JSON.parse(res.payload)).code).toBe('NOT_FOUND');
    }
    const otherList = await server.inject({ method: 'GET', url: '/v1/me/addresses', headers: { cookie: cookieB } });
    expect(addressListResponse.parse(JSON.parse(otherList.payload)).items).toHaveLength(0);
  });

  it('validates fields server-side', async () => {
    if (skipped || !app) return;
    const server = app.getHttpAdapter().getInstance();
    const cookie = await loginCookie(CUSTOMER_A);
    const res = await server.inject({
      method: 'POST',
      url: '/v1/me/addresses',
      headers: { cookie },
      payload: { ...FIELDS, country: 'USA', postalCode: '' },
    });
    expect(res.statusCode).toBe(422);
    expect(problemResponse.parse(JSON.parse(res.payload)).code).toBe('VALIDATION_FAILED');
  });
});
