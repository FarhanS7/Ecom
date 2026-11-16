// packages/backend/src/platform/metrics.service.test.ts - TDD unit tests for Prometheus MetricsService (T072).
import { beforeEach, describe, expect, it } from 'vitest';
import {
  MetricsService,
  deriveStatusClass,
  normalizeRouteTemplate,
} from './metrics.service.js';

describe('Prometheus MetricsService (T072)', () => {
  let metricsService: MetricsService;

  beforeEach(() => {
    metricsService = new MetricsService();
  });

  describe('normalizeRouteTemplate', () => {
    it('normalizes UUID path segments to :id', () => {
      const path = '/v1/orders/123e4567-e89b-12d3-a456-426614174000';
      expect(normalizeRouteTemplate(path)).toBe('/v1/orders/:id');
    });

    it('normalizes multiple UUIDs in nested paths', () => {
      const path =
        '/v1/stores/123e4567-e89b-12d3-a456-426614174001/products/123e4567-e89b-12d3-a456-426614174002';
      expect(normalizeRouteTemplate(path)).toBe('/v1/stores/:id/products/:id');
    });

    it('strips query strings and hashes from paths', () => {
      const path = '/v1/products?category=electronics&sort=price_desc#section';
      expect(normalizeRouteTemplate(path)).toBe('/v1/products');
    });

    it('preserves static routes', () => {
      expect(normalizeRouteTemplate('/v1/checkout')).toBe('/v1/checkout');
      expect(normalizeRouteTemplate('/health/live')).toBe('/health/live');
      expect(normalizeRouteTemplate('/metrics')).toBe('/metrics');
    });
  });

  describe('deriveStatusClass', () => {
    it('maps HTTP status codes to standard class labels', () => {
      expect(deriveStatusClass(200)).toBe('2xx');
      expect(deriveStatusClass(201)).toBe('2xx');
      expect(deriveStatusClass(204)).toBe('2xx');
      expect(deriveStatusClass(301)).toBe('3xx');
      expect(deriveStatusClass(400)).toBe('4xx');
      expect(deriveStatusClass(404)).toBe('4xx');
      expect(deriveStatusClass(422)).toBe('4xx');
      expect(deriveStatusClass(500)).toBe('5xx');
      expect(deriveStatusClass(503)).toBe('5xx');
      expect(deriveStatusClass(0)).toBe('unknown');
    });
  });

  describe('Metrics Collection & Export', () => {
    it('records HTTP request duration histogram with normalized labels', async () => {
      metricsService.recordHttpRequestDuration(
        'POST',
        '/v1/orders/123e4567-e89b-12d3-a456-426614174000?utm=test',
        201,
        0.045, // 45ms
      );

      const output = await metricsService.getMetrics();
      expect(output).toContain('http_request_duration_seconds_bucket');
      expect(output).toContain('method="POST"');
      expect(output).toContain('route="/v1/orders/:id"');
      expect(output).toContain('status_class="2xx"');
    });

    it('updates active reservations gauge', async () => {
      metricsService.setActiveReservations(42);

      const output = await metricsService.getMetrics();
      expect(output).toContain('# HELP active_checkout_reservations');
      expect(output).toContain('# TYPE active_checkout_reservations gauge');
      expect(output).toContain('active_checkout_reservations 42');
    });

    it('updates outbox lag gauge', async () => {
      metricsService.setOutboxLag(12.5);

      const output = await metricsService.getMetrics();
      expect(output).toContain('# HELP outbox_lag_seconds');
      expect(output).toContain('# TYPE outbox_lag_seconds gauge');
      expect(output).toContain('outbox_lag_seconds 12.5');
    });

    it('updates db pool active connections gauge', async () => {
      metricsService.setDbPoolActiveConnections(7);

      const output = await metricsService.getMetrics();
      expect(output).toContain('# HELP db_pool_active_connections');
      expect(output).toContain('# TYPE db_pool_active_connections gauge');
      expect(output).toContain('db_pool_active_connections 7');
    });

    it('increments BullMQ job completed counter', async () => {
      metricsService.recordBullMqJob('domain-events', 'completed');
      metricsService.recordBullMqJob('domain-events', 'failed');

      const output = await metricsService.getMetrics();
      expect(output).toContain('# HELP bullmq_jobs_completed_total');
      expect(output).toContain('bullmq_jobs_completed_total{queue="domain-events",status="completed"} 1');
      expect(output).toContain('bullmq_jobs_completed_total{queue="domain-events",status="failed"} 1');
    });

    it('returns standard Prometheus content type', () => {
      const contentType = metricsService.getContentType();
      expect(contentType).toContain('text/plain');
      expect(contentType).toContain('version=0.0.4');
    });

    it('excludes customer PII or token values from metrics output', async () => {
      metricsService.recordHttpRequestDuration(
        'POST',
        '/v1/checkout/user-secret-12345/credit-card',
        200,
        0.1,
      );

      const output = await metricsService.getMetrics();
      expect(output).not.toContain('secret');
      expect(output).not.toContain('password');
      expect(output).not.toContain('token');
      expect(output).not.toContain('credit-card');
    });
  });
});
