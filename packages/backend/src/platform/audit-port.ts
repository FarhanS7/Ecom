// @shopscale/backend/platform/audit-port - Privileged-mutation audit writer.
// Every approval, suspension, invitation, role change, and revocation records
// actor/store/action/entity/before/after + request_id. Append-only: no update
// or delete path exists for audit_logs anywhere in the codebase.
// Snapshots are "redacted by shape": the recorded entities (memberships,
// invitations, stores, roles) contain no secrets, so nothing needs stripping;
// if a future entity carries secrets, its recorder must redact explicitly.

import type { Sql } from 'postgres';
import { getDb } from '../db/client.js';

export interface AuditEvent {
  actorId: string | null;
  storeId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  requestId: string;
}

export async function recordAudit(event: AuditEvent, sql: Sql = getDb()): Promise<void> {
  await sql.unsafe(
    `INSERT INTO "audit_logs" ("actor_id","store_id","action","entity_type","entity_id","redacted_before","redacted_after","request_id")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8);`,
    [
      event.actorId,
      event.storeId,
      event.action,
      event.entityType,
      event.entityId,
      event.before ? JSON.stringify(event.before) : null,
      event.after ? JSON.stringify(event.after) : null,
      event.requestId,
    ],
  );
}
