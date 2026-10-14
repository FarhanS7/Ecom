// T015b onboarding flows over real HTTP: applications, approval/suspension,
// invitations with one-use acceptance, cross-store denial, and last-owner
// protection. Needs a REAL database; skips honestly otherwise.

import 'reflect-metadata';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { resetEnvCache } from '@shopscale/config';
import { problemResponse } from '@shopscale/contracts';
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

const OWNER_A = 't015b.owner.a@example.com';
const OWNER_B = 't015b.owner.b@example.com';
const STAFF = 't015b.staff@example.com';
const ADMIN = 't015b.admin@example.com';
const PASSWORD = 'correct-horse-99';
const EMAILS = [OWNER_A, OWNER_B, STAFF, ADMIN];

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
  process.env.JWT_ACCESS_SECRET = 't015b-access-secret-0000000000000';
  process.env.JWT_REFRESH_SECRET = 't015b-refresh-secret-00000000000';
  process.env.MOCK_PAYMENTS_SECRET = 't015b-mock-payments-secret-000000';
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
    `DELETE FROM "store_invitations" WHERE "store_id" IN (SELECT "s"."id" FROM "stores" s JOIN "businesses" b ON b."id" = s."business_id" JOIN "users" u ON u."id" = b."owner_user_id" WHERE u."email_normalized" IN (${list}));`,
  );
  await sql.unsafe(
    `DELETE FROM "store_memberships" WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" IN (${list}));`,
  );
  await sql.unsafe(
    `DELETE FROM "stores" WHERE "business_id" IN (SELECT "b"."id" FROM "businesses" b JOIN "users" u ON u."id" = b."owner_user_id" WHERE u."email_normalized" IN (${list}));`,
  );
  await sql.unsafe(
    `DELETE FROM "businesses" WHERE "owner_user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" IN (${list}));`,
  );
  await sql.unsafe(
    `DELETE FROM "user_platform_roles" WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" IN (${list}));`,
  );
  await sql.unsafe(
    `DELETE FROM "identity_tokens" WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" IN (${list}));`,
  );
  await sql.unsafe(
    `DELETE FROM "refresh_tokens" WHERE "family_id" IN (SELECT "id" FROM "session_families" WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" IN (${list})));`,
  );
  await sql.unsafe(`DELETE FROM "session_families" WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" IN (${list}));`);
  await sql.unsafe(`DELETE FROM "audit_logs" WHERE "actor_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" IN (${list}));`);
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

describe('seller onboarding over HTTP (T015b)', () => {
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

  async function register(email: string): Promise<void> {
    const server = app!.getHttpAdapter().getInstance();
    const res = await server.inject({ method: 'POST', url: '/v1/auth/register', payload: { email, password: PASSWORD } });
    expect(res.statusCode).toBe(201);
  }

  async function loginCookie(email: string): Promise<string> {
    const server = app!.getHttpAdapter().getInstance();
    const res = await server.inject({ method: 'POST', url: '/v1/auth/login', payload: { email, password: PASSWORD } });
    expect(res.statusCode).toBe(200);
    return accessCookieOf(res);
  }

  async function grantAdmin(email: string): Promise<void> {
    await sql!.unsafe(
      `INSERT INTO "user_platform_roles" ("user_id","role_id") SELECT "id", (SELECT "id" FROM "platform_roles" WHERE "key" = 'admin') FROM "users" WHERE "email_normalized" = $1 ON CONFLICT DO NOTHING;`,
      [email],
    );
  }

  it('applies once per account and guards slugs', async () => {
    if (skipped || !app) return;
    const server = app.getHttpAdapter().getInstance();
    await register(OWNER_A);
    const cookie = await loginCookie(OWNER_A);
    const first = await server.inject({
      method: 'POST',
      url: '/v1/seller-applications',
      headers: { cookie },
      payload: { slug: 't015b-shop-a', name: 'Shop A' },
    });
    expect(first.statusCode).toBe(201);
    expect(JSON.parse(first.payload)).toMatchObject({ status: 'pending' });
    const second = await server.inject({
      method: 'POST',
      url: '/v1/seller-applications',
      headers: { cookie },
      payload: { slug: 't015b-shop-a2', name: 'Shop A2' },
    });
    expect(second.statusCode).toBe(409);
    await register(OWNER_B);
    const cookieB = await loginCookie(OWNER_B);
    const clash = await server.inject({
      method: 'POST',
      url: '/v1/seller-applications',
      headers: { cookie: cookieB },
      payload: { slug: 't015b-shop-a', name: 'Clone' },
    });
    expect(clash.statusCode).toBe(409);
  });

  it('restricts approval to admins and enforces transitions', async () => {
    if (skipped || !sql || !app) return;
    const server = app.getHttpAdapter().getInstance();
    await register(ADMIN);
    await grantAdmin(ADMIN);
    const adminCookie = await loginCookie(ADMIN);
    const ownerCookie = await loginCookie(OWNER_A);
    const storeId = (
      (await sql.unsafe(`SELECT "s"."id" FROM "stores" s JOIN "businesses" b ON b."id" = s."business_id" JOIN "users" u ON u."id" = b."owner_user_id" WHERE u."email_normalized" = $1;`, [
        OWNER_A,
      ])) as Array<{ id: string }>
    )[0]?.id as string;

    const ownerAttempt = await server.inject({
      method: 'POST',
      url: `/v1/admin/stores/${storeId}/approve`,
      headers: { cookie: ownerCookie },
    });
    expect(ownerAttempt.statusCode).toBe(403);

    const approve = await server.inject({
      method: 'POST',
      url: `/v1/admin/stores/${storeId}/approve`,
      headers: { cookie: adminCookie },
    });
    expect(approve.statusCode).toBe(200);
    expect(JSON.parse(approve.payload)).toMatchObject({ storeId, status: 'active' });

    const reapprove = await server.inject({
      method: 'POST',
      url: `/v1/admin/stores/${storeId}/approve`,
      headers: { cookie: adminCookie },
    });
    expect(reapprove.statusCode).toBe(409);

    const suspend = await server.inject({
      method: 'POST',
      url: `/v1/admin/stores/${storeId}/suspend`,
      headers: { cookie: adminCookie },
    });
    expect(suspend.statusCode).toBe(200);
    // Suspension gates publishing/checkout, not membership reads.
    const read = await server.inject({
      method: 'GET',
      url: `/v1/seller/stores/${storeId}/membership`,
      headers: { cookie: ownerCookie },
    });
    expect(read.statusCode).toBe(200);
  });

  it('invites once, accepts once, and denies cross-store grants', async () => {
    if (skipped || !sql || !app) return;
    const server = app.getHttpAdapter().getInstance();
    await register(STAFF);
    const staffCookie = await loginCookie(STAFF);
    const ownerCookie = await loginCookie(OWNER_A);
    const storeA = (
      (await sql.unsafe(`SELECT "s"."id" FROM "stores" s JOIN "businesses" b ON b."id" = s."business_id" JOIN "users" u ON u."id" = b."owner_user_id" WHERE u."email_normalized" = $1;`, [
        OWNER_A,
      ])) as Array<{ id: string }>
    )[0]?.id as string;

    const invite = await server.inject({
      method: 'POST',
      url: `/v1/seller/stores/${storeA}/invitations`,
      headers: { cookie: ownerCookie },
      payload: { email: STAFF, role: 'manager' },
    });
    expect(invite.statusCode).toBe(201);
    const token = (JSON.parse(invite.payload) as { token: string }).token;
    expect(typeof token).toBe('string');

    const accept = await server.inject({
      method: 'POST',
      url: '/v1/invitations/accept',
      headers: { cookie: staffCookie },
      payload: { token },
    });
    expect(accept.statusCode).toBe(200);
    expect(JSON.parse(accept.payload)).toMatchObject({ storeId: storeA, role: 'manager', status: 'active' });

    const replay = await server.inject({
      method: 'POST',
      url: '/v1/invitations/accept',
      headers: { cookie: staffCookie },
      payload: { token },
    });
    expect(replay.statusCode).toBe(404);
    const count = (await sql.unsafe(
      `SELECT count(*)::int AS n FROM "store_memberships" WHERE "store_id" = $1 AND "user_id" = (SELECT "id" FROM "users" WHERE "email_normalized" = $2);`,
      [storeA, STAFF],
    )) as Array<{ n: number }>;
    expect(count[0]?.n).toBe(1);

    // Owner A's scope ends at store A: granting inside B is denied as 404.
    const otherCookie = await loginCookie(OWNER_B);
    const applyB = await server.inject({
      method: 'POST',
      url: '/v1/seller-applications',
      headers: { cookie: otherCookie },
      payload: { slug: 't015b-shop-b', name: 'Shop B' },
    });
    expect(applyB.statusCode).toBe(201);
    const otherStore = (
      (await sql.unsafe(`SELECT "s"."id" FROM "stores" s JOIN "businesses" b ON b."id" = s."business_id" JOIN "users" u ON u."id" = b."owner_user_id" WHERE u."email_normalized" = $1;`, [
        OWNER_B,
      ])) as Array<{ id: string }>
    )[0]?.id as string;
    const staffId = (
      (await sql.unsafe(`SELECT "id" FROM "users" WHERE "email_normalized" = $1;`, [STAFF])) as Array<{ id: string }>
    )[0]?.id as string;
    const cross = await server.inject({
      method: 'PATCH',
      url: `/v1/seller/stores/${otherStore}/members/${staffId}`,
      headers: { cookie: ownerCookie },
      payload: { role: 'manager' },
    });
    expect(cross.statusCode).toBe(404);
  });

  it('protects the last active owner from demotion and revocation', async () => {
    if (skipped || !sql || !app) return;
    const server = app.getHttpAdapter().getInstance();
    const ownerCookie = await loginCookie(OWNER_A);
    const storeA = (
      (await sql.unsafe(`SELECT "s"."id" FROM "stores" s JOIN "businesses" b ON b."id" = s."business_id" JOIN "users" u ON u."id" = b."owner_user_id" WHERE u."email_normalized" = $1;`, [
        OWNER_A,
      ])) as Array<{ id: string }>
    )[0]?.id as string;
    const ownerId = (
      (await sql.unsafe(`SELECT "id" FROM "users" WHERE "email_normalized" = $1;`, [OWNER_A])) as Array<{ id: string }>
    )[0]?.id as string;

    const demote = await server.inject({
      method: 'PATCH',
      url: `/v1/seller/stores/${storeA}/members/${ownerId}`,
      headers: { cookie: ownerCookie },
      payload: { role: 'manager' },
    });
    expect(demote.statusCode).toBe(409);

    const revoke = await server.inject({
      method: 'PATCH',
      url: `/v1/seller/stores/${storeA}/members/${ownerId}`,
      headers: { cookie: ownerCookie },
      payload: { status: 'revoked' },
    });
    expect(revoke.statusCode).toBe(409);
    expect(problemResponse.parse(JSON.parse(revoke.payload)).code).toBe('CONFLICT');
  });
});
