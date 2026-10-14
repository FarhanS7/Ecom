// @shopscale/backend/db/schema - Drizzle schema source of truth.
// Migration SQL in db/migrations/ is generated from this file, then REVIEWED
// by hand before commit. Never run push/sync against shared data.
//
// T003 bootstrap: minimal probe table only. Domain tables arrive in their
// owning tasks (users/stores in T009-T015, catalog in T019, ...). Keeping the
// bootstrap small proves the harness (empty DB -> migrate -> migrate again
// safely) without pre-creating later-module FK targets.

import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * migration_probe proves the migration harness works end to end.
 * Later tasks add their own tables via additive migrations; this table
 * stays as a sentinel for "migrations have run at least once".
 */
export const migrationProbe = pgTable('migration_probe', {
  id: uuid('id').primaryKey().defaultRandom(),
  note: text('note').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
});

export type MigrationProbe = typeof migrationProbe.$inferSelect;
export type NewMigrationProbe = typeof migrationProbe.$inferInsert;
