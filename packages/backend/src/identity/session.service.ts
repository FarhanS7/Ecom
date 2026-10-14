// @shopscale/backend/identity/session.service - Live session state.
// JWTs are cryptographically verifiable but carry no authority: every
// protected decision re-checks the family row (revoked? expired?) and the
// user row (suspended?) in PostgreSQL. Rotation runs in one transaction
// holding the token row lock, so exactly one concurrent refresh can succeed;
// a consumed token presented again is treated as theft and revokes the whole
// family (module spec).

import { randomBytes } from 'node:crypto';
import type { Sql } from 'postgres';
import {
  mintAccessToken,
  sha256Hex,
  toSafeUser,
  verifyAccessToken,
} from './auth.service.js';
import type { SafeUser, TxClient } from './auth.service.js';
import { getDb } from '../db/client.js';

export interface Actor {
  userId: string;
  familyId: string;
  roles: string[];
}

export type RotationOutcome =
  | {
      kind: 'rotated';
      user: SafeUser;
      familyId: string;
      accessToken: string;
      refreshRaw: string;
      expiresIn: number;
    }
  | { kind: 'revoked' }
  | { kind: 'invalid' };

interface TokenRow {
  id: string;
  family_id: string;
  used_at: Date | null;
  expires_at: Date;
  revoked_at: Date | null;
  family_expires_at: Date;
  user_status: string;
  user_id: string;
}

/**
 * Resolve the live actor for an access token, or null. Suspended users and
 * revoked/expired families resolve to null even with a valid signature.
 */
export async function resolveActor(
  accessToken: string,
  sql: Sql = getDb(),
): Promise<Actor | null> {
  const claims = await verifyAccessToken(accessToken);
  if (!claims) return null;
  const rows = (await sql.unsafe(
    `SELECT f."revoked_at", f."expires_at" AS family_expires, u."status" AS user_status
     FROM "session_families" f JOIN "users" u ON u."id" = f."user_id"
     WHERE f."id" = $1;`,
    [claims.familyId],
  )) as unknown as Array<{ revoked_at: Date | null; family_expires: Date; user_status: string }>;
  const row = rows[0];
  if (!row || row.revoked_at !== null) return null;
  if (row.family_expires <= new Date()) return null;
  if (row.user_status === 'suspended') return null;
  return { userId: claims.userId, familyId: claims.familyId, roles: claims.roles };
}

/** Idempotent family revocation (logout, theft response, reset). */
export async function revokeFamily(familyId: string, sql: Sql = getDb()): Promise<void> {
  await sql.unsafe(`UPDATE "session_families" SET "revoked_at" = now() WHERE "id" = $1 AND "revoked_at" IS NULL;`, [
    familyId,
  ]);
}

/**
 * Rotate a refresh token inside one transaction holding the token row lock.
 * Exactly one concurrent caller can observe `used_at IS NULL`; every later
 * presenter of the same value sees a consumed token and revokes the family.
 */
export async function rotateRefresh(rawRefresh: string, sql: Sql = getDb()): Promise<RotationOutcome> {
  const hash = sha256Hex(rawRefresh);
  return sql.begin(async (tx: TxClient) => {
    const rows = (await tx.unsafe(
      `SELECT t."id", t."family_id", t."used_at", t."expires_at",
              f."revoked_at", f."expires_at" AS family_expires,
              u."status" AS user_status, u."id" AS user_id
       FROM "refresh_tokens" t
       JOIN "session_families" f ON f."id" = t."family_id"
       JOIN "users" u ON u."id" = f."user_id"
       WHERE t."token_hash" = $1
       FOR UPDATE OF t;`,
      [hash],
    )) as unknown as TokenRow[];
    const row = rows[0];
    if (!row) return { kind: 'invalid' } as const;
    if (row.revoked_at !== null || row.used_at !== null) {
      await tx.unsafe(`UPDATE "session_families" SET "revoked_at" = now() WHERE "id" = $1 AND "revoked_at" IS NULL;`, [
        row.family_id,
      ]);
      return { kind: 'revoked' } as const;
    }
    const now = new Date();
    if (row.expires_at <= now || row.family_expires_at <= now || row.user_status === 'suspended') {
      return { kind: 'invalid' } as const;
    }

    const nextRaw = randomBytes(32).toString('hex');
    const next = (await tx.unsafe(
      `INSERT INTO "refresh_tokens" ("family_id","token_hash","expires_at") VALUES ($1,$2, now() + interval '7 days') RETURNING "id";`,
      [row.family_id, sha256Hex(nextRaw)],
    )) as unknown as Array<{ id: string }>;
    const nextRow = next[0];
    if (!nextRow) throw new Error('Refresh insert returned no row.');
    await tx.unsafe(`UPDATE "refresh_tokens" SET "used_at" = now(), "replacement_id" = $1 WHERE "id" = $2;`, [
      nextRow.id,
      row.id,
    ]);
    const roles = (
      (await tx.unsafe(
        `SELECT r."key" FROM "platform_roles" r JOIN "user_platform_roles" ur ON ur."role_id" = r."id" WHERE ur."user_id" = $1 ORDER BY r."key";`,
        [row.user_id],
      )) as unknown as Array<{ key: string }>
    ).map((r) => r.key);
    const accessToken = await mintAccessToken({ userId: row.user_id, familyId: row.family_id, roles });
    const userRows = (await tx.unsafe(
      `SELECT "id","email_normalized","password_hash","status","created_at" FROM "users" WHERE "id" = $1;`,
      [row.user_id],
    )) as unknown as Array<{
      id: string;
      email_normalized: string;
      password_hash: string;
      status: 'active' | 'suspended' | 'pending_verification';
      created_at: Date;
    }>;
    const userRow = userRows[0];
    if (!userRow) throw new Error('Rotation user vanished mid-transaction.');
    return {
      kind: 'rotated',
      user: toSafeUser(userRow),
      familyId: row.family_id,
      accessToken,
      refreshRaw: nextRaw,
      expiresIn: 15 * 60,
    } as const;
  });
}

/** Fresh safe user for /me (never the hash). */
export async function getSafeUser(userId: string, sql: Sql = getDb()): Promise<SafeUser | null> {
  const rows = (await sql.unsafe(
    `SELECT "id","email_normalized","password_hash","status","created_at" FROM "users" WHERE "id" = $1;`,
    [userId],
  )) as unknown as Array<{
    id: string;
    email_normalized: string;
    password_hash: string;
    status: 'active' | 'suspended' | 'pending_verification';
    created_at: Date;
  }>;
  const row = rows[0];
  return row ? toSafeUser(row) : null;
}
