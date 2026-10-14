// @shopscale/backend/db/schema - Drizzle schema source of truth.
// Migration SQL in db/migrations/ is generated from these files, then REVIEWED
// by hand before commit. Never run push/sync against shared data.
//
// T003 bootstrap: minimal probe table only. T009 added identity tables,
// T014 stores tables — via the drizzle config's schema ENTRY ARRAY (one file
// per module, see db/drizzle.config.ts). Schema files stay dependency-free:
// cross-module FKs live in reviewed SQL only, because no single import
// specifier satisfies both drizzle-kit's CJS loader and real Node ESM
// (proven by the T014b openapi crash; recorded in stores/schema.ts).

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
