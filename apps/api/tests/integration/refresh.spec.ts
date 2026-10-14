// T011b acceptance over real HTTP: race two refreshes, reuse consumed
// tokens, and exercise logout — all against live PostgreSQL row locking.
// Needs a REAL database (ambient DATABASE_URL); skips honestly otherwise.
// Documented strict outcome: the race loser observes a consumed token and
// revokes the family (theft response per module spec); the browser-side
// single-flight helper (web lib/session.ts) exists precisely so benign
// clients never trigger this path by accident.

import 'reflect-metadata';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { resetEnvCache } from '@shopscale/config';
import { authResponse, problemResponse } from '@shopscale/contracts';
import { openAdminConnection, requireDatabaseUrl, resolveMigrationsDir, runMigrations } from '@shopscale/backend';
import { createApp } from '../../src/main.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..', '..');
const migrationsDir = resolveMigrationsDir(repoRoot);

const EMAILS = ['t011.race@example.com', 't011.reuse@example.com', 't011.logout@example.com'];
const PASSWORD = 'correct-horse-99';

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
  process.env.JWT_ACCESS_SECRET = 't011-access-secret-000000000000000';
  process.env.JWT_REFRESH_SECRET = 't011-refresh-secret-00000000000000';
  process.env.MOCK_PAYMENTS_SECRET = 't011-mock-payments-secret-0000000';
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

function cookieValue(setCookies: string[], name: string): string | null {
  const found = setCookies.find((c) => c.startsWith(`${name}=`));
  if (!found) return null;
  return found.split(';')[0]?.split('=')[1] ?? null;
}

function setCookiesOf(res: { headers: Record<string, unknown> }): string[] {
  const raw = res.headers['set-cookie'];
  return Array.isArray(raw) ? (raw as string[]) : [];
}

beforeEach(() => {
  savedEnv = {};
  setSecrets();
});

afterEach(() => {
  restoreSecrets();
});

describe('refresh rotation and logout over HTTP (T011b)', () => {
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

  async function register(email: string): Promise<{ refresh: string; access: string; userId: string }> {
    const server = app!.getHttpAdapter().getInstance();
    const res = await server.inject({ method: 'POST', url: '/v1/auth/register', payload: { email, password: PASSWORD } });
    expect(res.statusCode).toBe(201);
    const body = authResponse.parse(JSON.parse(res.payload));
    const cookies = setCookiesOf(res);
    const refresh = cookieValue(cookies, 'refresh_token');
    const access = cookieValue(cookies, 'access_token');
    expect(refresh).toBeTruthy();
    expect(access).toBeTruthy();
    return { refresh: refresh as string, access: access as string, userId: body.user.id };
  }

  async function familyState(userId: string): Promise<{ revoked: boolean; liveTokens: number }> {
    const rows = (await sql!.unsafe(
      `SELECT f."revoked_at" AS revoked, count(t."id") FILTER (WHERE t."used_at" IS NULL)::int AS live
       FROM "session_families" f LEFT JOIN "refresh_tokens" t ON t."family_id" = f."id"
       WHERE f."user_id" = $1 GROUP BY f."id";`,
      [userId],
    )) as Array<{ revoked: Date | null; live: number }>;
    const row = rows[0];
    if (!row) throw new Error('expected exactly one family');
    return { revoked: row.revoked !== null, liveTokens: row.live };
  }

  it('races two refreshes: exactly one succeeds, no two usable descendants', async () => {
    if (skipped || !sql || !app) return;
    const server = app.getHttpAdapter().getInstance();
    const { refresh, userId } = await register(EMAILS[0] as string);

    const [a, b] = await Promise.all([
      server.inject({ method: 'POST', url: '/v1/auth/refresh', headers: { cookie: `refresh_token=${refresh}` } }),
      server.inject({ method: 'POST', url: '/v1/auth/refresh', headers: { cookie: `refresh_token=${refresh}` } }),
    ]);
    const statuses = [a.statusCode, b.statusCode].sort();
    expect(statuses).toEqual([200, 401]);

    // Loser observed a consumed token: family revoked, nothing usable remains.
    const state = await familyState(userId);
    expect(state.revoked).toBe(true);
    const winner = a.statusCode === 200 ? a : b;
    const winnerRefresh = cookieValue(setCookiesOf(winner), 'refresh_token') as string;
    const replay = await server.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      headers: { cookie: `refresh_token=${winnerRefresh}` },
    });
    expect(replay.statusCode).toBe(401);
  });

  it('reusing a consumed token revokes the family and kills the session', async () => {
    if (skipped || !sql || !app) return;
    const server = app.getHttpAdapter().getInstance();
    const { refresh, access, userId } = await register(EMAILS[1] as string);

    const first = await server.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      headers: { cookie: `refresh_token=${refresh}` },
    });
    expect(first.statusCode).toBe(200);

    const reuse = await server.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      headers: { cookie: `refresh_token=${refresh}` },
    });
    expect(reuse.statusCode).toBe(401);
    expect(problemResponse.parse(JSON.parse(reuse.payload)).code).toBe('UNAUTHENTICATED');

    const state = await familyState(userId);
    expect(state.revoked).toBe(true);

    const me = await server.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: { cookie: `access_token=${access}` },
    });
    expect(me.statusCode).toBe(401);
  });

  it('logout revokes the family, clears cookies, and ends the session', async () => {
    if (skipped || !sql || !app) return;
    const server = app.getHttpAdapter().getInstance();
    const { refresh, access, userId } = await register(EMAILS[2] as string);

    const out = await server.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      headers: { cookie: `access_token=${access}; refresh_token=${refresh}` },
    });
    expect(out.statusCode).toBe(200);
    const cleared = setCookiesOf(out).join('\n');
    expect(cleared).toContain('Max-Age=0');

    const state = await familyState(userId);
    expect(state.revoked).toBe(true);

    const me = await server.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: { cookie: `access_token=${access}` },
    });
    expect(me.statusCode).toBe(401);

    const refreshAfter = await server.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      headers: { cookie: `refresh_token=${refresh}` },
    });
    expect(refreshAfter.statusCode).toBe(401);
  });

  it('rejects unauthenticated access to the profile', async () => {
    if (skipped || !app) return;
    const server = app.getHttpAdapter().getInstance();
    const res = await server.inject({ method: 'GET', url: '/v1/auth/me' });
    expect(res.statusCode).toBe(401);
    expect(problemResponse.parse(JSON.parse(res.payload)).code).toBe('UNAUTHENTICATED');
  });
});
