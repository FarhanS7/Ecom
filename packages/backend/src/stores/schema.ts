// @shopscale/backend/stores/schema - Drizzle source of truth, stores tables.
// Reviewed SQL in db/migrations/0002-stores.sql is canonical (CHECKS, seeds,
// deletion policy, and ALL cross-module FKs). Invitations/themes/content
// arrive in T015/T016 and are absent here by design.
//
// Cross-module references are deliberately NOT expressed here: drizzle-kit
// 0.20 loads schema through a CJS loader that cannot resolve ESM-style `.js`
// suffixes, while real Node ESM requires them — no single specifier satisfies
// both. Rule (also in db/schema.ts): schema files stay dependency-free;
// cross-module FKs live in reviewed SQL only. The generate-diff still covers
// tables, columns, uniques, indexes, PKs, and same-module FKs.

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

export const businesses = pgTable(
  'businesses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Cross-module FK (→ users.id, ON DELETE RESTRICT) lives in reviewed SQL.
    ownerUserId: uuid('owner_user_id').notNull(),
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
    // Cross-module FK (→ businesses.id, ON DELETE RESTRICT) is same-module
    // here and IS expressed; the users-side FKs below live in reviewed SQL.
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
    // Cross-module FK (→ permissions.id, ON DELETE CASCADE) in reviewed SQL.
    permissionId: uuid('permission_id').notNull(),
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
    // Cross-module FK (→ users.id, ON DELETE CASCADE) in reviewed SQL.
    userId: uuid('user_id').notNull(),
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

export const storeInvitations = pgTable(
  'store_invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    emailNormalized: text('email_normalized').notNull(),
    // Cross-module FK (→ store_roles.id, ON DELETE RESTRICT) in reviewed SQL.
    roleId: uuid('role_id').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    storeIdx: index('store_invitations_store_id_idx').on(t.storeId),
  }),
);

export type StoreInvitationRow = typeof storeInvitations.$inferSelect;
