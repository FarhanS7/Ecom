// T018 authorization matrix over real HTTP: every documented route runs
// against seven personas plus anonymous, asserting the classified outcome —
// and the registry itself is asserted complete against the OpenAPI document,
// so unclassified endpoints fail CI by construction. Needs a REAL database;
// skips honestly otherwise.
//
// Denial codes: scoped store routes collapse every scope failure to generic
// 404 (member without grant included — uniform no-oracle rule, T014b/T015b);
// platform-admin routes 403 (documented platform surface, nothing to hide).

import 'reflect-metadata';
import { readFile } from 'node:fs/promises';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { resetEnvCache } from '@shopscale/config';
import {
  findUnclassifiedRoutes,
  findUndocumentedRoutes,
  openAdminConnection,
  requireDatabaseUrl,
  resolveMigrationsDir,
  runMigrations,
} from '@shopscale/backend';
import { createApp } from '../../src/main.js';
import { MATRIX_PASSWORD, MATRIX_USERS, setupMatrixWorld, teardownMatrixWorld } from '../fixtures/actors.js';
import type { MatrixActor, MatrixWorld } from '../fixtures/actors.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..', '..');
const migrationsDir = resolveMigrationsDir(repoRoot);

let skipped = false;
let savedEnv: Record<string, string | undefined> = {};

function setSecrets(): void {
  for (const k of ['NODE_ENV', 'REDIS_CACHE_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'MOCK_PAYMENTS_SECRET', 'COOKIE_SECURE'] as const) {
    savedEnv[k] = process.env[k];
  }
  process.env.NODE_ENV = 'test';
  process.env.REDIS_CACHE_URL = 'redis://localhost:6379';
  process.env.JWT_ACCESS_SECRET = 't018-access-secret-000000000000000';
  process.env.JWT_REFRESH_SECRET = 't018-refresh-secret-00000000000000';
  process.env.MOCK_PAYMENTS_SECRET = 't018-mock-payments-secret-0000000';
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

beforeEach(() => {
  savedEnv = {};
  setSecrets();
});

afterEach(() => {
  restoreSecrets();
});

describe('authorization matrix (T018)', () => {
  let app: NestFastifyApplication | null = null;
  let world: MatrixWorld | null = null;
  const cookies: Partial<Record<MatrixActor, string>> = {};

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
    const sql = openAdminConnection(url);
    try {
      await sql`SELECT 1`;
    } catch {
      await sql.end();
      skipped = true;
      console.warn('SKIP: database unreachable; start infra first (T004).');
      return;
    }
    await runMigrations(sql, migrationsDir);
    await teardownMatrixWorld(sql);
    world = await setupMatrixWorld(sql);
    const created = await createApp();
    app = created.app;
    await app.init();
  }, 60_000);

  afterAll(async () => {
    if (app) await app.close();
    app = null;
    if (world) {
      await teardownMatrixWorld(world.sql);
      await world.sql.end();
      world = null;
    }
    restoreSecrets();
  });

  async function loginAs(actor: MatrixActor): Promise<string> {
    const cached = cookies[actor];
    if (cached) return cached;
    const server = app!.getHttpAdapter().getInstance();
    const res = await server.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: MATRIX_USERS[actor], password: MATRIX_PASSWORD },
    });
    expect(res.statusCode).toBe(200);
    const raw = res.headers['set-cookie'];
    const list = Array.isArray(raw) ? (raw as string[]) : [];
    const cookie = list.find((c) => c.startsWith('access_token='))?.split(';')[0] ?? '';
    cookies[actor] = cookie;
    return cookie;
  }

  function authed(actor: MatrixActor): Record<string, string> {
    return { cookie: cookies[actor] as string };
  }

  it('classifies every documented route (CI gate)', async () => {
    const raw = await readFile(join(repoRoot, 'docs', 'openapi.json'), 'utf8');
    const doc = JSON.parse(raw) as { paths: Record<string, Record<string, unknown>> };
    expect(findUnclassifiedRoutes(doc.paths)).toEqual([]);
    expect(findUndocumentedRoutes(doc.paths)).toEqual([]);
  });

  it('anonymous: public reads pass, everything else 401s', async () => {
    if (skipped || !app || !world) return;
    const server = app.getHttpAdapter().getInstance();
    expect((await server.inject({ method: 'GET', url: '/health/live' })).statusCode).toBe(200);
    expect((await server.inject({ method: 'GET', url: '/v1/auth/me' })).statusCode).toBe(401);
    expect(
      (await server.inject({ method: 'GET', url: `/v1/seller/stores/${world.storeA}/membership` })).statusCode,
    ).toBe(401);
    expect(
      (
        await server.inject({
          method: 'POST',
          url: `/v1/admin/stores/${world.storeA}/approve`,
        })
      ).statusCode,
    ).toBe(401);
  });

  it('customer: self reads pass, store scope and admin deny', async () => {
    if (skipped || !app || !world) return;
    const server = app.getHttpAdapter().getInstance();
    await loginAs('customer');
    expect(
      (await server.inject({ method: 'GET', url: '/v1/auth/me', headers: authed('customer') })).statusCode,
    ).toBe(200);
    const membership = await server.inject({
      method: 'GET',
      url: `/v1/seller/stores/${world.storeA}/membership`,
      headers: authed('customer'),
    });
    expect(membership.statusCode).toBe(404);
    const approve = await server.inject({
      method: 'POST',
      url: `/v1/admin/stores/${world.storeA}/approve`,
      headers: authed('customer'),
    });
    expect(approve.statusCode).toBe(403);
  });

  it('owners: own scope passes, cross-store probes are indistinguishable from unknown', async () => {
    if (skipped || !app || !world) return;
    const server = app.getHttpAdapter().getInstance();
    await loginAs('ownerA');
    // Multi-role: shopper identity and staff scope on one account.
    expect(
      (await server.inject({ method: 'GET', url: '/v1/auth/me', headers: authed('ownerA') })).statusCode,
    ).toBe(200);
    const own = await server.inject({
      method: 'GET',
      url: `/v1/seller/stores/${world.storeA}/membership`,
      headers: authed('ownerA'),
    });
    expect(own.statusCode).toBe(200);
    // Membership bodies carry role/status only — no emails, no user lists.
    expect(JSON.parse(own.payload)).toEqual({ storeId: world.storeA, role: 'owner', status: 'active' });

    const cross = await server.inject({
      method: 'GET',
      url: `/v1/seller/stores/${world.storeB}/membership`,
      headers: authed('ownerA'),
    });
    const unknown = await server.inject({
      method: 'GET',
      url: '/v1/seller/stores/00000000-0000-0000-0000-000000000000/membership',
      headers: authed('ownerA'),
    });
    expect(cross.statusCode).toBe(404);
    expect(JSON.parse(cross.payload)).toEqual(JSON.parse(unknown.payload));

    await loginAs('ownerB');
    expect(
      (
        await server.inject({
          method: 'GET',
          url: `/v1/seller/stores/${world.storeB}/membership`,
          headers: authed('ownerB'),
        })
      ).statusCode,
    ).toBe(200);
    // Store owners are not platform admins.
    expect(
      (
        await server.inject({
          method: 'POST',
          url: `/v1/admin/stores/${world.storeA}/approve`,
          headers: authed('ownerA'),
        })
      ).statusCode,
    ).toBe(403);
  });

  it('editor reads but cannot manage team; fulfillment reads but cannot manage team', async () => {
    if (skipped || !app || !world) return;
    const server = app.getHttpAdapter().getInstance();
    await loginAs('editorA');
    const read = await server.inject({
      method: 'GET',
      url: `/v1/seller/stores/${world.storeA}/membership`,
      headers: authed('editorA'),
    });
    expect(read.statusCode).toBe(200);
    expect(JSON.parse(read.payload)).toMatchObject({ role: 'catalog-editor' });
    // Members without the grant share the generic scoped 404 (uniform rule).
    const editorPatch = await server.inject({
      method: 'PATCH',
      url: `/v1/seller/stores/${world.storeA}/members/${world.userIds.editorA}`,
      headers: authed('editorA'),
      payload: { role: 'manager' },
    });
    expect(editorPatch.statusCode).toBe(404);

    await loginAs('fulfillB');
    expect(
      (
        await server.inject({
          method: 'GET',
          url: `/v1/seller/stores/${world.storeB}/membership`,
          headers: authed('fulfillB'),
        })
      ).statusCode,
    ).toBe(200);
    const fulfillPatch = await server.inject({
      method: 'PATCH',
      url: `/v1/seller/stores/${world.storeB}/members/${world.userIds.fulfillB}`,
      headers: authed('fulfillB'),
      payload: { role: 'manager' },
    });
    expect(fulfillPatch.statusCode).toBe(404);
  });

  it('support reads self but has no store or admin scope', async () => {
    if (skipped || !app || !world) return;
    const server = app.getHttpAdapter().getInstance();
    await loginAs('support');
    expect(
      (await server.inject({ method: 'GET', url: '/v1/auth/me', headers: authed('support') })).statusCode,
    ).toBe(200);
    expect(
      (
        await server.inject({
          method: 'GET',
          url: `/v1/seller/stores/${world.storeA}/membership`,
          headers: authed('support'),
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await server.inject({
          method: 'POST',
          url: `/v1/admin/stores/${world.storeA}/approve`,
          headers: authed('support'),
        })
      ).statusCode,
    ).toBe(403);
  });

  it('admin approves pending stores (and only admins do)', async () => {
    if (skipped || !app || !world) return;
    const server = app.getHttpAdapter().getInstance();
    await loginAs('admin');
    const approve = await server.inject({
      method: 'POST',
      url: `/v1/admin/stores/${world.pendingStore}/approve`,
      headers: authed('admin'),
    });
    expect(approve.statusCode).toBe(200);
    expect(JSON.parse(approve.payload)).toMatchObject({ storeId: world.pendingStore, status: 'active' });
  });
});
