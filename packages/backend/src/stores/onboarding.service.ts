// @shopscale/backend/stores/onboarding.service - Seller applications,
// approval/suspension, staff invitations, and member updates (T015a).
// Every privileged mutation records an audit row in the SAME transaction.
// Scope rule: the actor's membership in the TARGET store gates everything —
// cross-store attempts collapse to generic NOT_FOUND (no oracle), exactly
// like the T014b membership read.

import { randomBytes } from 'node:crypto';
import type { Sql } from 'postgres';
import { getDb } from '../db/client.js';
import { normalizeEmail, sha256Hex } from '../identity/auth.service.js';
import type { TxClient } from '../identity/auth.service.js';
import { authorizeStore } from './permissions.js';
import { recordAudit } from '../platform/audit-port.js';
import type { StorePermission, StoreRole } from './permissions.js';

export type OnboardingFailure = 'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT';

export class OnboardingError extends Error {
  readonly failure: OnboardingFailure;

  constructor(failure: OnboardingFailure, message: string) {
    super(message);
    this.failure = failure;
  }
}

const VALID_ROLES: readonly string[] = ['owner', 'manager', 'catalog-editor', 'fulfillment'];

async function roleId(tx: TxClient, role: string): Promise<string> {
  const rows = (await tx.unsafe(`SELECT "id" FROM "store_roles" WHERE "key" = $1;`, [role])) as unknown as Array<{
    id: string;
  }>;
  const row = rows[0];
  if (!row) throw new Error(`Unknown store role (contract enum must prevent this): ${role}`);
  return row.id;
}

/** Platform-admin gate for admin routes (reused by T018 matrix work). */
export async function requirePlatformAdmin(sql: Sql = getDb(), userId: string): Promise<void> {
  const rows = (await sql.unsafe(
    `SELECT 1 FROM "user_platform_roles" ur JOIN "platform_roles" r ON r."id" = ur."role_id" WHERE ur."user_id" = $1 AND r."key" = 'admin';`,
    [userId],
  )) as unknown as Array<unknown>;
  if (rows.length === 0) {
    throw new OnboardingError('FORBIDDEN', 'Platform admin access required.');
  }
}

/** Guard: refusing to leave a store with zero active owners. */
export async function assertNotLastOwner(
  tx: TxClient,
  input: { storeId: string; excludingUserId: string },
): Promise<void> {
  const rows = (await tx.unsafe(
    `SELECT count(*)::int AS n FROM "store_memberships" m JOIN "store_roles" r ON r."id" = m."role_id"
     WHERE m."store_id" = $1 AND m."status" = 'active' AND r."key" = 'owner' AND m."user_id" != $2;`,
    [input.storeId, input.excludingUserId],
  )) as unknown as Array<{ n: number }>;
  if ((rows[0]?.n ?? 0) === 0) {
    throw new OnboardingError('CONFLICT', 'A store must keep at least one active owner.');
  }
}

/**
 * Apply for a storefront: one business + pending store + owner membership.
 * Demo rule (documented): one business per user — a second application gets
 * 409. Multiple businesses per user belong to the production roadmap.
 */
export async function applyForStore(
  input: { userId: string; slug: string; name: string; requestId: string },
  sql: Sql = getDb(),
): Promise<{ businessId: string; storeId: string; status: string }> {
  return sql.begin(async (tx: TxClient) => {
    const existing = (await tx.unsafe(`SELECT "id" FROM "businesses" WHERE "owner_user_id" = $1;`, [
      input.userId,
    ])) as unknown as Array<{ id: string }>;
    if (existing.length > 0) {
      throw new OnboardingError('CONFLICT', 'This account already owns a business.');
    }
    const slugTaken = (await tx.unsafe(`SELECT "id" FROM "stores" WHERE "slug" = $1;`, [input.slug])) as unknown as Array<{
      id: string;
    }>;
    if (slugTaken.length > 0) {
      throw new OnboardingError('CONFLICT', 'This store address is taken.');
    }
    const biz = (await tx.unsafe(`INSERT INTO "businesses" ("owner_user_id") VALUES ($1) RETURNING "id";`, [
      input.userId,
    ])) as unknown as Array<{ id: string }>;
    const businessId = biz[0]?.id;
    if (!businessId) throw new Error('Business insert returned no row.');
    const store = (await tx.unsafe(
      `INSERT INTO "stores" ("business_id","slug","name","status") VALUES ($1,$2,$3,'pending') RETURNING "id","status";`,
      [businessId, input.slug, input.name],
    )) as unknown as Array<{ id: string; status: string }>;
    const storeRow = store[0];
    if (!storeRow) throw new Error('Store insert returned no row.');
    await tx.unsafe(
      `INSERT INTO "store_memberships" ("store_id","user_id","role_id") SELECT $1, $2, "id" FROM "store_roles" WHERE "key" = 'owner';`,
      [storeRow.id, input.userId],
    );
    await recordAudit(
      {
        actorId: input.userId,
        storeId: storeRow.id,
        action: 'store.applied',
        entityType: 'store',
        entityId: storeRow.id,
        before: null,
        after: { slug: input.slug, status: 'pending' },
        requestId: input.requestId,
      },
      tx as unknown as Sql,
    );
    return { businessId, storeId: storeRow.id, status: storeRow.status };
  });
}

async function transitionStore(
  tx: TxClient,
  input: { storeId: string; actorId: string; requestId: string; from: string; to: string; action: string },
): Promise<{ storeId: string; status: string }> {
  const rows = (await tx.unsafe(`SELECT "id","status" FROM "stores" WHERE "id" = $1 FOR UPDATE;`, [
    input.storeId,
  ])) as unknown as Array<{ id: string; status: string }>;
  const store = rows[0];
  if (!store) throw new OnboardingError('NOT_FOUND', 'Store not found.');
  if (store.status !== input.from) {
    throw new OnboardingError('CONFLICT', `Only ${input.from} stores can move to ${input.to}.`);
  }
  await tx.unsafe(`UPDATE "stores" SET "status" = $1 WHERE "id" = $2;`, [input.to, input.storeId]);
  await recordAudit(
    {
      actorId: input.actorId,
      storeId: input.storeId,
      action: input.action,
      entityType: 'store',
      entityId: input.storeId,
      before: { status: store.status },
      after: { status: input.to },
      requestId: input.requestId,
    },
    tx as unknown as Sql,
  );
  return { storeId: input.storeId, status: input.to };
}

export async function approveStore(
  input: { storeId: string; actorId: string; requestId: string },
  sql: Sql = getDb(),
): Promise<{ storeId: string; status: string }> {
  await requirePlatformAdmin(sql, input.actorId);
  return sql.begin((tx: TxClient) =>
    transitionStore(tx, { ...input, from: 'pending', to: 'active', action: 'store.approved' }),
  );
}

export async function suspendStore(
  input: { storeId: string; actorId: string; requestId: string },
  sql: Sql = getDb(),
): Promise<{ storeId: string; status: string }> {
  await requirePlatformAdmin(sql, input.actorId);
  return sql.begin((tx: TxClient) =>
    transitionStore(tx, { ...input, from: 'active', to: 'suspended', action: 'store.suspended' }),
  );
}

export interface InvitationIssue {
  invitationId: string;
  storeId: string;
  email: string;
  role: string;
  expiresAt: string;
  /** Raw token: demo handoff to the invitee (no email provider yet). */
  token: string;
}

/**
 * Invite staff: inviter needs team:manage IN THE TARGET STORE (cross-store
 * attempts see generic NOT_FOUND). Pending-dedupe is enforced by the partial
 * unique index; races collapse to 23505 → CONFLICT.
 */
export async function inviteMember(
  input: { storeId: string; actorId: string; email: string; role: StoreRole; requestId: string },
  sql: Sql = getDb(),
): Promise<InvitationIssue> {
  const canInvite = await authorizeStore(
    { userId: input.actorId, storeId: input.storeId, permission: 'team:manage' satisfies StorePermission },
    sql,
  );
  if (!canInvite) throw new OnboardingError('NOT_FOUND', 'Store not found.');
  const email = normalizeEmail(input.email);
  try {
    return await sql.begin(async (tx: TxClient) => {
      const rid = await roleId(tx, input.role);
      const raw = randomBytes(32).toString('hex');
      const rows = (await tx.unsafe(
        `INSERT INTO "store_invitations" ("store_id","email_normalized","role_id","token_hash","expires_at")
         VALUES ($1,$2,$3,$4, now() + interval '72 hours') RETURNING "id","expires_at";`,
        [input.storeId, email, rid, sha256Hex(raw)],
      )) as unknown as Array<{ id: string; expires_at: Date }>;
      const row = rows[0];
      if (!row) throw new Error('Invitation insert returned no row.');
      await recordAudit(
        {
          actorId: input.actorId,
          storeId: input.storeId,
          action: 'store.invited',
          entityType: 'invitation',
          entityId: row.id,
          before: null,
          after: { email, role: input.role },
          requestId: input.requestId,
        },
        tx as unknown as Sql,
      );
      return {
        invitationId: row.id,
        storeId: input.storeId,
        email,
        role: input.role,
        expiresAt: row.expires_at.toISOString(),
        token: raw,
      };
    });
  } catch (err) {
    if (typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505') {
      throw new OnboardingError('CONFLICT', 'An invitation is already pending for this email.');
    }
    throw err;
  }
}

/**
 * Accept an invitation: the caller must be logged in as the invited ACTIVE
 * account (email match). One-use: consumed/expired/unknown share generic
 * NOT_FOUND. Active members get 409; revoked members reactivate with the
 * invited role.
 */
export async function acceptInvitation(
  input: { token: string; userId: string; requestId: string },
  sql: Sql = getDb(),
): Promise<{ storeId: string; role: string; status: string }> {
  return sql.begin(async (tx: TxClient) => {
    const rows = (await tx.unsafe(
      `SELECT i."id", i."store_id", i."email_normalized", r."key" AS role, i."accepted_at", i."expires_at",
              u."id" AS user_id, u."email_normalized" AS user_email, u."status" AS user_status
       FROM "store_invitations" i
       JOIN "store_roles" r ON r."id" = i."role_id"
       LEFT JOIN "users" u ON u."id" = $1
       WHERE i."token_hash" = $2 FOR UPDATE OF i;`,
      [input.userId, sha256Hex(input.token)],
    )) as unknown as Array<{
      id: string;
      store_id: string;
      email_normalized: string;
      role: string;
      accepted_at: Date | null;
      expires_at: Date;
      user_id: string | null;
      user_email: string | null;
      user_status: string | null;
    }>;
    const invite = rows[0];
    if (
      !invite ||
      invite.accepted_at !== null ||
      invite.expires_at <= new Date() ||
      !invite.user_id ||
      invite.user_email !== invite.email_normalized ||
      invite.user_status !== 'active'
    ) {
      throw new OnboardingError('NOT_FOUND', 'Invitation not found.');
    }
    const existing = (await tx.unsafe(
      `SELECT "status" FROM "store_memberships" WHERE "store_id" = $1 AND "user_id" = $2;`,
      [invite.store_id, input.userId],
    )) as unknown as Array<{ status: string }>;
    const current = existing[0];
    if (current && current.status === 'active') {
      throw new OnboardingError('CONFLICT', 'Already a member of this store.');
    }
    const rid = await roleId(tx, invite.role);
    if (current) {
      await tx.unsafe(
        `UPDATE "store_memberships" SET "status" = 'active', "role_id" = $1, "version" = "version" + 1 WHERE "store_id" = $2 AND "user_id" = $3;`,
        [rid, invite.store_id, input.userId],
      );
    } else {
      await tx.unsafe(`INSERT INTO "store_memberships" ("store_id","user_id","role_id") VALUES ($1,$2,$3);`, [
        invite.store_id,
        input.userId,
        rid,
      ]);
    }
    await tx.unsafe(`UPDATE "store_invitations" SET "accepted_at" = now() WHERE "id" = $1;`, [invite.id]);
    await recordAudit(
      {
        actorId: input.userId,
        storeId: invite.store_id,
        action: 'store.invitation_accepted',
        entityType: 'membership',
        entityId: `${invite.store_id}:${input.userId}`,
        before: current ? { status: current.status } : null,
        after: { status: 'active', role: invite.role },
        requestId: input.requestId,
      },
      tx as unknown as Sql,
    );
    return { storeId: invite.store_id, role: invite.role, status: 'active' };
  });
}

/**
 * Update a member's role/status within the actor's store. Cross-store calls
 * die at the team:manage check (generic NOT_FOUND). Demoting or revoking the
 * last active owner is refused (CONFLICT).
 */
export async function updateMember(
  input: {
    storeId: string;
    actorId: string;
    targetUserId: string;
    role?: StoreRole;
    status?: 'active' | 'revoked';
    requestId: string;
  },
  sql: Sql = getDb(),
): Promise<{ storeId: string; userId: string; role: string; status: string }> {
  const canManage = await authorizeStore(
    { userId: input.actorId, storeId: input.storeId, permission: 'team:manage' satisfies StorePermission },
    sql,
  );
  if (!canManage) throw new OnboardingError('NOT_FOUND', 'Store not found.');
  return sql.begin(async (tx: TxClient) => {
    const rows = (await tx.unsafe(
      `SELECT m."status", r."key" AS role FROM "store_memberships" m JOIN "store_roles" r ON r."id" = m."role_id"
       WHERE m."store_id" = $1 AND m."user_id" = $2 FOR UPDATE OF m;`,
      [input.storeId, input.targetUserId],
    )) as unknown as Array<{ status: string; role: string }>;
    const current = rows[0];
    if (!current) throw new OnboardingError('NOT_FOUND', 'Member not found.');
    const nextRole = input.role ?? current.role;
    const nextStatus = input.status ?? current.status;
    if (!VALID_ROLES.includes(nextRole)) throw new OnboardingError('CONFLICT', 'Unknown role.');
    const leavingOwnership =
      current.role === 'owner' &&
      current.status === 'active' &&
      (nextRole !== 'owner' || nextStatus !== 'active');
    if (leavingOwnership) {
      await assertNotLastOwner(tx, { storeId: input.storeId, excludingUserId: input.targetUserId });
    }
    const rid = await roleId(tx, nextRole);
    await tx.unsafe(
      `UPDATE "store_memberships" SET "role_id" = $1, "status" = $2, "version" = "version" + 1 WHERE "store_id" = $3 AND "user_id" = $4;`,
      [rid, nextStatus, input.storeId, input.targetUserId],
    );
    await recordAudit(
      {
        actorId: input.actorId,
        storeId: input.storeId,
        action: 'store.member_updated',
        entityType: 'membership',
        entityId: `${input.storeId}:${input.targetUserId}`,
        before: { role: current.role, status: current.status },
        after: { role: nextRole, status: nextStatus },
        requestId: input.requestId,
      },
      tx as unknown as Sql,
    );
    return { storeId: input.storeId, userId: input.targetUserId, role: nextRole, status: nextStatus };
  });
}
