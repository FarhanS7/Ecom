// @shopscale/backend/platform/audit-port - Privileged-mutation audit writer.
// Every approval, suspension, invitation, role change, and revocation records
// actor/store/action/entity/before/after + request_id. Append-only: no update
// or delete path exists for audit_logs anywhere in the codebase.

import type { Sql } from 'postgres';
import { auditService } from './audit.service.js';

export interface AuditEvent {
  actorId: string | null;
  storeId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  requestId: string;
}

export async function recordAudit(event: AuditEvent, sql?: Sql): Promise<void> {
  await auditService.recordMutation(
    {
      actorId: event.actorId,
      storeId: event.storeId,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId,
      before: event.before,
      after: event.after,
      requestId: event.requestId,
    },
    sql,
  );
}
