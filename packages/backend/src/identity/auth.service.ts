// @shopscale/backend/identity/auth.service - Registration and login logic.
// Nest-free: the API adapter (apps/api auth.controller) handles HTTP/cookies.
// Secrets policy: argon2id password hashes and sha256 refresh hashes at rest;
// raw tokens exist only as function returns bound for HttpOnly cookies.
// Wrong-password, unknown-email, and suspended-account all surface as the
// SAME generic failure (no account-existence disclosure, including timing:
// unknown emails still pay one argon2 verification against a dummy hash).

import { createHash, randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import * as jose from 'jose';
import type { Sql } from 'postgres';
import { getEnv } from '@shopscale/config';
import { getDb } from '../db/client.js';

export type AuthFailure = 'ACCOUNT_EXISTS' | 'INVALID_CREDENTIALS';

export class AuthError extends Error {
  readonly failure: AuthFailure;

  constructor(failure: AuthFailure, message: string) {
    super(message);
    this.failure = failure;
  }
}

export function accountExists(): AuthError {
  // Registration-only signal (the caller asked to CREATE this email).
  return new AuthError('ACCOUNT_EXISTS', 'An account with this email already exists.');
}

export function invalidCredentials(): AuthError {
  // Generic: unknown email, wrong password, and suspended account share it.
  return new AuthError('INVALID_CREDENTIALS', 'Invalid email or password.');
}

export interface DbUser {
  id: string;
  email_normalized: string;
  password_hash: string;
  status: 'active' | 'suspended' | 'pending_verification';
  created_at: Date;
}

export interface SafeUser {
  id: string;
  email: string;
  status: DbUser['status'];
  createdAt: string;
}

/** Minimal query surface shared by Sql and its transactions. */
export type Queryable = Pick<Sql, 'unsafe'>;

/** Structural client for test doubles: anything with postgres's unsafe(). */
export interface TxClient {
  unsafe: Sql['unsafe'];
}

export interface SessionIssue {
  user: SafeUser;
  familyId: string;
  accessToken: string;
  /** Raw refresh value: caller must place it in an HttpOnly cookie, never a body or log. */
  refreshRaw: string;
  expiresIn: number;
}

/** Normalize once (lowercase + trim + NFC); the DB enforces the result. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase().normalize('NFC');
}

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export function sha256Hex(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

let dummyHash: string | null = null;

/** Constant-time-ish login: unknown emails still cost one verification. */
async function verifyAgainstDummy(password: string): Promise<void> {
  if (!dummyHash) {
    dummyHash = await hashPassword(`dummy:${randomBytes(16).toString('hex')}`);
  }
  await verifyPassword(dummyHash, password);
}

export function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: unknown }).code === '23505'
  );
}

function toSafeUser(row: DbUser): SafeUser {
  return {
    id: row.id,
    email: row.email_normalized,
    status: row.status,
    createdAt: row.created_at.toISOString(),
  };
}

export { toSafeUser };

async function platformRoleKeys(tx: TxClient, userId: string): Promise<string[]> {
  const rows = (await tx.unsafe(
    `SELECT r."key" FROM "platform_roles" r JOIN "user_platform_roles" ur ON ur."role_id" = r."id" WHERE ur."user_id" = $1 ORDER BY r."key";`,
    [userId],
  )) as unknown as Array<{ key: string }>;
  return rows.map((r) => r.key);
}

export async function mintAccessToken(input: {
  userId: string;
  familyId: string;
  roles: string[];
}): Promise<string> {
  const env = getEnv();
  return new jose.SignJWT({ fid: input.familyId, roles: input.roles })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer('shopscale')
    .setSubject(input.userId)
    .setExpirationTime(env.JWT_ACCESS_TTL)
    .sign(new TextEncoder().encode(env.JWT_ACCESS_SECRET));
}

export async function verifyAccessToken(
  token: string,
): Promise<{ userId: string; familyId: string; roles: string[] } | null> {
  try {
    const env = getEnv();
    const { payload } = await jose.jwtVerify(token, new TextEncoder().encode(env.JWT_ACCESS_SECRET), {
      issuer: 'shopscale',
    });
    if (typeof payload.sub !== 'string' || typeof payload['fid'] !== 'string') return null;
    const fid: string = payload['fid'];
    const roles = Array.isArray(payload['roles'])
      ? (payload['roles'] as unknown[]).filter((r): r is string => typeof r === 'string')
      : [];
    return { userId: payload.sub, familyId: fid, roles };
  } catch {
    return null;
  }
}

function newRefreshPair(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString('hex');
  return { raw, hash: sha256Hex(raw) };
}

async function insertSession(
  tx: TxClient,
  userId: string,
): Promise<{ familyId: string; refreshRaw: string }> {
  const pair = newRefreshPair();
  const family = (await tx.unsafe(
    `INSERT INTO "session_families" ("user_id","expires_at") VALUES ($1, now() + interval '7 days') RETURNING "id";`,
    [userId],
  )) as unknown as Array<{ id: string }>;
  const familyRow = family[0];
  if (!familyRow) throw new Error('Session family insert returned no row.');
  await tx.unsafe(
    `INSERT INTO "refresh_tokens" ("family_id","token_hash","expires_at") VALUES ($1,$2, now() + interval '7 days');`,
    [familyRow.id, pair.hash],
  );
  return { familyId: familyRow.id, refreshRaw: pair.raw };
}

/**
 * Register a new customer account. Register creates `active` users until T012
 * defines verification gating (recorded, not silent). Exactly one session
 * family is issued with the account.
 */
export async function registerAccount(
  input: { email: string; password: string },
  sql: Sql = getDb(),
): Promise<SessionIssue> {
  const email = normalizeEmail(input.email);
  const passwordHash = await hashPassword(input.password);
  try {
    const issued = await sql.begin(async (tx) => {
      const rows = (await tx.unsafe(
        `INSERT INTO "users" ("email_normalized","password_hash","status") VALUES ($1,$2,'active') RETURNING "id","email_normalized","password_hash","status","created_at";`,
        [email, passwordHash],
      )) as unknown as DbUser[];
      const user = rows[0];
      if (!user) throw new Error('User insert returned no row.');
      await tx.unsafe(
        `INSERT INTO "user_platform_roles" ("user_id","role_id") SELECT $1, "id" FROM "platform_roles" WHERE "key" = 'customer';`,
        [user.id],
      );
      const session = await insertSession(tx, user.id);
      const roles = await platformRoleKeys(tx, user.id);
      const accessToken = await mintAccessToken({ userId: user.id, familyId: session.familyId, roles });
      return { user: toSafeUser(user), ...session, accessToken };
    });
    return { ...issued, expiresIn: 15 * 60 };
  } catch (err) {
    if (isUniqueViolation(err)) throw accountExists();
    throw err;
  }
}

/**
 * Authenticate with generic failures. Unknown email, wrong password, and
 * suspended status are indistinguishable to the caller (message, code path,
 * and argon2 cost).
 */
export async function authenticateAccount(
  input: { email: string; password: string },
  sql: Sql = getDb(),
): Promise<SessionIssue> {
  const email = normalizeEmail(input.email);
  const rows = (await sql.unsafe(`SELECT * FROM "users" WHERE "email_normalized" = $1;`, [
    email,
  ])) as unknown as DbUser[];
  const user = rows[0];
  if (!user) {
    await verifyAgainstDummy(input.password);
    throw invalidCredentials();
  }
  const userId = user.id;
  const safeUser = toSafeUser(user);
  const ok = await verifyPassword(user.password_hash, input.password);
  if (!ok || user.status === 'suspended') {
    throw invalidCredentials();
  }
  const issued = await sql.begin(async (tx) => {
    const session = await insertSession(tx, userId);
    const roles = await platformRoleKeys(tx, userId);
    const accessToken = await mintAccessToken({ userId, familyId: session.familyId, roles });
    return { user: safeUser, ...session, accessToken };
  });
  return { ...issued, expiresIn: 15 * 60 };
}
