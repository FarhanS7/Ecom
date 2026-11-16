// packages/backend/src/platform/tracer.test.ts - TDD unit tests for OpenTelemetry tracing and W3C context propagation (T071).
import { describe, expect, it } from 'vitest';
import {
  formatTraceparent,
  generateSpanId,
  generateTraceId,
  injectTraceparent,
  parseTraceparent,
  sanitizeSpanAttributes,
  withSpan,
} from './tracer.js';

describe('OpenTelemetry Tracing & W3C TraceContext (T071)', () => {
  describe('parseTraceparent', () => {
    it('successfully parses valid W3C traceparent header', () => {
      const header = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
      const parsed = parseTraceparent(header);

      expect(parsed.valid).toBe(true);
      if (parsed.valid) {
        expect(parsed.version).toBe('00');
        expect(parsed.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
        expect(parsed.spanId).toBe('00f067aa0ba902b7');
        expect(parsed.flags).toBe('01');
        expect(parsed.sampled).toBe(true);
      }
    });

    it('identifies un-sampled traceparent flag (00)', () => {
      const header = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00';
      const parsed = parseTraceparent(header);

      expect(parsed.valid).toBe(true);
      if (parsed.valid) {
        expect(parsed.sampled).toBe(false);
      }
    });

    it('rejects invalid traceparent versions and malformed lengths', () => {
      expect(parseTraceparent('').valid).toBe(false);
      expect(parseTraceparent('not-a-traceparent').valid).toBe(false);
      expect(parseTraceparent('00-short-short-01').valid).toBe(false);
      // All zero trace ID is invalid per W3C spec
      expect(parseTraceparent('00-00000000000000000000000000000000-00f067aa0ba902b7-01').valid).toBe(false);
      // All zero span ID is invalid per W3C spec
      expect(parseTraceparent('00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000000-01').valid).toBe(false);
      // Invalid hex characters
      expect(parseTraceparent('00-4bf92f3577b34da6a3ce929d0e0e473z-00f067aa0ba902b7-01').valid).toBe(false);
    });
  });

  describe('formatTraceparent', () => {
    it('formats W3C traceparent correctly', () => {
      const traceId = '4bf92f3577b34da6a3ce929d0e0e4736';
      const spanId = '00f067aa0ba902b7';
      const formatted = formatTraceparent(traceId, spanId, true);

      expect(formatted).toBe('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');
    });

    it('formats un-sampled traceparent correctly', () => {
      const traceId = '4bf92f3577b34da6a3ce929d0e0e4736';
      const spanId = '00f067aa0ba902b7';
      const formatted = formatTraceparent(traceId, spanId, false);

      expect(formatted).toBe('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00');
    });
  });

  describe('generateTraceId & generateSpanId', () => {
    it('generates 32-character lowercase hex trace ID', () => {
      const traceId = generateTraceId();
      expect(traceId).toMatch(/^[0-9a-f]{32}$/);
      expect(traceId).not.toBe('00000000000000000000000000000000');
    });

    it('generates 16-character lowercase hex span ID', () => {
      const spanId = generateSpanId();
      expect(spanId).toMatch(/^[0-9a-f]{16}$/);
      expect(spanId).not.toBe('0000000000000000');
    });
  });

  describe('injectTraceparent', () => {
    it('injects traceparent header into carrier object', () => {
      const carrier: Record<string, string> = {};
      const traceId = '4bf92f3577b34da6a3ce929d0e0e4736';
      const spanId = '00f067aa0ba902b7';

      injectTraceparent(carrier, traceId, spanId);

      expect(carrier.traceparent).toBe('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');
    });
  });

  describe('sanitizeSpanAttributes', () => {
    it('redacts sensitive headers, tokens, and credentials from attributes', () => {
      const rawAttributes: Record<string, unknown> = {
        'http.method': 'POST',
        'http.route': '/v1/checkout',
        'http.status_code': 200,
        authorization: 'Bearer secret-jwt-token-12345',
        cookie: 'session_id=secret-session-abc',
        'x-api-key': 'live_key_xyz',
        password: 'SuperSecretPassword!',
        'user.id': 'user-123',
        'order.id': 'order-456',
      };

      const sanitized = sanitizeSpanAttributes(rawAttributes);

      expect(sanitized['http.method']).toBe('POST');
      expect(sanitized['http.route']).toBe('/v1/checkout');
      expect(sanitized['http.status_code']).toBe(200);
      expect(sanitized['user.id']).toBe('user-123');
      expect(sanitized['order.id']).toBe('order-456');

      expect(sanitized.authorization).toBe('[REDACTED]');
      expect(sanitized.cookie).toBe('[REDACTED]');
      expect(sanitized['x-api-key']).toBe('[REDACTED]');
      expect(sanitized.password).toBe('[REDACTED]');
    });
  });

  describe('withSpan execution', () => {
    it('executes function inside span and returns result', async () => {
      const result = await withSpan(
        'test-operation',
        async (span) => {
          span.setAttribute('test.key', 'test.value');
          return 42;
        },
        { traceId: '4bf92f3577b34da6a3ce929d0e0e4736' },
      );

      expect(result).toBe(42);
    });

    it('records exception on failure and rethrows error', async () => {
      await expect(
        withSpan('failing-operation', async () => {
          throw new Error('Database connection failed');
        }),
      ).rejects.toThrow('Database connection failed');
    });
  });
});
