// @shopscale/contracts/audit - Privileged mutation audit log schemas (T062).
import { z } from 'zod';

export const auditRecordDtoSchema = z.object({
  id: z.string().uuid(),
  actorId: z.string().uuid().nullable(),
  storeId: z.string().uuid().nullable(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  redactedBefore: z.record(z.unknown()).nullable(),
  redactedAfter: z.record(z.unknown()).nullable(),
  requestId: z.string(),
  createdAt: z.string(),
});
export type AuditRecordDto = z.infer<typeof auditRecordDtoSchema>;

export const paginatedAuditLogsResponseSchema = z.object({
  items: z.array(auditRecordDtoSchema),
  nextCursor: z.string().nullable(),
});
export type PaginatedAuditLogsResponseDto = z.infer<typeof paginatedAuditLogsResponseSchema>;
