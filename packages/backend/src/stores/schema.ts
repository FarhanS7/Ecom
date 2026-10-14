// @shopscale/backend/stores/schema - Drizzle source of truth, stores tables.
// Reviewed SQL in db/migrations/0002-stores.sql is canonical (CHECKS, seeds,
// deletion policy). Invitations/themes/content arrive in T015/T016 and are
// absent here by design.

import {
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
// Stores depends on identity conceptually; SQL owns the real cross-module
// constraints, drizzle only needs the shapes for FK typing. Extensionless:
// drizzle-kit's CJS loader cannot resolve ESM-style `.js` suffixes.
import { permissions, users } from '../identity/schema';

export const businesses = pgTable(
  'businesses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    status: text('status').notNull().default('active'),
    commissionBps: integer('commission_bps').notNull().default(500),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    statusCheck: check('businesses_status_check', sql`${t.status} IN ('active','suspended')`),
  }),
);

export const stores = pgTable(
  'stores',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // UNIQUE enforces D-007 (one store per business) at the boundary.
    businessId: uuid('business_id')
      .notNull()
      .unique()
      .references(() => businesses.id, { onDelete: 'restrict' }),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    status: text('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    statusCheck: check('stores_status_check', sql`${t.status} IN ('pending','active','suspended')`),
  }),
);

export const storeRoles = pgTable('store_roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(),
});

export const storeRolePermissions = pgTable(
  'store_role_permissions',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => storeRoles.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.roleId, t.permissionId] }),
  }),
);

export const storeMemberships = pgTable(
  'store_memberships',
  {
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => storeRoles.id, { onDelete: 'restrict' }),
    status: text('status').notNull().default('active'),
    version: integer('version').notNull().default(1),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.storeId, t.userId] }),
    statusCheck: check('store_memberships_status_check', sql`${t.status} IN ('active','revoked')`),
    userIdx: index('store_memberships_user_id_idx').on(t.userId),
  }),
);

export type BusinessRow = typeof businesses.$inferSelect;
export type StoreRow = typeof stores.$inferSelect;
export type StoreMembershipRow = typeof storeMemberships.$inferSelect;
