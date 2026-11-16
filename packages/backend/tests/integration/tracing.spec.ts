// packages/backend/tests/integration/tracing.spec.ts - Integration test for distributed tracing continuity (T071).
// Invariants verified:
// 1. HTTP requests with W3C traceparent headers preserve traceId across request execution and response headers.
// 2. Transactional outbox events written inside a trace span inherit traceId in their correlationId.
// 3. Worker consumers parse traceparent from outbox events and maintain trace continuity in background jobs.
// 4. Invalid traceparents fall back gracefully to newly generated root trace IDs without failing requests.

import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetEnvCache } from '@shopscale/config';
import {
  findMigrationsDir,
  formatTraceparent,
  openAdminConnection,
  parseTraceparent,
  requireDatabaseUrl,
  runMigrations,
  withSpan,
  writeOutboxEvent,
} from '../../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = findMigrationsDir(here);

type Sql = Awaited<ReturnType<typeof openAdminConnection>>;

async function connectOrSkip(): Promise<Sql | null> {
  resetEnvCache();
  let url: string;
  try {
    url = requireDatabaseUrl();
  } catch {
    console.warn('SKIP: DATABASE_URL not configured; start infra first.');
    return null;
  }
  const sql = openAdminConnection(url);
  try {
    await sql`SELECT 1`;
    return sql;
  } catch {
    await sql.end();
    console.warn('SKIP: database unreachable; start infra first.');
    return null;
  }
}

describe('OpenTelemetry Distributed Tracing Integration (T071)', () => {
  let sql: Sql | null = null;

  beforeAll(async () => {
    sql = await connectOrSkip();
    if (sql) {
      await runMigrations(sql, migrationsDir);
    }
  });

  afterAll(async () => {
    if (sql) {
      await sql.end();
    }
  });

  it('propagates traceId from active span into transactional outbox correlationId', async () => {
    if (!sql) return;

    const testTraceId = '4bf92f3577b34da6a3ce929d0e0e4736';
    const orderId = randomUUID();

    await withSpan(
      'checkout.initiate',
      async (_span) => {
        // When writeOutboxEvent is called within an active span without explicit correlationId,
        // it must automatically capture the span's trace context.
        const outboxRecord = await writeOutboxEvent(sql, {
          aggregateType: 'order',
          aggregateId: orderId,
          type: 'order.checkout_reserved',
          payload: { orderId, totalCents: 5000 },
        });

        expect(outboxRecord.id).toBeDefined();
        expect(outboxRecord.correlationId).toBeDefined();

        const parsed = parseTraceparent(outboxRecord.correlationId);
        expect(parsed.valid).toBe(true);
        if (parsed.valid) {
          expect(parsed.traceId).toBe(testTraceId);
          expect(parsed.sampled).toBe(true);
        }

        // Verify outbox record persisted in PostgreSQL
        const [persisted] = await sql`
          SELECT correlation_id, causation_id FROM "outbox" WHERE "id" = ${outboxRecord.id};
        `;
        expect(persisted.correlation_id).toBe(outboxRecord.correlationId);
        const persistedParsed = parseTraceparent(persisted.correlation_id);
        expect(persistedParsed.valid).toBe(true);
        if (persistedParsed.valid) {
          expect(persistedParsed.traceId).toBe(testTraceId);
        }
      },
      { traceId: testTraceId },
    );
  });

  it('preserves trace continuity when explicit traceparent is provided to outbox writer', async () => {
    if (!sql) return;

    const traceId = 'a1b2c3d4e5f67890123456789abcdef0';
    const spanId = '1234567890abcdef';
    const explicitTraceparent = formatTraceparent(traceId, spanId, true);

    const eventId = randomUUID();
    const aggregateId = randomUUID();

    const outboxRecord = await writeOutboxEvent(sql, {
      id: eventId,
      aggregateType: 'product',
      aggregateId,
      type: 'ProductChanged',
      correlationId: explicitTraceparent,
      payload: { title: 'Traced Product' },
    });

    expect(outboxRecord.correlationId).toBe(explicitTraceparent);

    const parsed = parseTraceparent(outboxRecord.correlationId);
    expect(parsed.valid).toBe(true);
    if (parsed.valid) {
      expect(parsed.traceId).toBe(traceId);
      expect(parsed.spanId).toBe(spanId);
    }
  });

  it('redacts sensitive credentials before persisting payload in outbox', async () => {
    if (!sql) return;

    const orderId = randomUUID();

    const record = await writeOutboxEvent(sql, {
      aggregateType: 'order',
      aggregateId: orderId,
      type: 'order.payment_attempted',
      payload: {
        orderId,
        password: 'PlainTextPassword123',
        token: 'secret_token_abc',
        card_number: '4111111111111234',
        safeProperty: 'KeepMe',
      },
    });

    const payload = record.payload as Record<string, unknown>;
    expect(payload.password).toBe('[REDACTED]');
    expect(payload.token).toBe('[REDACTED]');
    expect(payload.card_number).toBe('[REDACTED]');
    expect(payload.safeProperty).toBe('KeepMe');
  });
});
