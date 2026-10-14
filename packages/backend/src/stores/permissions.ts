// @shopscale/backend/stores/permissions - Store-scoped authorization policy.
// The grant table below MIRRORS the 0002-stores.sql seed row for row; the
// unit suite asserts they never drift (owner ⊇ all, editor ∩ fulfill ∅).
// authorizeStore() is the single runtime gate: ACTIVE membership + granting
// role, evaluated live per request — never from JWT claims, never cached
// across membership changes (stores spec). Platform-admin bypass is a T018
// matrix concern and does NOT live here.

import type { Sql } from 'postgres';
import { getDb } from '../db/client.js';

export const STORE_PERMISSIONS = [
  'catalog:manage',
  'fulfillment:manage',
  'team:manage',
  'store:manage',
  'reports:read',
] as const;

export type StorePermission = (typeof STORE_PERMISSIONS)[number];

export const STORE_ROLES = ['owner', 'manager', 'catalog-editor', 'fulfillment'] as const;

export type StoreRole = (typeof STORE_ROLES)[number];

export const STORE_ROLE_GRANTS: Record<StoreRole, readonly StorePermission[]> = {
  owner: ['catalog:manage', 'fulfillment:manage', 'team:manage', 'store:manage', 'reports:read'],
  manager: ['catalog:manage', 'fulfillment:manage', 'team:manage', 'reports:read'],
  'catalog-editor': ['catalog:manage'],
  fulfillment: ['fulfillment:manage'],
};

export function roleGrants(role: string): readonly StorePermission[] {
  return (STORE_ROLE_GRANTS as Record<string, readonly StorePermission[]>)[role] ?? [];
}

export interface StoreMembership {
  storeId: string;
  userId: string;
  role: string;
  status: string;
}

/**
 * Scoped capability check: true only for an ACTIVE membership whose role
 * grants the permission. Unknown stores, users, and roles deny. No caching:
 * revocation takes effect on the very next call (proven T014b over HTTP).
 */
export async function authorizeStore(
  input: { userId: string; storeId: string; permission: StorePermission },
  sql: Sql = getDb(),
): Promise<boolean> {
  const rows = (await sql.unsafe(
    `SELECT m."status", r."key" AS role
     FROM "store_memberships" m JOIN "store_roles" r ON r."id" = m."role_id"
     WHERE m."store_id" = $1 AND m."user_id" = $2;`,
    [input.storeId, input.userId],
  )) as unknown as Array<{ status: string; role: string }>;
  const membership = rows[0];
  if (!membership || membership.status !== 'active') return false;
  return roleGrants(membership.role).includes(input.permission);
}

/** Active memberships for UI/policy reads (never used for authorization). */
export async function listActiveMemberships(
  userId: string,
  sql: Sql = getDb(),
): Promise<StoreMembership[]> {
  const rows = (await sql.unsafe(
    `SELECT m."store_id" AS "storeId", m."user_id" AS "userId", r."key" AS role, m."status" AS status
     FROM "store_memberships" m JOIN "store_roles" r ON r."id" = m."role_id"
     WHERE m."user_id" = $1 AND m."status" = 'active';`,
    [userId],
  )) as unknown as StoreMembership[];
  return rows;
}
