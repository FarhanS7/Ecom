// @shopscale/backend/identity/recovery.service - Password reset and email
// verification (T012a). Nest-free; the API adapter extends AuthController.
// Security shape: requests are non-enumerating (unknown emails behave exactly
// like known ones), proofs are single-use expiring hashes, confirmation is
// transactional (consume + rehash + revoke-all-sessions), and verification
// only ever lifts `pending_verification` — never `suspended`.
// Time is an injected parameter (default: now) so expiry is deterministic.

import { randomBytes } from 'node:crypto';
import type { Sql } from 'postgres';
import { getDb } from '../db/client.js';
import { hashPassword, normalizeEmail, sha256Hex } from './auth.service.js';
import type { TxClient } from './auth.service.js';
import { DemoDeliverySink, demoDelivery } from './demo-delivery.js';
import type { DeliveryPurpose } from './demo-delivery.js';

export interface ProofRow {
  id: string;
  user_id: string;
  purpose: string;
  token_hash: string;
  expires_at: Date;
  consumed_at: Date | null;
  user_status: string;
}

/** Pure usability predicate: the entire expiry/replay/purpose table in one place. */
export function isUsableToken(row: ProofRow | null, purpose: DeliveryPurpose, now: Date): boolean {
  if (!row) return false;
  if (row.purpose !== purpose) return false;
  if (row.consumed_at !== null) return false;
  if (row.expires_at <= now) return false;
  return true;
}

export interface RecoveryDeps {
  sql?: Sql;
  sink?: DemoDeliverySink;
  now?: Date;
}

function depsOrDefaults(deps: RecoveryDeps = {}): { sql: Sql; sink: DemoDeliverySink; now: Date } {
  return { sql: deps.sql ?? getDb(), sink: deps.sink ?? demoDelivery, now: deps.now ?? new Date() };
}

async function mintProof(
  tx: TxClient,
  input: { userId: string; purpose: DeliveryPurpose; ttlMinutes: number; now: Date },
): Promise<string> {
  // Single live proof per (user, purpose): supersede predecessors so only
  // the newest link can ever work (replay of older links fails closed).
  await tx.unsafe(
    `UPDATE "identity_tokens" SET "consumed_at" = $1 WHERE "user_id" = $2 AND "purpose" = $3 AND "consumed_at" IS NULL;`,
    [input.now.toISOString(), input.userId, input.purpose],
  );
  const raw = randomBytes(32).toString('hex');
  await tx.unsafe(
    `INSERT INTO "identity_tokens" ("user_id","purpose","token_hash","expires_at") VALUES ($1,$2,$3,$4);`,
    [input.userId, input.purpose, sha256Hex(raw), new Date(input.now.getTime() + input.ttlMinutes * 60_000).toISOString()],
  );
  return raw;
}

async function findProof(
  tx: TxClient,
  input: { hash: string; purpose: DeliveryPurpose },
): Promise<ProofRow | null> {
  const rows = (await tx.unsafe(
    `SELECT t."id", t."user_id", t."purpose", t."token_hash", t."expires_at", t."consumed_at", u."status" AS user_status
     FROM "identity_tokens" t JOIN "users" u ON u."id" = t."user_id"
     WHERE t."token_hash" = $1 AND t."purpose" = $2;`,
    [input.hash, input.purpose],
  )) as unknown as ProofRow[];
  return rows[0] ?? null;
}

/**
 * Request a password reset. ALWAYS succeeds silently (202 at HTTP): unknown
 * emails create nothing and take the same code path shape. Only `active`
 * accounts receive proofs (pending/suspended get nothing, same response).
 */
export async function requestPasswordReset(email: string, deps: RecoveryDeps = {}): Promise<void> {
  const { sql, sink, now } = depsOrDefaults(deps);
  const normalized = normalizeEmail(email);
  await sql.begin(async (tx: TxClient) => {
    const users = (await tx.unsafe(`SELECT "id","status" FROM "users" WHERE "email_normalized" = $1;`, [
      normalized,
    ])) as unknown as Array<{ id: string; status: string }>;
    const user = users[0];
    if (!user || user.status !== 'active') return;
    const raw = await mintProof(tx, { userId: user.id, purpose: 'reset', ttlMinutes: 60, now });
    sink.send({ to: normalized, purpose: 'reset', token: raw });
  });
}

/**
 * Confirm a reset: consume the proof, set the new hash, revoke every family.
 * Returns the user id, or null for unknown/consumed/expired proofs and
 * non-active accounts (caller maps null to one generic 404).
 */
export async function confirmPasswordReset(
  input: { token: string; newPassword: string },
  deps: RecoveryDeps = {},
): Promise<{ userId: string } | null> {
  const { sql, now } = depsOrDefaults(deps);
  if (input.newPassword.length < 8 || input.newPassword.length > 128) return null;
  return sql.begin(async (tx: TxClient) => {
    const row = await findProof(tx, { hash: sha256Hex(input.token), purpose: 'reset' });
    if (!isUsableToken(row, 'reset', now) || !row || row.user_status !== 'active') return null;
    const passwordHash = await hashPassword(input.newPassword);
    await tx.unsafe(`UPDATE "identity_tokens" SET "consumed_at" = $1 WHERE "id" = $2;`, [
      now.toISOString(),
      row.id,
    ]);
    await tx.unsafe(`UPDATE "users" SET "password_hash" = $1, "updated_at" = $2 WHERE "id" = $3;`, [
      passwordHash,
      now.toISOString(),
      row.user_id,
    ]);
    await tx.unsafe(`UPDATE "session_families" SET "revoked_at" = $1 WHERE "user_id" = $2 AND "revoked_at" IS NULL;`, [
      now.toISOString(),
      row.user_id,
    ]);
    return { userId: row.user_id };
  });
}

/** Request a verification proof for self (authenticated). No-op when already active. */
export async function requestVerification(userId: string, deps: RecoveryDeps = {}): Promise<void> {
  const { sql, sink, now } = depsOrDefaults(deps);
  await sql.begin(async (tx: TxClient) => {
    const users = (await tx.unsafe(`SELECT "id","status","email_normalized" FROM "users" WHERE "id" = $1;`, [
      userId,
    ])) as unknown as Array<{ id: string; status: string; email_normalized: string }>;
    const user = users[0];
    if (!user || user.status !== 'pending_verification') return;
    const raw = await mintProof(tx, { userId: user.id, purpose: 'verification', ttlMinutes: 24 * 60, now });
    sink.send({ to: user.email_normalized, purpose: 'verification', token: raw });
  });
}

/**
 * Confirm verification: pending→active only. Suspended accounts are never
 * lifted here (that is an admin decision, T069). Unknown/consumed/expired →
 * null (caller maps to generic 404).
 */
export async function confirmVerification(
  token: string,
  deps: RecoveryDeps = {},
): Promise<{ userId: string } | null> {
  const { sql, now } = depsOrDefaults(deps);
  return sql.begin(async (tx: TxClient) => {
    const row = await findProof(tx, { hash: sha256Hex(token), purpose: 'verification' });
    if (!isUsableToken(row, 'verification', now) || !row) return null;
    if (row.user_status !== 'pending_verification') return null;
    await tx.unsafe(`UPDATE "identity_tokens" SET "consumed_at" = $1 WHERE "id" = $2;`, [
      now.toISOString(),
      row.id,
    ]);
    await tx.unsafe(`UPDATE "users" SET "status" = 'active', "updated_at" = $1 WHERE "id" = $2;`, [
      now.toISOString(),
      row.user_id,
    ]);
    return { userId: row.user_id };
  });
}
