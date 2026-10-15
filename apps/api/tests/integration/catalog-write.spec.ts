// T020b seller catalog mutations over real HTTP: scoped permission writes,
// optimistic version conflicts (two writers, one winner), foreign-store and
// negative-price rejection, duplicate-SKU conflict, publication flag
// independence, and archival preserving rows. T027a extends the same file with
// the publish lifecycle (ADR-0010), asserted through PUBLIC reads after each
// action. Needs a REAL database; skips honestly otherwise (CI runs it live).
//
// Uniform no-oracle rule (T018 matrix convention): EVERY scope failure —
// non-member, member without catalog:manage, foreign product ID, malformed
// body — shares one generic 404. 403 never appears on scoped store routes.

import 'reflect-metadata';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { resetEnvCache } from '@shopscale/config';
import {
  openAdminConnection,
  requireDatabaseUrl,
  resolveMigrationsDir,
  runMigrations,
} from '@shopscale/backend';
import type { Sql } from 'postgres';
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
  process.env.JWT_ACCESS_SECRET = 't020-access-secret-000000000000000';
  process.env.JWT_REFRESH_SECRET = 't020-refresh-secret-00000000000000';
  process.env.MOCK_PAYMENTS_SECRET = 't020-mock-payments-secret-0000000';
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

/** Catalog fixtures are store-owned: delete BEFORE the world teardown,
 * which removes stores (products.store_id is RESTRICT). Covers both the T020
 * mutation fixtures and the T027a lifecycle fixture. */
async function cleanupCatalog(sql: Sql): Promise<void> {
  for (const like of ['t020-%', 't027-%']) {
    await sql.unsafe(
      `DELETE FROM "product_publications" WHERE "product_id" IN (SELECT "id" FROM "products" WHERE "slug" LIKE $1);`,
      [like],
    );
    await sql.unsafe(
      `DELETE FROM "product_variants" WHERE "product_id" IN (SELECT "id" FROM "products" WHERE "slug" LIKE $1);`,
      [like],
    );
    await sql.unsafe(`DELETE FROM "products" WHERE "slug" LIKE $1;`, [like]);
  }
}

describe('seller catalog writes (T020b)', () => {
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
    await cleanupCatalog(sql);
    await teardownMatrixWorld(sql);
    world = await setupMatrixWorld(sql);
    const created = await createApp();
    app = created.app;
    await app.init();
    await sql.end();
  }, 60_000);

  afterAll(async () => {
    if (app) await app.close();
    app = null;
    if (world) {
      await cleanupCatalog(world.sql);
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

  function server() {
    return app!.getHttpAdapter().getInstance();
  }

  it('owner and catalog-editor write; fulfillment member and non-member are generic 404', async () => {
    if (skipped || !app || !world) return;
    await loginAs('ownerA');
    const created = await server().inject({
      method: 'POST',
      url: `/v1/seller/stores/${world.storeA}/products`,
      headers: authed('ownerA'),
      payload: { categoryId: null, slug: 't020-desk-lamp', title: 'Desk Lamp' },
    });
    expect(created.statusCode).toBe(201);
    const product = JSON.parse(created.payload) as { id: string; version: number; status: string; marketplaceEnabled: boolean };
    expect(product.version).toBe(1);
    expect(product.status).toBe('draft');
    expect(product.marketplaceEnabled).toBe(false);

    // catalog-editor role grants catalog:manage → same route succeeds.
    await loginAs('editorA');
    const byEditor = await server().inject({
      method: 'POST',
      url: `/v1/seller/stores/${world.storeA}/products`,
      headers: authed('editorA'),
      payload: { categoryId: null, slug: 't020-editor-lamp', title: 'Editor Lamp' },
    });
    expect(byEditor.statusCode).toBe(201);

    // fulfillment role has no catalog:manage → shares the generic 404.
    await loginAs('fulfillB');
    const byFulfill = await server().inject({
      method: 'POST',
      url: `/v1/seller/stores/${world.storeB}/products`,
      headers: authed('fulfillB'),
      payload: { categoryId: null, slug: 't020-forbidden', title: 'Nope' },
    });
    expect(byFulfill.statusCode).toBe(404);
    expect(byFulfill.payload).not.toMatch(/permission|forbidden/i);

    // Non-member customer sees the same 404 (no existence oracle).
    await loginAs('customer');
    const byCustomer = await server().inject({
      method: 'POST',
      url: `/v1/seller/stores/${world.storeA}/products`,
      headers: authed('customer'),
      payload: { categoryId: null, slug: 't020-customer', title: 'Nope' },
    });
    expect(byCustomer.statusCode).toBe(404);
    const listByCustomer = await server().inject({
      method: 'GET',
      url: `/v1/seller/stores/${world.storeA}/products`,
      headers: authed('customer'),
    });
    expect(listByCustomer.statusCode).toBe(404);
    const anonymous = await server().inject({
      method: 'GET',
      url: `/v1/seller/stores/${world.storeA}/products`,
    });
    expect(anonymous.statusCode).toBe(401);
  });

  it('two writers with the same version: exactly one succeeds', async () => {
    if (skipped || !app || !world) return;
    await loginAs('ownerA');
    const created = await server().inject({
      method: 'POST',
      url: `/v1/seller/stores/${world.storeA}/products`,
      headers: authed('ownerA'),
      payload: { categoryId: null, slug: 't020-race', title: 'Race Product' },
    });
    expect(created.statusCode).toBe(201);
    const product = JSON.parse(created.payload) as { id: string; version: number };

    const writeA = await server().inject({
      method: 'PATCH',
      url: `/v1/seller/stores/${world.storeA}/products/${product.id}`,
      headers: authed('ownerA'),
      payload: { expectedVersion: product.version, title: 'Writer A wins' },
    });
    const writeB = await server().inject({
      method: 'PATCH',
      url: `/v1/seller/stores/${world.storeA}/products/${product.id}`,
      headers: authed('ownerA'),
      payload: { expectedVersion: product.version, title: 'Writer B loses' },
    });
    const codes = [writeA.statusCode, writeB.statusCode].sort();
    expect(codes).toEqual([200, 409]);
    const winner = writeA.statusCode === 200 ? writeA : writeB;
    const loser = writeA.statusCode === 200 ? writeB : writeA;
    const body = JSON.parse(winner.payload) as { title: string; version: number };
    expect(body.version).toBe(product.version + 1);
    expect(body.title).toBe(winner === writeA ? 'Writer A wins' : 'Writer B loses');
    expect(JSON.parse(loser.payload)).toMatchObject({ status: 409 });

    // Retry with the fresh version succeeds (recovery path).
    const retry = await server().inject({
      method: 'PATCH',
      url: `/v1/seller/stores/${world.storeA}/products/${product.id}`,
      headers: authed('ownerA'),
      payload: { expectedVersion: body.version, title: 'Writer B retries' },
    });
    expect(retry.statusCode).toBe(200);
  });

  it('foreign-store IDs, malformed bodies, and negative prices all fail as generic 404', async () => {
    if (skipped || !app || !world) return;
    await loginAs('ownerB');
    const created = await server().inject({
      method: 'POST',
      url: `/v1/seller/stores/${world.storeB}/products`,
      headers: authed('ownerB'),
      payload: { categoryId: null, slug: 't020-foreign', title: 'Foreign Product' },
    });
    expect(created.statusCode).toBe(201);
    const foreign = JSON.parse(created.payload) as { id: string };

    // ownerA is a real member of storeA but not storeB: reading/writing
    // storeB's product through the storeA scope → 404 (product not in A).
    await loginAs('ownerA');
    const read = await server().inject({
      method: 'GET',
      url: `/v1/seller/stores/${world.storeA}/products/${foreign.id}`,
      headers: authed('ownerA'),
    });
    expect(read.statusCode).toBe(404);
    const write = await server().inject({
      method: 'PATCH',
      url: `/v1/seller/stores/${world.storeA}/products/${foreign.id}`,
      headers: authed('ownerA'),
      payload: { expectedVersion: 1, title: 'Hijack' },
    });
    expect(write.statusCode).toBe(404);

    // Negative price never reaches SQL: contract failure shares the 404.
    const negative = await server().inject({
      method: 'POST',
      url: `/v1/seller/stores/${world.storeA}/products/${foreign.id}/variants`,
      headers: authed('ownerA'),
      payload: { sku: 'T020-NEG', priceCents: -500 },
    });
    expect(negative.statusCode).toBe(404);
    expect(negative.payload).not.toMatch(/price|constraint/i);

    // Malformed body on a scoped route shares the same generic 404.
    const malformed = await server().inject({
      method: 'PATCH',
      url: `/v1/seller/stores/${world.storeA}/products/${foreign.id}`,
      headers: authed('ownerA'),
      payload: { title: 'no expectedVersion' },
    });
    expect(malformed.statusCode).toBe(404);
  });

  it('duplicate SKU conflicts per store; publication flags stay independent', async () => {
    if (skipped || !app || !world) return;
    await loginAs('ownerA');
    const created = await server().inject({
      method: 'POST',
      url: `/v1/seller/stores/${world.storeA}/products`,
      headers: authed('ownerA'),
      payload: { categoryId: null, slug: 't020-variants', title: 'Variant Product' },
    });
    const product = JSON.parse(created.payload) as { id: string; version: number };

    const first = await server().inject({
      method: 'POST',
      url: `/v1/seller/stores/${world.storeA}/products/${product.id}/variants`,
      headers: authed('ownerA'),
      payload: { sku: 'T020-DUP', priceCents: 2500, attributes: { size: 'M' } },
    });
    expect(first.statusCode).toBe(201);
    const dup = await server().inject({
      method: 'POST',
      url: `/v1/seller/stores/${world.storeA}/products/${product.id}/variants`,
      headers: authed('ownerA'),
      payload: { sku: 'T020-DUP', priceCents: 3000 },
    });
    expect(dup.statusCode).toBe(409);
    expect(JSON.parse(dup.payload)).toMatchObject({ status: 409 });

    // min_price_cents derives from the active variant.
    const read = await server().inject({
      method: 'GET',
      url: `/v1/seller/stores/${world.storeA}/products/${product.id}`,
      headers: authed('ownerA'),
    });
    expect(read.statusCode).toBe(200);
    expect((JSON.parse(read.payload) as { minPriceCents: number }).minPriceCents).toBe(2500);

    // Unlist from marketplace ONLY: store visibility stays on.
    const toggled = await server().inject({
      method: 'PATCH',
      url: `/v1/seller/stores/${world.storeA}/products/${product.id}/publication`,
      headers: authed('ownerA'),
      payload: { storeEnabled: true },
    });
    expect(toggled.statusCode).toBe(200);
    const pub = JSON.parse(toggled.payload) as { marketplaceEnabled: boolean; storeEnabled: boolean; version: number };
    expect(pub.storeEnabled).toBe(true);
    expect(pub.marketplaceEnabled).toBe(false); // independent, not coupled
    expect(pub.version).toBeGreaterThan(product.version);
  });

  it('archival preserves variant rows and blocks further edits with 409', async () => {
    if (skipped || !app || !world) return;
    await loginAs('ownerA');
    const created = await server().inject({
      method: 'POST',
      url: `/v1/seller/stores/${world.storeA}/products`,
      headers: authed('ownerA'),
      payload: { categoryId: null, slug: 't020-archive', title: 'Archive Product' },
    });
    const product = JSON.parse(created.payload) as { id: string; version: number };
    const variant = await server().inject({
      method: 'POST',
      url: `/v1/seller/stores/${world.storeA}/products/${product.id}/variants`,
      headers: authed('ownerA'),
      payload: { sku: 'T020-ARCH', priceCents: 999 },
    });
    expect(variant.statusCode).toBe(201);

    const archived = await server().inject({
      method: 'POST',
      url: `/v1/seller/stores/${world.storeA}/products/${product.id}/archive`,
      headers: authed('ownerA'),
      payload: { expectedVersion: product.version },
    });
    expect(archived.statusCode).toBe(200);
    expect((JSON.parse(archived.payload) as { status: string }).status).toBe('archived');

    // Historical references survive: the variant row still exists.
    const rows = (await world!.sql.unsafe(
      `SELECT "id" FROM "product_variants" WHERE "store_id" = $1 AND "product_id" = $2;`,
      [world!.storeA, product.id],
    )) as unknown as unknown[];
    expect(rows.length).toBe(1);

    // Stale edit after archival → 409, not silent resurrection.
    const stale = await server().inject({
      method: 'PATCH',
      url: `/v1/seller/stores/${world.storeA}/products/${product.id}`,
      headers: authed('ownerA'),
      payload: { expectedVersion: product.version, title: 'Resurrect' },
    });
    expect(stale.statusCode).toBe(409);
  });

  /**
   * T027a lifecycle (ADR-0010): the seller scenario from the task's
   * verification section, asserted through PUBLIC reads after each action.
   * Draft → (refused publish) → active → store-only → marketplace → unlist →
   * archive, so the visibility chain is proven rather than assumed.
   */
  it('publishes per channel and every public read matches the lifecycle state (T027a)', async () => {
    if (skipped || !app || !world) return;
    const slug = 't027-lifecycle-lamp';
    const sellerPath = `/v1/seller/stores/${world.storeA}/products`;
    const publicStore = () =>
      server().inject({ method: 'GET', url: `/v1/catalog/stores/t018-store-a/products/${slug}` });
    const publicMarket = () =>
      server().inject({ method: 'GET', url: `/v1/catalog/marketplace/products/${slug}` });
    const sellerRead = async (id: string) => {
      const res = await server().inject({ method: 'GET', url: `${sellerPath}/${id}`, headers: authed('ownerA') });
      expect(res.statusCode).toBe(200);
      return JSON.parse(res.payload) as { status: string; version: number; minPriceCents: number };
    };

    await loginAs('ownerA');
    const created = await server().inject({
      method: 'POST',
      url: sellerPath,
      headers: authed('ownerA'),
      payload: { categoryId: null, slug, title: 'Lifecycle Lamp' },
    });
    expect(created.statusCode).toBe(201);
    const draft = JSON.parse(created.payload) as { id: string; version: number; status: string };
    expect(draft.status).toBe('draft');

    // A duplicate slug is an ordinary seller mistake: the scoped unique index
    // becomes a 409 (same shape as a duplicate SKU), never a constraint 500.
    const duplicate = await server().inject({
      method: 'POST',
      url: sellerPath,
      headers: authed('ownerA'),
      payload: { categoryId: null, slug, title: 'Duplicate Lifecycle Lamp' },
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.payload).not.toMatch(/constraint|duplicate key/i);

    // A draft with no channel enabled is invisible on BOTH channels.
    expect((await publicStore()).statusCode).toBe(404);
    expect((await publicMarket()).statusCode).toBe(404);

    // Publishing without an active variant is refused, and the whole write is
    // rolled back: status AND version are unchanged (no phantom bump).
    const refused = await server().inject({
      method: 'PATCH',
      url: `${sellerPath}/${draft.id}`,
      headers: authed('ownerA'),
      payload: { expectedVersion: draft.version, status: 'active' },
    });
    expect(refused.statusCode).toBe(409);
    expect(JSON.parse(refused.payload)).toMatchObject({ status: 409 });
    const afterRefusal = await sellerRead(draft.id);
    expect(afterRefusal.status).toBe('draft');
    expect(afterRefusal.version).toBe(draft.version);
    expect((await publicStore()).statusCode).toBe(404);

    // An active variant makes publication possible and sets the derived price.
    const variant = await server().inject({
      method: 'POST',
      url: `${sellerPath}/${draft.id}/variants`,
      headers: authed('ownerA'),
      payload: { sku: 'T027-LIFE', priceCents: 1850, attributes: { color: 'Black' } },
    });
    expect(variant.statusCode).toBe(201);
    const afterVariant = await sellerRead(draft.id);
    expect(afterVariant.version).toBeGreaterThan(afterRefusal.version);
    expect(afterVariant.minPriceCents).toBe(1850);

    // Publish.
    const published = await server().inject({
      method: 'PATCH',
      url: `${sellerPath}/${draft.id}`,
      headers: authed('ownerA'),
      payload: { expectedVersion: afterVariant.version, status: 'active' },
    });
    expect(published.statusCode).toBe(200);
    const active = JSON.parse(published.payload) as { status: string; version: number };
    expect(active.status).toBe('active');

    // Active, but still enabled on no channel: invisible on both.
    expect((await publicStore()).statusCode).toBe(404);
    expect((await publicMarket()).statusCode).toBe(404);

    // Opt into the STORE channel: a store-only product.
    const storeOn = await server().inject({
      method: 'PATCH',
      url: `${sellerPath}/${draft.id}/publication`,
      headers: authed('ownerA'),
      payload: { storeEnabled: true },
    });
    expect(storeOn.statusCode).toBe(200);
    const storeOnly = JSON.parse(storeOn.payload) as { storeEnabled: boolean; marketplaceEnabled: boolean };
    expect(storeOnly.storeEnabled).toBe(true);
    expect(storeOnly.marketplaceEnabled).toBe(false);

    const storeRead = await publicStore();
    expect(storeRead.statusCode).toBe(200);
    const storeBody = JSON.parse(storeRead.payload) as { slug: string; priceCents: number };
    expect(storeBody.slug).toBe(slug);
    expect(storeBody.priceCents).toBe(1850);
    expect((await publicMarket()).statusCode).toBe(404);

    // Opt into the marketplace: now visible on both.
    const marketOn = await server().inject({
      method: 'PATCH',
      url: `${sellerPath}/${draft.id}/publication`,
      headers: authed('ownerA'),
      payload: { marketplaceEnabled: true },
    });
    expect(marketOn.statusCode).toBe(200);
    expect((await publicMarket()).statusCode).toBe(200);

    // Module acceptance scenario: unlisting from the marketplace keeps the
    // store visibility that was already on.
    const marketOff = await server().inject({
      method: 'PATCH',
      url: `${sellerPath}/${draft.id}/publication`,
      headers: authed('ownerA'),
      payload: { marketplaceEnabled: false },
    });
    expect(marketOff.statusCode).toBe(200);
    const unlisted = JSON.parse(marketOff.payload) as { version: number; storeEnabled: boolean; marketplaceEnabled: boolean };
    expect(unlisted.storeEnabled).toBe(true);
    expect(unlisted.marketplaceEnabled).toBe(false);
    expect((await publicMarket()).statusCode).toBe(404);
    expect((await publicStore()).statusCode).toBe(200);

    // Archive: invisible on both channels, seller view still readable.
    const archived = await server().inject({
      method: 'POST',
      url: `${sellerPath}/${draft.id}/archive`,
      headers: authed('ownerA'),
      payload: { expectedVersion: unlisted.version },
    });
    expect(archived.statusCode).toBe(200);
    expect((await publicMarket()).statusCode).toBe(404);
    expect((await publicStore()).statusCode).toBe(404);
    expect((await sellerRead(draft.id)).status).toBe('archived');

    // A status value outside the contract enum is malformed input: generic 404,
    // and the product is untouched (still archived, same version).
    const badStatus = await server().inject({
      method: 'PATCH',
      url: `${sellerPath}/${draft.id}`,
      headers: authed('ownerA'),
      payload: { expectedVersion: unlisted.version + 1, status: 'archived' },
    });
    expect(badStatus.statusCode).toBe(404);
    expect(badStatus.payload).not.toMatch(/status|constraint/i);
    expect((await sellerRead(draft.id)).version).toBe(unlisted.version + 1);
  });
});
