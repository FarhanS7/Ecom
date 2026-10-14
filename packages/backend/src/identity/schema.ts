// @shopscale/backend/identity/schema - Drizzle source of truth, identity tables.
// Reviewed SQL lives in db/migrations/0001-identity.sql (canonical for
// constraints/seed data); this file mirrors structure for generate-diff
// verification (`pnpm db:generate` must not propose table/constraint changes,
// only formatting). SQL-owned by design: status/purpose CHECKs (generate:pg
// 0.20 silently drops check() — verified in the T009 diff), the refresh
// self-FK (drizzle-orm 0.30 cannot express it without a type cycle), and seed
// rows (migrations carry data, schemas carry shape).
//
// Conventions: UUID PKs (gen_random_uuid), timestamptz UTC, normalized email
// stored once (app lowercases+trims before write), token HASHES only — raw
// refresh/reset tokens never touch these tables (proven T009 tests).

import {
  check,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    emailNormalized: text('email_normalized').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    status: text('status').notNull().default('pending_verification'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    statusCheck: check('users_status_check', sql`${t.status} IN ('active','suspended','pending_verification')`),
  }),
);

export const platformRoles = pgTable('platform_roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(),
});

export const permissions = pgTable('permissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(),
});

export const platformRolePermissions = pgTable(
  'platform_role_permissions',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => platformRoles.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.roleId, t.permissionId] }),
  }),
);

export const userPlatformRoles = pgTable(
  'user_platform_roles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => platformRoles.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.roleId] }),
  }),
);

export const sessionFamilies = pgTable(
  'session_families',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // RESTRICT: families anchor session audit; users with history are
    // disabled, never deleted (account deletion is out of demo scope).
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('session_families_user_id_idx').on(t.userId),
  }),
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    familyId: uuid('family_id')
      .notNull()
      .references(() => sessionFamilies.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    usedAt: timestamp('used_at', { withTimezone: true, mode: 'date' }),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    // Plain column: the self-FK (ON DELETE SET NULL) lives in reviewed SQL;
    // drizzle-orm 0.30 cannot express it without a type-inference cycle.
    replacementId: uuid('replacement_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    familyIdx: index('refresh_tokens_family_id_idx').on(t.familyId),
  }),
);

export const identityTokens = pgTable(
  'identity_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Ephemeral proofs (reset/verification): cascade is safe, families stay.
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: text('purpose').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    purposeCheck: check('identity_tokens_purpose_check', sql`${t.purpose} IN ('reset','verification')`),
    userIdx: index('identity_tokens_user_id_idx').on(t.userId),
  }),
);

export const addresses = pgTable(
  'addresses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Cross-module FK (→ users.id, ON DELETE CASCADE) lives in reviewed SQL.
    userId: uuid('user_id').notNull(),
    fields: jsonb('fields').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('addresses_user_id_idx').on(t.userId),
  }),
);

export type UserRow = typeof users.$inferSelect;
export type SessionFamilyRow = typeof sessionFamilies.$inferSelect;
export type RefreshTokenRow = typeof refreshTokens.$inferSelect;
export type IdentityTokenRow = typeof identityTokens.$inferSelect;
export type AddressRow = typeof addresses.$inferSelect;
