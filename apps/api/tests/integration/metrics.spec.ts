// apps/api/tests/integration/metrics.spec.ts - Integration test for Prometheus metrics exporter (T072).
// Invariants verified:
// 1. GET /metrics returns 200 OK with Prometheus exposition content-type.
// 2. HTTP request duration histograms record traffic rates and latency across status classes.
// 3. Dynamic UUIDs and numbers are normalized to :id to prevent label cardinality explosion.
// 4. Sensitive URL segments are redacted to :redacted and query parameters stripped.
// 5. Zero customer PII or auth secrets leak into metric label values.
// 6. USE gauges (reservations, outbox lag, db connections) and BullMQ job counters render accurately.

import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { metricsService } from '@shopscale/backend';
import { createApp } from '../../src/main.js';

describe('Prometheus Metrics Exporter (T072)', () => {
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

  it('records HTTP requests and serves Prometheus metrics at /metrics with cardinality protection', async () => {
    const server = app.getHttpAdapter().getInstance();
    const sensitiveToken = 'secret-token-live-xyz-98765';
    const dynamicUuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

    // 1. Execute at least 10 HTTP requests across various endpoints, status codes, and paths
    const requests = [
      { method: 'GET', url: '/health/live' },
      { method: 'GET', url: '/health/live' },
      { method: 'GET', url: '/health/live' },
      { method: 'GET', url: `/v1/products/${dynamicUuid}` },
      { method: 'GET', url: `/v1/products/${dynamicUuid}?sort=desc&limit=50` },
      { method: 'GET', url: `/v1/checkout/${dynamicUuid}/${sensitiveToken}` },
      { method: 'GET', url: '/v1/nonexistent-route-for-metrics-test' },
      { method: 'GET', url: '/v1/another-missing-path-12345' },
      { method: 'GET', url: '/health/ready' },
      { method: 'GET', url: '/health/live' },
    ];

    for (const req of requests) {
      await server.inject(req);
    }

    // 2. Update operational gauges and background counters
    metricsService.setActiveReservations(17);
    metricsService.setOutboxLag(8.5);
    metricsService.setDbPoolActiveConnections(4);
    metricsService.recordBullMqJob('domain-events', 'completed');
    metricsService.recordBullMqJob('inventory-expiry', 'failed');

    // 3. Scrape GET /metrics
    const res = await server.inject({ method: 'GET', url: '/metrics' });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');

    const body = res.payload;

    // 4. Verify presence of required metric keys
    expect(body).toContain('# TYPE http_request_duration_seconds histogram');
    expect(body).toContain('http_request_duration_seconds_bucket');
    expect(body).toContain('http_request_duration_seconds_count');
    expect(body).toContain('# TYPE active_checkout_reservations gauge');
    expect(body).toContain('active_checkout_reservations 17');
    expect(body).toContain('# TYPE outbox_lag_seconds gauge');
    expect(body).toContain('outbox_lag_seconds 8.5');
    expect(body).toContain('# TYPE db_pool_active_connections gauge');
    expect(body).toContain('db_pool_active_connections 4');
    expect(body).toContain('# TYPE bullmq_jobs_completed_total counter');
    expect(body).toContain('bullmq_jobs_completed_total{queue="domain-events",status="completed"}');
    expect(body).toContain('bullmq_jobs_completed_total{queue="inventory-expiry",status="failed"}');

    // 5. Verify route normalization and cardinality safety
    expect(body).toContain('route="/health/live"');
    expect(body).toContain('route="/v1/products/:id"');
    expect(body).toContain('route="/v1/checkout/:id/:redacted"');

    // 6. Security / Regression assertion: Assert metrics output contains zero customer PII or token values
    expect(body).not.toContain(sensitiveToken);
    expect(body).not.toContain(dynamicUuid);
    expect(body).not.toContain('sort=desc');
    expect(body).not.toContain('limit=50');
  });
});
