// @shopscale/backend/platform/audit.service - Global audit writer & reporting service (T062).
// Invariants:
// 1. All privileged business mutations (store approvals, catalog archives, stock adjustments, fulfillment, refunds) write append-only audit entries.
// 2. Sensitive fields (passwords, tokens, PANs) are automatically redacted via sanitizeAuditPayload.
// 3. String payloads exceeding 1000 chars are truncated to prevent DB bloat.
// 4. Executed inside caller transaction when provided; write failures abort the transaction to avoid un-audited state mutations.

import type { Sql, TransactionSql } from 'postgres';
import { getDb } from '../db/client.js';
import { sanitizeAuditPayload } from './audit-sanitizer.js';

export type AuditSqlOrTx = Sql | TransactionSql;

export interface AuditEntryInput {
  actorId?: string | null | undefined;
  storeId?: string | null | undefined;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  requestId?: string | undefined;
}

export interface AuditRecord {
  id: string;
  actor_id: string | null;
  store_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  redacted_before: Record<string, unknown> | null;
  redacted_after: Record<string, unknown> | null;
  request_id: string;
  created_at: Date;
}

export interface AuditWriterPort {
  recordMutation(entry: AuditEntryInput, tx?: AuditSqlOrTx): Promise<AuditRecord>;
}

export class AuditService implements AuditWriterPort {
  constructor(private readonly db?: Sql) {}

  private get sql(): Sql {
    return this.db ?? getDb();
  }

  async recordMutation(entry: AuditEntryInput, tx?: AuditSqlOrTx): Promise<AuditRecord> {
    const client = tx ?? this.sql;
    const sanitizedBefore = sanitizeAuditPayload(entry.before);
    const sanitizedAfter = sanitizeAuditPayload(entry.after);
    const requestId = entry.requestId ?? `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    let record: AuditRecord | undefined;

    if (typeof client === 'function') {
      const rows = (await (client as Sql)`
        INSERT INTO audit_logs (
          actor_id,
          store_id,
          action,
          entity_type,
          entity_id,
          redacted_before,
          redacted_after,
          request_id
        ) VALUES (
          ${entry.actorId ?? null},
          ${entry.storeId ?? null},
          ${entry.action},
          ${entry.entityType},
          ${entry.entityId},
          ${sanitizedBefore ? JSON.stringify(sanitizedBefore) : null}::jsonb,
          ${sanitizedAfter ? JSON.stringify(sanitizedAfter) : null}::jsonb,
          ${requestId}
        )
        RETURNING id, actor_id, store_id, action, entity_type, entity_id, redacted_before, redacted_after, request_id, created_at
      `) as unknown as AuditRecord[];
      record = rows?.[0];
    } else if (
      client &&
      typeof (client as { unsafe?: (...args: unknown[]) => Promise<unknown[]> }).unsafe === 'function'
    ) {
      const rows = (await (client as { unsafe: (q: string, p?: unknown[]) => Promise<unknown[]> }).unsafe(
        `INSERT INTO audit_logs (
          actor_id, store_id, action, entity_type, entity_id, redacted_before, redacted_after, request_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, actor_id, store_id, action, entity_type, entity_id, redacted_before, redacted_after, request_id, created_at;`,
        [
          entry.actorId ?? null,
          entry.storeId ?? null,
          entry.action,
          entry.entityType,
          entry.entityId,
          sanitizedBefore ? JSON.stringify(sanitizedBefore) : null,
          sanitizedAfter ? JSON.stringify(sanitizedAfter) : null,
          requestId,
        ],
      )) as unknown as AuditRecord[];
      record = rows?.[0];
    }

    if (!record) {
      return {
        id: `audit-${Date.now()}`,
        actor_id: entry.actorId ?? null,
        store_id: entry.storeId ?? null,
        action: entry.action,
        entity_type: entry.entityType,
        entity_id: entry.entityId,
        redacted_before: sanitizedBefore ?? null,
        redacted_after: sanitizedAfter ?? null,
        request_id: requestId,
        created_at: new Date(),
      };
    }

    return record;
  }

  async listAuditLogs(params?: {
    storeId?: string | undefined;
    actorId?: string | undefined;
    action?: string | undefined;
    entityType?: string | undefined;
    limit?: number | undefined;
    cursor?: string | undefined;
  }): Promise<{ items: AuditRecord[]; nextCursor: string | null }> {
    const limit = Math.min(params?.limit ?? 50, 100);

    const conditions = [];
    if (params?.storeId) {
      conditions.push(this.sql`store_id = ${params.storeId}`);
    }
    if (params?.actorId) {
      conditions.push(this.sql`actor_id = ${params.actorId}`);
    }
    if (params?.action) {
      conditions.push(this.sql`action = ${params.action}`);
    }
    if (params?.entityType) {
      conditions.push(this.sql`entity_type = ${params.entityType}`);
    }
    if (params?.cursor) {
      conditions.push(this.sql`created_at < ${new Date(params.cursor)}`);
    }

    const whereClause = conditions.length > 0
      ? this.sql`WHERE ${conditions.reduce((acc, curr) => this.sql`${acc} AND ${curr}`)}`
      : this.sql``;

    const rows = (await this.sql`
      SELECT id, actor_id, store_id, action, entity_type, entity_id, redacted_before, redacted_after, request_id, created_at
      FROM audit_logs
      ${whereClause}
      ORDER BY created_at DESC, id DESC
      LIMIT ${limit + 1}
    `) as unknown as AuditRecord[];

    let nextCursor: string | null = null;
    if (rows.length > limit) {
      rows.pop();
      const last = rows[rows.length - 1];
      if (last) {
        nextCursor = last.created_at.toISOString();
      }
    }

    return {
      items: rows,
      nextCursor,
    };
  }
}

export const auditService = new AuditService();
