# Independent Review: TASK-071 — Trace Requests Through API and Workers

## Review Metadata
- **Task ID**: `TASK-071`
- **Goal**: Instrument OpenTelemetry distributed tracing propagating W3C traceparent context across Fastify HTTP routes, transactional outbox relay, and BullMQ worker consumers.
- **Risk Level**: LOW
- **Requirements Covered**: `G6`, PRD Section 1.2, PRD Section 3, DEC-001
- **Date**: 2026-11-17
- **Status**: APPROVED

---

## 1. Scope & Architecture Inspected

### OpenTelemetry Core Tracing Platform
- `packages/backend/src/platform/tracer.ts`:
  - `parseTraceparent`: Full W3C TraceContext parser validating 4-part hex structure (`00-${traceId}-${spanId}-${flags}`). Enforces non-zero trace ID and span ID constraints according to W3C specifications.
  - `formatTraceparent`: Formats valid W3C traceparent header with sampling flag bitmask.
  - `generateTraceId` & `generateSpanId`: Cryptographically random 32-hex (16 byte) and 16-hex (8 byte) generators ensuring non-zero IDs.
  - `injectTraceparent`: Safely injects `traceparent` into request carriers, outbox metadata, or queue envelopes.
  - `extractTraceContext`: Extracts active `traceparent` (case-insensitively) or generates a new valid root trace context, ensuring zero request failures on missing or invalid headers.
  - `sanitizeSpanAttributes`: Sanitizes and redacts credentials, passwords, tokens, API keys (`api-key`, `api_key`), cookies, and authorization headers (`[REDACTED]`) before they can leak to trace sinks.
  - `withSpan`: Executes asynchronous operations inside an active OpenTelemetry span with automatic error status recording, exception capturing, and guaranteed span termination in a `finally` block.
  - `initTracing` & `shutdownTracing`: Safely bootstraps `@opentelemetry/sdk-node` with auto-instrumentations; automatically no-ops in test mode or when `OTEL_SDK_DISABLED=true`.

### Outbox Envelope & Asynchronous Propagation
- `packages/backend/src/platform/outbox.service.ts`:
  - In `writeOutboxEvent`:
    - Checks for active OpenTelemetry span (`trace.getActiveSpan()`).
    - If `correlationId` is not explicitly set, auto-injects formatted W3C `traceparent` (`00-${traceId}-${spanId}-${flags}`).
    - If `causationId` is not explicitly set, auto-injects current active `spanId`.
    - Wrapped in safe try/catch ensuring that tracing anomalies never impede database writes.

### HTTP Ingestion & Header Propagation
- `apps/api/src/request-id.hook.ts`:
  - In `requestIdHook`:
    - Validates incoming `traceparent` or generates fresh root trace ID.
    - Sets `req.traceId` and `req.traceparent`.
    - Emits both `X-Request-Id` and `traceparent` on the HTTP response headers.
- `apps/api/src/tracing.ts` & `apps/api/src/main.ts`:
  - Bootstraps `initTracing('shopscale-api')` at service startup.
  - Registers graceful shutdown hooks for `SIGTERM` and `SIGINT`.

### Background Worker Job Tracing
- `apps/worker/src/consumers/domain-events.consumer.ts`:
  - In `handleJob`:
    - Extracts `event.correlationId` from `OutboxRecord`.
    - Parses W3C `traceparent` to retrieve the original `traceId` and `parentSpanId`.
    - Runs the domain event projection or dispatch handler inside `withSpan('worker.consumer:${event.eventType}', ..., { traceId, parentSpanId })`.
    - Enriches span with BullMQ messaging attributes (`messaging.system`, `messaging.destination`, `event.aggregate_type`, `event.aggregate_id`).
- `apps/worker/src/tracing.ts` & `apps/worker/src/main.ts`:
  - Bootstraps `initTracing('shopscale-worker')` at worker startup.
  - Closes tracer on worker shutdown.

### Jaeger Compose Configuration
- `compose.telemetry.yml`:
  - Configures `jaegertracing/all-in-one:1.57` with OTLP HTTP (4318), OTLP gRPC (4317), and UI (16686).

---

## 2. Invariant & Performance Verification

1. **Zero Performance Impact on Hot Path**:
   - Tracing operations perform in-memory W3C parsing and bitmask checks.
   - Safe fallbacks ensure zero exceptions escape into request handlers.
   - Redaction regular expressions are pre-compiled static patterns.
2. **Context Continuity**:
   - HTTP request with `traceparent` preserves `traceId` into database `outbox.correlation_id`.
   - BullMQ worker extracts `correlation_id` and executes background projection inside a linked child span with the exact same `traceId`.
3. **Data Protection / Redaction**:
   - All sensitive attributes (`password`, `token`, `secret`, `api-key`, `authorization`, `cookie`) are verified to be replaced with `'[REDACTED]'`.

---

## 3. Test Coverage & Quality Gates

1. **Unit Tests**:
   - `packages/backend/src/platform/tracer.test.ts`:
     - 11 unit tests covering W3C parsing, formatting, random generation, carrier injection, attribute redaction, and `withSpan` execution.
     - **Status**: PASSED (11/11).
   - `apps/api/src/request-id.hook.test.ts`:
     - 3 unit tests verifying header propagation, missing header generation, and invalid request ID rejection.
     - **Status**: PASSED (3/3).
2. **Integration Tests**:
   - `packages/backend/tests/integration/tracing.spec.ts` & `tests/integration/tracing.spec.ts`:
     - 3 integration tests asserting active span trace context capture into outbox records, explicit traceparent preservation, and credential sanitization in PostgreSQL outbox table.
     - **Status**: PASSED.
3. **Monorepo Quality Gates**:
   - `pnpm --filter @shopscale/api test`: 14 test files, 128 tests passing.
   - `pnpm --filter @shopscale/backend test`: 55 test files, 357 tests passing.
   - `pnpm typecheck`: Clean across all 7 workspace packages.
   - `pnpm lint`: Clean across monorepo (0 errors, 0 warnings).
   - `pnpm build`: Clean production builds across Next.js, Fastify NestJS API, and BullMQ Worker.

---

## 4. Findings & Decision

- **Risk Level**: LOW.
- **Review Finding**: Implementation satisfies all requirements for distributed tracing, context propagation across async outbox boundaries, sensitive attribute sanitization, and graceful degradation.
- **Decision**: APPROVED. TASK-071 is ready to be marked COMPLETED.
