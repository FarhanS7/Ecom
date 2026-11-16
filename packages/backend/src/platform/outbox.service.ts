// @shopscale/backend/platform/outbox.service - Transactional Outbox pattern (T029).
// Invariant: Outbox records are written in the SAME database transaction as domain mutations.
// Payloads are sanitized to prevent accidental leakage of secrets/credentials into outbox.

import type { Queryable } from '../identity/auth.service.js';
import { trace } from '@opentelemetry/api';
import { formatTraceparent } from './tracer.js';

export class OutboxValidationError extends Error {
  readonly code = 'OUTBOX_VALIDATION_FAILED';
}

export interface DomainEvent<TPayload = unknown> {
  id?: string;
  aggregateType: string;
  aggregateId: string;
  aggregateVersion?: number;
  type: string;
  schemaVersion?: number;
  payload: TPayload;
  correlationId?: string | null;
  causationId?: string | null;
  storeId?: string | null;
  occurredAt?: Date | string;
}

export interface OutboxRecord {
  id: string;
  aggregateType: string;
  aggregateId: string;
  aggregateVersion: number;
  eventType: string;
  schemaVersion: number;
  payload: unknown;
  correlationId: string | null;
  causationId: string | null;
  storeId: string | null;
  occurredAt: Date;
  createdAt: Date;
  publishedAt: Date | null;
  leaseUntil: Date | null;
  attempts: number;
}

const SENSITIVE_KEY_PATTERN = /password|secret|token|cvv|card_number|cardnumber|api_key|apikey|private_key/i;

/**
 * Redact sensitive fields recursively to guarantee no credentials or payment card
 * details enter the immutable outbox and queue logs.
 */
export function sanitizePayload(payload: unknown): unknown {
  if (payload === null || typeof payload !== 'object') {
    return payload;
  }

  if (Array.isArray(payload)) {
    return payload.map(sanitizePayload);
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = sanitizePayload(value);
    }
  }
  return result;
}

export interface OutboxRowDb {
  id: string;
  aggregate_type: string;
  aggregate_id: string;
  aggregate_version: number;
  event_type: string;
  schema_version: number;
  payload: unknown;
  correlation_id: string | null;
  causation_id: string | null;
  store_id: string | null;
  occurred_at: Date;
  created_at: Date;
  published_at: Date | null;
  lease_until: Date | null;
  attempts: number;
}

function toOutboxRecord(row: OutboxRowDb): OutboxRecord {
  return {
    id: row.id,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    aggregateVersion: row.aggregate_version,
    eventType: row.event_type,
    schemaVersion: row.schema_version,
    payload: row.payload,
    correlationId: row.correlation_id,
    causationId: row.causation_id,
    storeId: row.store_id,
    occurredAt: row.occurred_at instanceof Date ? row.occurred_at : new Date(row.occurred_at),
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
    publishedAt: row.published_at ? (row.published_at instanceof Date ? row.published_at : new Date(row.published_at)) : null,
    leaseUntil: row.lease_until ? (row.lease_until instanceof Date ? row.lease_until : new Date(row.lease_until)) : null,
    attempts: Number(row.attempts),
  };
}

/**
 * Write a domain event into the outbox table inside an existing transaction.
 */
export async function writeOutboxEvent(
  tx: Queryable,
  event: DomainEvent,
): Promise<OutboxRecord> {
  if (!event.aggregateType || event.aggregateType.trim() === '') {
    throw new OutboxValidationError('aggregateType is required');
  }
  if (!event.aggregateId || event.aggregateId.trim() === '') {
    throw new OutboxValidationError('aggregateId is required');
  }
  if (!event.type || event.type.trim() === '') {
    throw new OutboxValidationError('type is required');
  }

  // Auto-propagate OpenTelemetry W3C trace context if not explicitly provided
  let correlationId = event.correlationId ?? null;
  let causationId = event.causationId ?? null;

  try {
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      const spanCtx = activeSpan.spanContext();
      if (spanCtx && spanCtx.traceId) {
        if (!correlationId) {
          correlationId = formatTraceparent(
            spanCtx.traceId,
            spanCtx.spanId,
            (spanCtx.traceFlags & 1) === 1,
          );
        }
        if (!causationId) {
          causationId = spanCtx.spanId;
        }
      }
    }
  } catch {
    // Tracing failures must never disrupt outbox event creation
  }

  const sanitized = sanitizePayload(event.payload);
  const jsonPayload = JSON.stringify(sanitized);

  const occurredAt = event.occurredAt
    ? (event.occurredAt instanceof Date ? event.occurredAt.toISOString() : event.occurredAt)
    : null;

  const rows = (await tx.unsafe(
    `INSERT INTO "outbox" (
       "id",
       "aggregate_type",
       "aggregate_id",
       "aggregate_version",
       "event_type",
       "schema_version",
       "payload",
       "correlation_id",
       "causation_id",
       "store_id",
       "occurred_at"
     ) VALUES (
       COALESCE($1::uuid, gen_random_uuid()),
       $2,
       $3::uuid,
       $4,
       $5,
       $6,
       $7::text::jsonb,
       $8,
       $9,
       $10::uuid,
       COALESCE($11::timestamptz, now())
     ) RETURNING
       "id", "aggregate_type", "aggregate_id", "aggregate_version", "event_type",
       "schema_version", "payload", "correlation_id", "causation_id", "store_id",
       "occurred_at", "created_at", "published_at", "lease_until", "attempts";`,
    [
      event.id ?? null,
      event.aggregateType,
      event.aggregateId,
      event.aggregateVersion ?? 1,
      event.type,
      event.schemaVersion ?? 1,
      jsonPayload,
      correlationId,
      causationId,
      event.storeId ?? null,
      occurredAt,
    ],
  )) as unknown as OutboxRowDb[];

  const row = rows[0];
  if (!row) {
    throw new Error('Outbox insert returned no row');
  }

  return toOutboxRecord(row);
}

export interface OutboxWriterPort {
  write(tx: Queryable, event: DomainEvent): Promise<OutboxRecord>;
}

export const outboxWriter: OutboxWriterPort = {
  write: writeOutboxEvent,
};
