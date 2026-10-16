// T010b verification over real HTTP: register → authenticate, duplicate,
// wrong-password/unknown/suspended indistinguishability, cookie flags, and
// hash-absence scans. Needs a REAL database: uses the ambient DATABASE_URL
// (CI services, bench host) and skips honestly otherwise — never the
// closed-port default, which would invert every assertion here.
// Canonical location: package-colocated per repo layout (T003 precedent).

import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { resetEnvCache } from '@shopscale/config';
import { authResponse, problemResponse } from '@shopscale/contracts';
import { hashPassword, verifyAccessToken } from '@shopscale/backend';
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

const EMAIL = 't010.customer@example.com';
const EMAIL_DUP = 't010.duplicate@example.com';
const EMAIL_SUSPENDED = 't010.suspended@example.com';
const PASSWORD = 'correct-horse-99';
const ALL_TEST_EMAILS = [EMAIL, EMAIL_DUP, EMAIL_SUSPENDED];

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
  process.env.JWT_ACCESS_SECRET = 't010-access-secret-000000000000000';
  process.env.JWT_REFRESH_SECRET = 't010-refresh-secret-00000000000000';
  process.env.MOCK_PAYMENTS_SECRET = 't010-mock-payments-secret-0000000';
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
  const list = ALL_TEST_EMAILS.map((e) => `'${e}'`).join(',');
  await sql.unsafe(
    `DELETE FROM "identity_tokens" WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" IN (${list}));`,
  );
  await sql.unsafe(
    `DELETE FROM "refresh_tokens" WHERE "family_id" IN (SELECT "id" FROM "session_families" WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" IN (${list})));`,
  );
  await sql.unsafe(
    `DELETE FROM "session_families" WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" IN (${list}));`,
  );
  await sql.unsafe(
    `DELETE FROM "user_platform_roles" WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" IN (${list}));`,
  );
  await sql.unsafe(`DELETE FROM "users" WHERE "email_normalized" IN (${list});`);
}

function cookiesOf(res: { headers: Record<string, unknown> }): string[] {
  const raw = res.headers['set-cookie'];
  return Array.isArray(raw) ? (raw as string[]) : [];
}

function expectSecretFree(text: string): void {
  expect(text).not.toContain('password_hash');
  expect(text).not.toContain('$argon2');
  expect(text).not.toContain(PASSWORD);
}

beforeEach(() => {
  savedEnv = {};
  setSecrets();
});

afterEach(() => {
  restoreSecrets();
});

describe('registration and login over HTTP (T010b)', () => {
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

  it('registers an account with safe DTO, cookies, and one session family', async () => {
    if (skipped || !sql || !app) return;
    const server = app.getHttpAdapter().getInstance();
    const res = await server.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: EMAIL, password: PASSWORD },
    });
    expect(res.statusCode).toBe(201);
    const body = authResponse.parse(JSON.parse(res.payload));
    expect(body.user.email).toBe(EMAIL);
    expect(body.user.status).toBe('active');
    expect(body.expiresIn).toBe(15 * 60);
    expectSecretFree(res.payload);

    const cookies = cookiesOf(res);
    expect(cookies).toHaveLength(2);
    const joined = cookies.join('\n');
    expectSecretFree(joined);
    const access = cookies.find((c) => c.startsWith('access_token=')) ?? '';
    const refresh = cookies.find((c) => c.startsWith('refresh_token=')) ?? '';
    for (const flag of ['HttpOnly', 'SameSite=Lax']) {
      expect(access).toContain(flag);
      expect(refresh).toContain(flag);
    }
    expect(access).toContain('Path=/;');
    expect(access).toContain('Max-Age=900');
    expect(refresh).toContain('Path=/v1/auth');
    expect(refresh).toContain('Max-Age=604800');
    expect(joined).not.toContain('Secure');

    // Access token verifies and binds the persisted family; refresh cookie
    // matches the stored hash (proves hash-only storage end to end).
    const claims = await verifyAccessToken(access.split(';')[0].split('=')[1] as string);
    expect(claims?.userId).toBe(body.user.id);
    const families = (await sql.unsafe(`SELECT "id" FROM "session_families" WHERE "user_id" = $1;`, [
      body.user.id,
    ])) as Array<{ id: string }>;
    expect(families).toHaveLength(1);
    expect(claims?.familyId).toBe(families[0].id);
    const rawRefresh = refresh.split(';')[0].split('=')[1] as string;
    const expectedHash = createHash('sha256').update(rawRefresh, 'utf8').digest('hex');
    const stored = (await sql.unsafe(`SELECT "token_hash" FROM "refresh_tokens" WHERE "family_id" = $1;`, [
      families[0].id,
    ])) as Array<{ token_hash: string }>;
    expect(stored[0].token_hash).toBe(expectedHash);
  });

  it('rejects duplicate registration with 409 and creates no second family', async () => {
    if (skipped || !sql || !app) return;
    const server = app.getHttpAdapter().getInstance();
    const first = await server.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: EMAIL_DUP, password: PASSWORD },
    });
    expect(first.statusCode).toBe(201);
    const retry = await server.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: EMAIL_DUP, password: PASSWORD },
    });
    expect(retry.statusCode).toBe(409);
    expect(problemResponse.parse(JSON.parse(retry.payload)).code).toBe('CONFLICT');
    const userId = authResponse.parse(JSON.parse(first.payload)).user.id;
    const families = (await sql.unsafe(`SELECT count(*)::int AS n FROM "session_families" WHERE "user_id" = $1;`, [
      userId,
    ])) as Array<{ n: number }>;
    expect(families[0].n).toBe(1);
  });

  it('authenticates with correct credentials and mints a second family', async () => {
    if (skipped || !sql || !app) return;
    const server = app.getHttpAdapter().getInstance();
    const res = await server.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: EMAIL, password: PASSWORD },
    });
    expect(res.statusCode).toBe(200);
    const body = authResponse.parse(JSON.parse(res.payload));
    expect(body.user.email).toBe(EMAIL);
    expectSecretFree(res.payload);
    expect(cookiesOf(res)).toHaveLength(2);
    const families = (await sql.unsafe(
      `SELECT count(*)::int AS n FROM "session_families" WHERE "user_id" = $1;`,
      [body.user.id],
    )) as Array<{ n: number }>;
    expect(families[0].n).toBe(2);
  });

  it('returns identical generic 401 for wrong password, unknown email, and suspended accounts', async () => {
    if (skipped || !sql || !app) return;
    const server = app.getHttpAdapter().getInstance();
    await sql.unsafe(
      `INSERT INTO "users" ("email_normalized","password_hash","status") VALUES ($1,$2,'suspended') ON CONFLICT DO NOTHING;`,
      [EMAIL_SUSPENDED, await hashPassword('Right-pass-1')],
    );

    const wrong = await server.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: EMAIL, password: 'wrong-password-1' },
    });
    const unknown = await server.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'nobody@example.com', password: 'wrong-password-1' },
    });
    const suspended = await server.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: EMAIL_SUSPENDED, password: 'Right-pass-1' },
    });
    for (const res of [wrong, unknown, suspended]) {
      expect(res.statusCode).toBe(401);
      expect(problemResponse.parse(JSON.parse(res.payload)).code).toBe('UNAUTHENTICATED');
      expectSecretFree(res.payload);
    }
    const withoutRequestId = (payload: string): Record<string, unknown> => {
      const body = JSON.parse(payload) as Record<string, unknown>;
      // requestId is per-request correlation: it is deliberately unique, so
      // comparing it would assert the opposite of its purpose. What must be
      // indistinguishable is everything else about the failure.
      delete body['requestId'];
      return body;
    };
    expect(withoutRequestId(wrong.payload)).toEqual(withoutRequestId(unknown.payload));
    expect(withoutRequestId(unknown.payload)).toEqual(withoutRequestId(suspended.payload));
  });

  it('rejects invalid registration bodies with 422', async () => {
    if (skipped || !app) return;
    const server = app.getHttpAdapter().getInstance();
    const res = await server.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: 'not-an-email', password: 'short' },
    });
    expect(res.statusCode).toBe(422);
    expect(problemResponse.parse(JSON.parse(res.payload)).code).toBe('VALIDATION_FAILED');
  });
});
