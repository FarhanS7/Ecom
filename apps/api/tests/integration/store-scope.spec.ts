// T014b acceptance over real HTTP: cross-store probes deny without leakage,
// and revoking a membership denies the SAME access token immediately — while
// that token still passes the session guard elsewhere (scope is live, never
// from claims). Needs a REAL database; skips honestly otherwise.

import 'reflect-metadata';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { resetEnvCache } from '@shopscale/config';
import { problemResponse, storeMembershipResponse } from '@shopscale/contracts';
import { hashPassword } from '@shopscale/backend';
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

const OWNER_A = 't014b.owner.a@example.com';
const OWNER_B = 't014b.owner.b@example.com';
const PASSWORD = 'correct-horse-99';
const EMAILS = [OWNER_A, OWNER_B];

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
  process.env.JWT_ACCESS_SECRET = 't014b-access-secret-00000000000000';
  process.env.JWT_REFRESH_SECRET = 't014b-refresh-secret-000000000000';
  process.env.MOCK_PAYMENTS_SECRET = 't014b-mock-payments-secret-000000';
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
  const userIds = (await sql.unsafe(
    `SELECT "id" FROM "users" WHERE "email_normalized" IN (${list});`,
  )) as Array<{ id: string }>;
  const ids = userIds.map((r) => r.id);
  if (ids.length > 0) {
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    const params = ids as string[];
    await sql.unsafe(
      `DELETE FROM "store_memberships" WHERE "user_id" IN (${placeholders});`,
      params,
    );
    const storeIds = (await sql.unsafe(
      `SELECT "s"."id" FROM "stores" s JOIN "businesses" b ON b."id" = s."business_id" WHERE b."owner_user_id" IN (${placeholders});`,
      params,
    )) as Array<{ id: string }>;
    if (storeIds.length > 0) {
      const sp = storeIds.map((_, i) => `$${i + 1}`).join(',');
      await sql.unsafe(`DELETE FROM "stores" WHERE "id" IN (${sp});`, storeIds.map((r) => r.id));
    }
    await sql.unsafe(`DELETE FROM "businesses" WHERE "owner_user_id" IN (${placeholders});`, params);
    await sql.unsafe(
      `DELETE FROM "identity_tokens" WHERE "user_id" IN (${placeholders});`,
      params,
    );
    await sql.unsafe(
      `DELETE FROM "refresh_tokens" WHERE "family_id" IN (SELECT "id" FROM "session_families" WHERE "user_id" IN (${placeholders}));`,
      params,
    );
    await sql.unsafe(`DELETE FROM "session_families" WHERE "user_id" IN (${placeholders});`, params);
    await sql.unsafe(
      `DELETE FROM "user_platform_roles" WHERE "user_id" IN (${placeholders});`,
      params,
    );
    await sql.unsafe(`DELETE FROM "users" WHERE "id" IN (${placeholders});`, params);
  }
}

function accessCookieOf(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers['set-cookie'];
  const cookies = Array.isArray(raw) ? (raw as string[]) : [];
  const found = cookies.find((c) => c.startsWith('access_token=')) ?? '';
  return found.split(';')[0] ?? '';
}

beforeEach(() => {
  savedEnv = {};
  setSecrets();
});

afterEach(() => {
  restoreSecrets();
});

describe('store scope over HTTP (T014b)', () => {
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

    const passwordHash = await hashPassword(PASSWORD);
    for (const email of EMAILS) {
      await sql.unsafe(
        `INSERT INTO "users" ("email_normalized","password_hash","status") VALUES ($1,$2,'active') ON CONFLICT DO NOTHING;`,
        [email, passwordHash],
      );
    }
    const ids = (await sql.unsafe(
      `SELECT "email_normalized" AS email, "id" FROM "users" WHERE "email_normalized" IN ($1,$2);`,
      [OWNER_A, OWNER_B],
    )) as Array<{ email: string; id: string }>;
    const byEmail = Object.fromEntries(ids.map((r) => [r.email, r.id]));
    const stores: Record<string, string> = {};
    for (const [email, slug] of [
      [OWNER_A, 't014b-store-a'],
      [OWNER_B, 't014b-store-b'],
    ] as const) {
      const biz = (await sql.unsafe(`INSERT INTO "businesses" ("owner_user_id") VALUES ($1) RETURNING "id";`, [
        byEmail[email],
      ])) as Array<{ id: string }>;
      const store = (await sql.unsafe(
        `INSERT INTO "stores" ("business_id","slug","name","status") VALUES ($1,$2,$3,'active') RETURNING "id";`,
        [biz[0]?.id as string, slug, slug],
      )) as Array<{ id: string }>;
      stores[slug] = store[0]?.id as string;
      await sql.unsafe(
        `INSERT INTO "store_memberships" ("store_id","user_id","role_id") SELECT $1, $2, "id" FROM "store_roles" WHERE "key" = 'owner';`,
        [stores[slug], byEmail[email]],
      );
    }

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

  async function login(email: string): Promise<string> {
    const server = app!.getHttpAdapter().getInstance();
    const res = await server.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email, password: PASSWORD },
    });
    expect(res.statusCode).toBe(200);
    return accessCookieOf(res);
  }

  it('lets owners read their own membership', async () => {
    if (skipped || !sql || !app) return;
    const server = app.getHttpAdapter().getInstance();
    const cookie = await login(OWNER_A);
    const storeA = (
      (await sql.unsafe(`SELECT "id" FROM "stores" WHERE "slug" = 't014b-store-a';`)) as Array<{ id: string }>
    )[0]?.id as string;
    const res = await server.inject({
      method: 'GET',
      url: `/v1/seller/stores/${storeA}/membership`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = storeMembershipResponse.parse(JSON.parse(res.payload));
    expect(body).toEqual({ storeId: storeA, role: 'owner', status: 'active' });
  });

  it('denies cross-store probes without leakage', async () => {
    if (skipped || !sql || !app) return;
    const server = app.getHttpAdapter().getInstance();
    const cookie = await login(OWNER_A);
    const storeB = (
      (await sql.unsafe(`SELECT "id" FROM "stores" WHERE "slug" = 't014b-store-b';`)) as Array<{ id: string }>
    )[0]?.id as string;
    const probe = await server.inject({
      method: 'GET',
      url: `/v1/seller/stores/${storeB}/membership`,
      headers: { cookie },
    });
    expect(probe.statusCode).toBe(404);
    const unknown = await server.inject({
      method: 'GET',
      url: '/v1/seller/stores/00000000-0000-0000-0000-000000000000/membership',
      headers: { cookie },
    });
    expect(unknown.statusCode).toBe(404);
    // Identical bodies: probing another store is indistinguishable from a
    // store that does not exist. `instance` echoes the requested URL and
    // `requestId` is per-request correlation, so neither is a signal about
    // existence; the security-relevant fields must match exactly.
    const stableProblem = (payload: string): Record<string, unknown> => {
      const body = JSON.parse(payload) as Record<string, unknown>;
      delete body['instance'];
      delete body['requestId'];
      return body;
    };
    expect(stableProblem(probe.payload)).toEqual(stableProblem(unknown.payload));
    expect(problemResponse.parse(JSON.parse(probe.payload)).code).toBe('NOT_FOUND');
  });

  it('denies the same token immediately after revocation while the session stays live', async () => {
    if (skipped || !sql || !app) return;
    const server = app.getHttpAdapter().getInstance();
    const cookie = await login(OWNER_B);
    const storeB = (
      (await sql.unsafe(`SELECT "id" FROM "stores" WHERE "slug" = 't014b-store-b';`)) as Array<{ id: string }>
    )[0]?.id as string;

    const before = await server.inject({
      method: 'GET',
      url: `/v1/seller/stores/${storeB}/membership`,
      headers: { cookie },
    });
    expect(before.statusCode).toBe(200);

    await sql.unsafe(
      `UPDATE "store_memberships" SET "status" = 'revoked' WHERE "store_id" = $1 AND "user_id" = (SELECT "id" FROM "users" WHERE "email_normalized" = $2);`,
      [storeB, OWNER_B],
    );

    const after = await server.inject({
      method: 'GET',
      url: `/v1/seller/stores/${storeB}/membership`,
      headers: { cookie },
    });
    expect(after.statusCode).toBe(404);

    // The access token itself is untouched: the session guard still passes.
    const me = await server.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: { cookie },
    });
    expect(me.statusCode).toBe(200);
  });
});
