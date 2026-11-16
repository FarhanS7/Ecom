// apps/api/tests/integration/feature-flags.spec.ts - HTTP integration tests for FeatureFlagsController (TASK-076).
// Invariants verified:
// 1. GET /v1/feature-flags/:key/evaluate is publicly accessible and returns { key, storeId, enabled: false } by default.
// 2. GET /v1/admin/feature-flags requires authentication (401 without session cookie).
// 3. PUT /v1/admin/feature-flags/:key requires authentication (401 without session cookie).
// 4. GET /v1/admin/feature-flags/:key requires authentication (401 without session cookie).

import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createApp } from '../../src/main.js';

describe('Feature Flags HTTP API (TASK-076)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const created = await createApp();
    app = created.app;
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('evaluates flag state publicly without requiring authentication', async () => {
    const server = app.getHttpAdapter().getInstance();

    const res = await server.inject({
      method: 'GET',
      url: '/v1/feature-flags/express_checkout/evaluate',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toEqual({
      key: 'express_checkout',
      storeId: null,
      enabled: false,
    });
  });

  it('evaluates flag with storeId query parameter', async () => {
    const server = app.getHttpAdapter().getInstance();
    const testStoreId = '11111111-2222-3333-4444-555555555555';

    const res = await server.inject({
      method: 'GET',
      url: `/v1/feature-flags/new_search_indexer/evaluate?storeId=${testStoreId}`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toEqual({
      key: 'new_search_indexer',
      storeId: testStoreId,
      enabled: false,
    });
  });

  it('blocks unauthenticated access to admin endpoints with 401 Unauthorized', async () => {
    const server = app.getHttpAdapter().getInstance();

    const listRes = await server.inject({
      method: 'GET',
      url: '/v1/admin/feature-flags',
    });
    expect(listRes.statusCode).toBe(401);

    const getRes = await server.inject({
      method: 'GET',
      url: '/v1/admin/feature-flags/express_checkout',
    });
    expect(getRes.statusCode).toBe(401);

    const putRes = await server.inject({
      method: 'PUT',
      url: '/v1/admin/feature-flags/express_checkout',
      payload: { enabled: true },
    });
    expect(putRes.statusCode).toBe(401);
  });
});
