// @shopscale/backend/platform/metrics.service - Prometheus metrics engine and telemetry exporter (T072).
// Invariants:
// 1. Strictly bounded label cardinality: URLs are sanitized, query strings removed, and UUIDs collapsed into :id.
// 2. RED metrics: Rate, Errors, Duration tracked for HTTP requests via histogram.
// 3. USE metrics: Active stock reservations, outbox queue lag, and DB pool saturation tracked via gauges.
// 4. Non-blocking: Metric collection failures must never disrupt or degrade HTTP request handling.

import {
  Registry,
  Histogram,
  Gauge,
  Counter,
  collectDefaultMetrics,
} from 'prom-client';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SENSITIVE_SEGMENT_REGEX = /password|secret|token|credit[-_]?card|cvv|card[-_]?number/i;

/**
 * Normalizes an HTTP request path into a bounded route template.
 * Strips query strings, hashes, dynamic UUIDs, and sensitive segment values.
 */
export function normalizeRouteTemplate(rawPath: string): string {
  if (!rawPath) return '/';

  // 1. Strip query string and fragment
  const pathOnly = rawPath.split('?')[0]?.split('#')[0] ?? '/';

  // 2. Split segments and normalize each
  const segments = pathOnly.split('/').filter(Boolean);
  const normalizedSegments = segments.map((segment) => {
    if (UUID_REGEX.test(segment)) {
      return ':id';
    }
    if (/^\d+$/.test(segment)) {
      return ':id';
    }
    if (SENSITIVE_SEGMENT_REGEX.test(segment)) {
      return ':redacted';
    }
    return segment;
  });

  return '/' + normalizedSegments.join('/');
}

/**
 * Maps an HTTP status code into a low-cardinality status class string.
 */
export function deriveStatusClass(statusCode: number): string {
  if (statusCode >= 200 && statusCode < 300) return '2xx';
  if (statusCode >= 300 && statusCode < 400) return '3xx';
  if (statusCode >= 400 && statusCode < 500) return '4xx';
  if (statusCode >= 500 && statusCode < 600) return '5xx';
  return 'unknown';
}

export class MetricsService {
  readonly registry: Registry;
  readonly httpRequestDuration: Histogram<'method' | 'route' | 'status_class'>;
  readonly activeReservations: Gauge;
  readonly outboxLag: Gauge;
  readonly dbPoolActive: Gauge;
  readonly bullmqJobsCompleted: Counter<'queue' | 'status'>;
  readonly crashRecoveryDuration: Gauge;

  constructor(customRegistry?: Registry) {
    this.registry = customRegistry ?? new Registry();

    // Default nodejs/process telemetry
    collectDefaultMetrics({ register: this.registry });

    // HTTP Request Duration Histogram (RED Duration & Rate)
    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds across methods and status classes',
      labelNames: ['method', 'route', 'status_class'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });

    // Active stock reservations Gauge (USE Utilization)
    this.activeReservations = new Gauge({
      name: 'active_checkout_reservations',
      help: 'Current active inventory reservations held by pending checkouts',
      registers: [this.registry],
    });

    // Outbox Queue Lag Gauge (USE Saturation & Latency)
    this.outboxLag = new Gauge({
      name: 'outbox_lag_seconds',
      help: 'Maximum lag in seconds between unpublished outbox events and current time',
      registers: [this.registry],
    });

    // Database Pool Active Connections Gauge (USE Saturation)
    this.dbPoolActive = new Gauge({
      name: 'db_pool_active_connections',
      help: 'Number of active PostgreSQL client connections checked out of the pool',
      registers: [this.registry],
    });

    // BullMQ Background Jobs Completed Counter (RED Rate & Errors)
    this.bullmqJobsCompleted = new Counter({
      name: 'bullmq_jobs_completed_total',
      help: 'Total number of background jobs processed by BullMQ consumers',
      labelNames: ['queue', 'status'],
      registers: [this.registry],
    });

    // Pipeline Crash Recovery Duration Gauge (G5 Observability)
    this.crashRecoveryDuration = new Gauge({
      name: 'crash_recovery_duration_seconds',
      help: 'Time in seconds taken for the order pipeline to recover after a worker process crash',
      registers: [this.registry],
    });
  }

  /**
   * Records an observed HTTP request duration in seconds with cardinality protection.
   */
  recordHttpRequestDuration(
    method: string,
    rawPath: string,
    statusCode: number,
    durationSeconds: number,
  ): void {
    try {
      const route = normalizeRouteTemplate(rawPath);
      const statusClass = deriveStatusClass(statusCode);
      this.httpRequestDuration.observe(
        { method: method.toUpperCase(), route, status_class: statusClass },
        durationSeconds,
      );
    } catch {
      // Metric recording must never throw into request handler
    }
  }

  /**
   * Sets current active inventory reservations.
   */
  setActiveReservations(count: number): void {
    try {
      this.activeReservations.set(count);
    } catch {
      // Non-blocking
    }
  }

  /**
   * Sets outbox lag in seconds.
   */
  setOutboxLag(seconds: number): void {
    try {
      this.outboxLag.set(seconds);
    } catch {
      // Non-blocking
    }
  }

  /**
   * Sets active database pool connection count.
   */
  setDbPoolActiveConnections(count: number): void {
    try {
      this.dbPoolActive.set(count);
    } catch {
      // Non-blocking
    }
  }

  /**
   * Increments BullMQ job completed / failed counter.
   */
  recordBullMqJob(queue: string, status: 'completed' | 'failed'): void {
    try {
      this.bullmqJobsCompleted.inc({ queue, status });
    } catch {
      // Non-blocking
    }
  }

  /**
   * Sets pipeline crash recovery duration in seconds.
   */
  setCrashRecoveryDuration(seconds: number): void {
    try {
      this.crashRecoveryDuration.set(seconds);
    } catch {
      // Non-blocking
    }
  }

  /**
   * Exports metrics in standard Prometheus text exposition format.
   */
  async getMetrics(): Promise<string> {
    return await this.registry.metrics();
  }

  /**
   * Returns Prometheus exposition content type.
   */
  getContentType(): string {
    return this.registry.contentType;
  }
}

export const metricsService = new MetricsService();
