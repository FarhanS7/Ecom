// @shopscale/backend/platform/tracer - OpenTelemetry distributed tracing and W3C context propagation (T071).
// Invariants:
// 1. W3C TraceContext compliant: traceparent format 00-{traceId}-{spanId}-{flags}.
// 2. Sensitive attributes redacted: credentials, auth tokens, and cookies never leak into trace backends.
// 3. Graceful degradation: tracing failures must never disrupt or crash core business operations.
// 4. Trace IDs propagate seamlessly across HTTP boundaries, transactional outbox, and BullMQ workers.

import { randomBytes } from 'node:crypto';
import { trace, context, SpanStatusCode, type Span as OtelSpan } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

export const TRACEPARENT_HEADER = 'traceparent';
export const TRACESTATE_HEADER = 'tracestate';

const SENSITIVE_KEY_PATTERN =
  /password|secret|token|cvv|card[-_]?number|cardnumber|api[-_]?key|apikey|authorization|cookie|set[-_]?cookie/i;

const W3C_TRACEPARENT_REGEX = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i;

export interface ValidTraceparent {
  valid: true;
  version: string;
  traceId: string;
  spanId: string;
  flags: string;
  sampled: boolean;
}

export interface InvalidTraceparent {
  valid: false;
}

export type ParsedTraceparent = ValidTraceparent | InvalidTraceparent;

export interface SpanShim {
  traceId: string;
  spanId: string;
  setAttribute(key: string, value: unknown): this;
  setAttributes(attributes: Record<string, unknown>): this;
  setStatus(status: { code: 'OK' | 'ERROR'; message?: string }): this;
  recordException(err: unknown): this;
  end(): void;
}

export interface SpanOptions {
  traceId?: string | undefined;
  parentSpanId?: string | undefined;
  attributes?: Record<string, unknown> | undefined;
}

/**
 * Validates and parses a W3C traceparent header.
 */
export function parseTraceparent(header?: string | null): ParsedTraceparent {
  if (!header || typeof header !== 'string') {
    return { valid: false };
  }

  const match = header.trim().match(W3C_TRACEPARENT_REGEX);
  if (!match) {
    return { valid: false };
  }

  const [, version, traceId, spanId, flags] = match;
  if (!version || !traceId || !spanId || !flags) {
    return { valid: false };
  }

  // W3C spec forbids all-zero IDs
  if (traceId === '00000000000000000000000000000000') {
    return { valid: false };
  }
  if (spanId === '0000000000000000') {
    return { valid: false };
  }

  const sampled = (parseInt(flags, 16) & 1) === 1;

  return {
    valid: true,
    version,
    traceId: traceId.toLowerCase(),
    spanId: spanId.toLowerCase(),
    flags,
    sampled,
  };
}

/**
 * Formats trace parameters into standard W3C traceparent string.
 */
export function formatTraceparent(traceId: string, spanId: string, sampled = true): string {
  const flags = sampled ? '01' : '00';
  return `00-${traceId.toLowerCase()}-${spanId.toLowerCase()}-${flags}`;
}

/**
 * Generates a standard 32-character hexadecimal trace ID (16 bytes).
 */
export function generateTraceId(): string {
  let id = randomBytes(16).toString('hex');
  while (id === '00000000000000000000000000000000') {
    id = randomBytes(16).toString('hex');
  }
  return id;
}

/**
 * Generates a standard 16-character hexadecimal span ID (8 bytes).
 */
export function generateSpanId(): string {
  let id = randomBytes(8).toString('hex');
  while (id === '0000000000000000') {
    id = randomBytes(8).toString('hex');
  }
  return id;
}

/**
 * Injects W3C traceparent header into a carrier object.
 */
export function injectTraceparent(
  carrier: Record<string, string | undefined>,
  traceId: string,
  spanId: string,
  sampled = true,
): void {
  if (carrier && typeof carrier === 'object') {
    carrier[TRACEPARENT_HEADER] = formatTraceparent(traceId, spanId, sampled);
  }
}

/**
 * Extracts or initializes trace context from HTTP headers or message metadata.
 */
export function extractTraceContext(headers: Record<string, string | string[] | undefined>): {
  traceId: string;
  spanId: string;
  traceparent: string;
  sampled: boolean;
} {
  const traceparentHeader =
    (headers['traceparent'] as string) ||
    (headers['Traceparent'] as string) ||
    (headers['TRACEPARENT'] as string);

  const parsed = parseTraceparent(traceparentHeader);
  if (parsed.valid) {
    return {
      traceId: parsed.traceId,
      spanId: parsed.spanId,
      traceparent: formatTraceparent(parsed.traceId, parsed.spanId, parsed.sampled),
      sampled: parsed.sampled,
    };
  }

  // Generate fresh root trace
  const traceId = generateTraceId();
  const spanId = generateSpanId();
  return {
    traceId,
    spanId,
    traceparent: formatTraceparent(traceId, spanId, true),
    sampled: true,
  };
}

/**
 * Redacts passwords, authorization tokens, cookies, and api keys from span attributes.
 */
export function sanitizeSpanAttributes(
  attributes?: Record<string, unknown>,
): Record<string, unknown> {
  if (!attributes || typeof attributes !== 'object') {
    return {};
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Runs an asynchronous unit of work inside an OpenTelemetry span.
 * Guarantees exception capture, status updates, and safe termination.
 */
export async function withSpan<T>(
  name: string,
  fn: (span: SpanShim) => Promise<T>,
  options?: SpanOptions,
): Promise<T> {
  const tracer = trace.getTracer('shopscale');
  const traceId = options?.traceId ?? generateTraceId();
  const spanId = generateSpanId();

  // Create real OpenTelemetry span if tracer is active
  const otelSpan: OtelSpan = tracer.startSpan(name, {
    attributes: sanitizeSpanAttributes(options?.attributes),
  });

  const shim: SpanShim = {
    traceId,
    spanId,
    setAttribute(key: string, value: unknown) {
      if (!SENSITIVE_KEY_PATTERN.test(key)) {
        otelSpan.setAttribute(key, value);
      } else {
        otelSpan.setAttribute(key, '[REDACTED]');
      }
      return this;
    },
    setAttributes(attributes: Record<string, unknown>) {
      const sanitized = sanitizeSpanAttributes(attributes);
      for (const [k, v] of Object.entries(sanitized)) {
        otelSpan.setAttribute(k, v);
      }
      return this;
    },
    setStatus(status) {
      if (status.message) {
        otelSpan.setStatus({
          code: status.code === 'OK' ? SpanStatusCode.OK : SpanStatusCode.ERROR,
          message: status.message,
        });
      } else {
        otelSpan.setStatus({
          code: status.code === 'OK' ? SpanStatusCode.OK : SpanStatusCode.ERROR,
        });
      }
      return this;
    },
    recordException(err) {
      if (err instanceof Error) {
        otelSpan.recordException(err);
      }
      return this;
    },
    end() {
      otelSpan.end();
    },
  };

  try {
    const result = await context.with(trace.setSpan(context.active(), otelSpan), () => fn(shim));
    otelSpan.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (err) {
    otelSpan.setStatus({
      code: SpanStatusCode.ERROR,
      message: err instanceof Error ? err.message : String(err),
    });
    if (err instanceof Error) {
      otelSpan.recordException(err);
    }
    throw err;
  } finally {
    otelSpan.end();
  }
}

let activeSdk: NodeSDK | null = null;

/**
 * Initializes OpenTelemetry NodeSDK with auto-instrumentations.
 * Safe no-op in test environments or when OTEL_SDK_DISABLED=true.
 */
export function initTracing(serviceName = 'shopscale'): NodeSDK | null {
  const disabled =
    process.env['OTEL_SDK_DISABLED'] === 'true' || process.env['NODE_ENV'] === 'test';
  if (disabled) {
    return null;
  }

  if (activeSdk) {
    return activeSdk;
  }

  try {
    activeSdk = new NodeSDK({
      serviceName,
      instrumentations: [
        getNodeAutoInstrumentations({
          '@opentelemetry/instrumentation-fs': { enabled: false },
        }),
      ],
    });

    activeSdk.start();
    console.log(`[OpenTelemetry] Tracing initialized for ${serviceName}`);
    return activeSdk;
  } catch (err) {
    console.warn('[OpenTelemetry] Failed to initialize tracing SDK:', err);
    return null;
  }
}

/**
 * Gracefully shuts down active OpenTelemetry SDK.
 */
export async function shutdownTracing(): Promise<void> {
  if (activeSdk) {
    try {
      await activeSdk.shutdown();
      console.log('[OpenTelemetry] Tracing shut down cleanly.');
    } catch (err) {
      console.error('[OpenTelemetry] Error shutting down tracing:', err);
    }
    activeSdk = null;
  }
}
