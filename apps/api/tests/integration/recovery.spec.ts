// T012b recovery flows over real HTTP: non-enumerating requests, one-use
// proofs, expiry, replay, session revocation, and pending→active activation.
// Needs a REAL database (ambient DATABASE_URL); skips honestly otherwise.
// Proof tokens come from the in-process demo sink (same backend instance as
// the app under inject). Canonical location: package-colocated (T003 precedent).

import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { resetEnvCache } from '@shopscale/config';
import { authResponse, flowAccepted, problemResponse } from '@shopscale/contracts';
import { demoDelivery, hashPassword } from '@shopscale/backend';
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

const RESET_EMAIL = 't012.reset@example.com';
const UNKNOWN_EMAIL = 't012.nobody@example.com';
const PENDING_EMAIL = 't012.pending@example.com';
const SUSPENDED_EMAIL = 't012.suspended@example.com';
const EXPIRED_EMAIL = 't012.expired@example.com';
const NEW_PASSWORD = 'brand-new-pass-99';
const ALL_EMAILS = [RESET_EMAIL, UNKNOWN_EMAIL, PENDING_EMAIL, SUSPENDED_EMAIL, EXPIRED_EMAIL];

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
  process.env.JWT_ACCESS_SECRET = 't012-access-secret-000000000000000';
  process.env.JWT_REFRESH_SECRET = 't012-refresh-secret-00000000000000';
  process.env.MOCK_PAYMENTS_SECRET = 't012-mock-payments-secret-0000000';
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
  const list = ALL_EMAILS.map((e) => `'${e}'`).join(',');
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

function setCookiesOf(res: { headers: Record<string, unknown> }): string[] {
  const raw = res.headers['set-cookie'];
  return Array.isArray(raw) ? (raw as string[]) : [];
}

function cookieValue(cookies: string[], name: string): string | null {
  const found = cookies.find((c) => c.startsWith(`${name}=`));
  return found?.split(';')[0]?.split('=')[1] ?? null;
}

beforeEach(() => {
  savedEnv = {};
  setSecrets();
  demoDelivery.clear();
});

afterEach(() => {
  restoreSecrets();
});

describe('account recovery over HTTP (T012b)', () => {
  let app: NestFastifyApplication | null = null;

  beforeAll(async () => {
    setSecrets();
    demoDelivery.clear();
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

  it('answers unknown emails identically while creating nothing', async () => {
    if (skipped || !sql || !app) return;
    const server = app.getHttpAdapter().getInstance();
    const res = await server.inject({
      method: 'POST',
      url: '/v1/auth/password-reset/request',
      payload: { email: UNKNOWN_EMAIL },
    });
    expect(res.statusCode).toBe(202);
    expect(flowAccepted.parse(JSON.parse(res.payload))).toEqual({ ok: true });
    expect(demoDelivery.list()).toHaveLength(0);
    const rows = (await sql.unsafe(`SELECT count(*)::int AS n FROM "identity_tokens";`)) as Array<{ n: number }>;
    expect(rows[0].n).toBe(0);
  });

  it('resets the password, revokes old sessions, and rejects replays', async () => {
    if (skipped || !sql || !app) return;
    const server = app.getHttpAdapter().getInstance();

    const reg = await server.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: RESET_EMAIL, password: 'old-password-99' },
    });
    expect(reg.statusCode).toBe(201);
    const oldAccess = cookieValue(setCookiesOf(reg), 'access_token') as string;

    const req = await server.inject({
      method: 'POST',
      url: '/v1/auth/password-reset/request',
      payload: { email: RESET_EMAIL },
    });
    expect(req.statusCode).toBe(202);
    // Indistinguishable from the unknown-email response above.
    expect(JSON.parse(req.payload)).toEqual({ ok: true });

    const deliveries = demoDelivery.list();
    expect(deliveries).toHaveLength(1);
    const token = deliveries[0]?.token as string;

    const confirm = await server.inject({
      method: 'POST',
      url: '/v1/auth/password-reset/confirm',
      payload: { token, newPassword: NEW_PASSWORD },
    });
    expect(confirm.statusCode).toBe(200);

    const login = await server.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: RESET_EMAIL, password: NEW_PASSWORD },
    });
    expect(login.statusCode).toBe(200);
    expect(authResponse.parse(JSON.parse(login.payload)).user.email).toBe(RESET_EMAIL);

    const oldSession = await server.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: { cookie: `access_token=${oldAccess}` },
    });
    expect(oldSession.statusCode).toBe(401);

    const replay = await server.inject({
      method: 'POST',
      url: '/v1/auth/password-reset/confirm',
      payload: { token, newPassword: 'another-new-99' },
    });
    expect(replay.statusCode).toBe(404);
    expect(problemResponse.parse(JSON.parse(replay.payload)).code).toBe('NOT_FOUND');
  });

  it('supersedes older proofs and rejects pre-expired ones', async () => {
    if (skipped || !sql || !app) return;
    const server = app.getHttpAdapter().getInstance();
    demoDelivery.clear();

    await server.inject({
      method: 'POST',
      url: '/v1/auth/password-reset/request',
      payload: { email: RESET_EMAIL },
    });
    const first = demoDelivery.list()[0]?.token as string;
    await server.inject({
      method: 'POST',
      url: '/v1/auth/password-reset/request',
      payload: { email: RESET_EMAIL },
    });
    const second = demoDelivery.list()[1]?.token as string;
    expect(second).not.toBe(first);

    const stale = await server.inject({
      method: 'POST',
      url: '/v1/auth/password-reset/confirm',
      payload: { token: first, newPassword: 'another-new-99' },
    });
    expect(stale.statusCode).toBe(404);

    // A proof born expired can never work.
    const user = (await sql.unsafe(`SELECT "id" FROM "users" WHERE "email_normalized" = $1;`, [
      RESET_EMAIL,
    ])) as Array<{ id: string }>;
    const deadRaw = 'dead-proof-raw-value';
    await sql.unsafe(
      `INSERT INTO "identity_tokens" ("user_id","purpose","token_hash","expires_at") VALUES ($1,'reset',$2, now() - interval '1 hour');`,
      [user[0]?.id as string, createHash('sha256').update(deadRaw, 'utf8').digest('hex')],
    );
    const dead = await server.inject({
      method: 'POST',
      url: '/v1/auth/password-reset/confirm',
      payload: { token: deadRaw, newPassword: 'another-new-99' },
    });
    expect(dead.statusCode).toBe(404);
  });

  it('activates pending accounts without lifting suspensions', async () => {
    if (skipped || !sql || !app) return;
    const server = app.getHttpAdapter().getInstance();
    const pendingHash = await hashPassword('pending-pass-99');
    const suspendedHash = await hashPassword('suspended-pass-99');
    await sql.unsafe(
      `INSERT INTO "users" ("email_normalized","password_hash","status") VALUES ($1,$2,'pending_verification'), ($3,$4,'suspended') ON CONFLICT DO NOTHING;`,
      [PENDING_EMAIL, pendingHash, SUSPENDED_EMAIL, suspendedHash],
    );

    const login = await server.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: PENDING_EMAIL, password: 'pending-pass-99' },
    });
    expect(login.statusCode).toBe(200);
    const access = cookieValue(setCookiesOf(login), 'access_token') as string;

    demoDelivery.clear();
    const req = await server.inject({
      method: 'POST',
      url: '/v1/auth/verify-email/request',
      headers: { cookie: `access_token=${access}` },
    });
    expect(req.statusCode).toBe(202);
    const token = demoDelivery.list()[0]?.token as string;

    const confirm = await server.inject({
      method: 'POST',
      url: '/v1/auth/verify-email/confirm',
      payload: { token },
    });
    expect(confirm.statusCode).toBe(200);
    const status = (await sql.unsafe(`SELECT "status" FROM "users" WHERE "email_normalized" = $1;`, [
      PENDING_EMAIL,
    ])) as Array<{ status: string }>;
    expect(status[0]?.status).toBe('active');

    const replay = await server.inject({
      method: 'POST',
      url: '/v1/auth/verify-email/confirm',
      payload: { token },
    });
    expect(replay.statusCode).toBe(404);

    // Suspended accounts are never lifted by verification proofs.
    const suspendedUser = (await sql.unsafe(`SELECT "id" FROM "users" WHERE "email_normalized" = $1;`, [
      SUSPENDED_EMAIL,
    ])) as Array<{ id: string }>;
    await sql.unsafe(
      `INSERT INTO "identity_tokens" ("user_id","purpose","token_hash","expires_at") VALUES ($1,'verification',$2, now() + interval '1 hour') ON CONFLICT DO NOTHING;`,
      [suspendedUser[0]?.id as string, createHash('sha256').update('suspended-proof', 'utf8').digest('hex')],
    );
    const lift = await server.inject({
      method: 'POST',
      url: '/v1/auth/verify-email/confirm',
      payload: { token: 'suspended-proof' },
    });
    expect(lift.statusCode).toBe(404);
    const still = (await sql.unsafe(`SELECT "status" FROM "users" WHERE "email_normalized" = $1;`, [
      SUSPENDED_EMAIL,
    ])) as Array<{ status: string }>;
    expect(still[0]?.status).toBe('suspended');
  });
});
