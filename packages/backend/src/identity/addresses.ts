// @shopscale/backend/identity/addresses - User-owned address book (T091a).
// Every statement scopes by (id, user_id) in a SINGLE query: there is no
// read-then-check window where ownership could change mid-flight. DTOs carry
// no owner id (self context) and no other user's data can ever match.

import type { Sql } from 'postgres';
import { getDb } from '../db/client.js';

export interface AddressFieldsInput {
  name: string;
  line1: string;
  line2?: string | undefined;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  phone?: string | undefined;
}

export interface SafeAddress {
  id: string;
  fields: AddressFieldsInput;
  createdAt: string;
}

function toSafeAddress(row: { id: string; fields: unknown; created_at: Date }): SafeAddress {
  return {
    id: row.id,
    fields: row.fields as AddressFieldsInput,
    createdAt: row.created_at.toISOString(),
  };
}

export async function createAddress(
  userId: string,
  fields: AddressFieldsInput,
  sql: Sql = getDb(),
): Promise<SafeAddress> {
  const rows = (await sql.unsafe(
    `INSERT INTO "addresses" ("user_id","fields") VALUES ($1,$2) RETURNING "id","fields","created_at";`,
    [userId, JSON.stringify(fields)],
  )) as unknown as Array<{ id: string; fields: unknown; created_at: Date }>;
  const row = rows[0];
  if (!row) throw new Error('Address insert returned no row.');
  return toSafeAddress(row);
}

export async function listAddresses(userId: string, sql: Sql = getDb()): Promise<SafeAddress[]> {
  const rows = (await sql.unsafe(
    `SELECT "id","fields","created_at" FROM "addresses" WHERE "user_id" = $1 ORDER BY "created_at" DESC, "id" DESC;`,
    [userId],
  )) as unknown as Array<{ id: string; fields: unknown; created_at: Date }>;
  return rows.map(toSafeAddress);
}

export async function getAddress(
  userId: string,
  addressId: string,
  sql: Sql = getDb(),
): Promise<SafeAddress | null> {
  const rows = (await sql.unsafe(
    `SELECT "id","fields","created_at" FROM "addresses" WHERE "id" = $1 AND "user_id" = $2;`,
    [addressId, userId],
  )) as unknown as Array<{ id: string; fields: unknown; created_at: Date }>;
  const row = rows[0];
  return row ? toSafeAddress(row) : null;
}

export async function updateAddress(
  userId: string,
  addressId: string,
  fields: AddressFieldsInput,
  sql: Sql = getDb(),
): Promise<SafeAddress | null> {
  const rows = (await sql.unsafe(
    `UPDATE "addresses" SET "fields" = $1 WHERE "id" = $2 AND "user_id" = $3 RETURNING "id","fields","created_at";`,
    [JSON.stringify(fields), addressId, userId],
  )) as unknown as Array<{ id: string; fields: unknown; created_at: Date }>;
  const row = rows[0];
  return row ? toSafeAddress(row) : null;
}

export async function deleteAddress(userId: string, addressId: string, sql: Sql = getDb()): Promise<boolean> {
  const rows = (await sql.unsafe(`DELETE FROM "addresses" WHERE "id" = $1 AND "user_id" = $2 RETURNING "id";`, [
    addressId,
    userId,
  ])) as unknown as Array<{ id: string }>;
  return rows.length > 0;
}
