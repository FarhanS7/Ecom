// @shopscale/backend/platform/schema - Drizzle source of truth, platform tables.
// audit_logs is append-only; reporting reads it in T066. Cross-module FKs
// (→ users, → stores) live in reviewed SQL per the dependency-free schema
// rule (see stores/schema.ts).

import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

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

export const outbox = pgTable(
  'outbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    aggregateType: text('aggregate_type').notNull(),
    aggregateId: uuid('aggregate_id').notNull(),
    aggregateVersion: integer('aggregate_version').notNull().default(1),
    eventType: text('event_type').notNull(),
    schemaVersion: integer('schema_version').notNull().default(1),
    payload: jsonb('payload').notNull(),
    correlationId: text('correlation_id'),
    causationId: text('causation_id'),
    storeId: uuid('store_id'),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' }),
    leaseUntil: timestamp('lease_until', { withTimezone: true, mode: 'date' }),
    attempts: integer('attempts').notNull().default(0),
  },
  (t) => ({
    unpublishedIdx: index('outbox_unpublished_idx').on(t.createdAt, t.id),
    aggregateIdx: index('outbox_aggregate_idx').on(t.aggregateType, t.aggregateId, t.aggregateVersion),
  }),
);

export type OutboxRow = typeof outbox.$inferSelect;
export type NewOutboxRow = typeof outbox.$inferInsert;

export const webhookEvents = pgTable(
  'webhook_events',
  {
    provider: text('provider').notNull(),
    eventId: text('event_id').notNull(),
    payloadHash: text('payload_hash').notNull(),
    payload: jsonb('payload').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true, mode: 'date' }),
    status: text('status').notNull().default('received'),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.provider, t.eventId] }),
    receivedAtIdx: index('idx_webhook_events_received_at').on(t.receivedAt),
  }),
);

export type WebhookEventRow = typeof webhookEvents.$inferSelect;
export type NewWebhookEventRow = typeof webhookEvents.$inferInsert;

export const featureFlags = pgTable(
  'feature_flags',
  {
    key: text('key').primaryKey(),
    description: text('description'),
    enabled: boolean('enabled').notNull().default(false),
    storeAllowlist: jsonb('store_allowlist').$type<string[]>().notNull().default([]),
    rolloutPercentage: integer('rollout_percentage').notNull().default(0),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    enabledIdx: index('feature_flags_enabled_idx').on(t.enabled),
  }),
);

export type FeatureFlagRow = typeof featureFlags.$inferSelect;
export type NewFeatureFlagRow = typeof featureFlags.$inferInsert;

