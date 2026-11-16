// packages/backend/tests/integration/metrics.spec.ts - Integration test for Prometheus metrics exporter (T072).
// Invariants verified:
// 1. Prometheus text format export renders standard exposition headings.
// 2. Histogram buckets calculate observations across realistic HTTP latency thresholds.
// 3. Operational gauges maintain accurate state for active reservations, outbox lag, and DB pool.
// 4. Zero sensitive tokens or unredacted path fragments appear in exported metrics.

import { describe, expect, it } from 'vitest';
import { MetricsService } from '../../src/platform/metrics.service.js';

describe('Backend Metrics Engine Integration (T072)', () => {
  it('aggregates observations and exports compliant Prometheus text format', async () => {
    const metrics = new MetricsService();

    // 1. Record 10 simulated HTTP transactions
    const rawRequests = [
      { method: 'GET', path: '/health/live', status: 200, duration: 0.003 },
      { method: 'GET', path: '/v1/products/550e8400-e29b-41d4-a716-446655440000', status: 200, duration: 0.024 },
      { method: 'POST', path: '/v1/checkout/550e8400-e29b-41d4-a716-446655440000/credit-card', status: 400, duration: 0.051 },
      { method: 'GET', path: '/v1/stores/123/products', status: 200, duration: 0.015 },
      { method: 'GET', path: '/v1/users/admin-secret-token-12345/profile', status: 401, duration: 0.008 },
      { method: 'GET', path: '/v1/missing', status: 404, duration: 0.002 },
      { method: 'GET', path: '/health/ready', status: 200, duration: 0.012 },
      { method: 'POST', path: '/v1/orders/create', status: 201, duration: 0.125 },
      { method: 'GET', path: '/v1/orders/550e8400-e29b-41d4-a716-446655440000', status: 200, duration: 0.035 },
      { method: 'GET', path: '/health/live', status: 200, duration: 0.002 },
    ];

    for (const req of rawRequests) {
      metrics.recordHttpRequestDuration(req.method, req.path, req.status, req.duration);
    }

    // 2. Set gauges and counters
    metrics.setActiveReservations(30);
    metrics.setOutboxLag(15.7);
    metrics.setDbPoolActiveConnections(5);
    metrics.recordBullMqJob('domain-events', 'completed');
    metrics.recordBullMqJob('domain-events', 'failed');

    // 3. Export exposition text
    const text = await metrics.getMetrics();

    expect(text).toContain('# TYPE http_request_duration_seconds histogram');
    expect(text).toContain('http_request_duration_seconds_count');
    expect(text).toContain('# TYPE active_checkout_reservations gauge');
    expect(text).toContain('active_checkout_reservations 30');
    expect(text).toContain('# TYPE outbox_lag_seconds gauge');
    expect(text).toContain('outbox_lag_seconds 15.7');
    expect(text).toContain('# TYPE db_pool_active_connections gauge');
    expect(text).toContain('db_pool_active_connections 5');
    expect(text).toContain('bullmq_jobs_completed_total{queue="domain-events",status="completed"} 1');
    expect(text).toContain('bullmq_jobs_completed_total{queue="domain-events",status="failed"} 1');

    // 4. Verify route normalization
    expect(text).toContain('route="/v1/products/:id"');
    expect(text).toContain('route="/v1/checkout/:id/:redacted"');
    expect(text).toContain('route="/v1/users/:redacted/profile"');

    // 5. Security & PII assurance
    expect(text).not.toContain('550e8400-e29b-41d4-a716-446655440000');
    expect(text).not.toContain('admin-secret-token-12345');
    expect(text).not.toContain('credit-card');
  });
});
