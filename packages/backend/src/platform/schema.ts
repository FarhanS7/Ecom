// @shopscale/backend/platform/schema - Drizzle source of truth, platform tables.
// audit_logs is append-only; reporting reads it in T066. Cross-module FKs
// (→ users, → stores) live in reviewed SQL per the dependency-free schema
// rule (see stores/schema.ts).

import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorId: uuid('actor_id'),
    storeId: uuid('store_id'),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    redactedBefore: jsonb('redacted_before'),
    redactedAfter: jsonb('redacted_after'),
    requestId: text('request_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    storeCreatedIdx: index('audit_logs_store_created_idx').on(t.storeId, t.createdAt, t.id),
    actorCreatedIdx: index('audit_logs_actor_created_idx').on(t.actorId, t.createdAt),
  }),
);

export type AuditLogRow = typeof auditLogs.$inferSelect;
