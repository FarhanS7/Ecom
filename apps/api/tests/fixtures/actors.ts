// Shared matrix actors (T018): two stores, seven personas, one cleanup.
// Used by permission-matrix.spec.ts. Fixture users share one password hash
// (computed once) to keep setup fast; emails are fixed and test-scoped.

import { hashPassword } from '@shopscale/backend';
import type { Sql } from 'postgres';

export const MATRIX_PASSWORD = 'matrix-pass-99';

export const MATRIX_USERS = {
  customer: 't018.customer@example.com',
  ownerA: 't018.owner.a@example.com',
  ownerB: 't018.owner.b@example.com',
  editorA: 't018.editor.a@example.com',
  fulfillB: 't018.fulfill.b@example.com',
  support: 't018.support@example.com',
  admin: 't018.admin@example.com',
} as const;

export type MatrixActor = keyof typeof MATRIX_USERS;

export interface MatrixWorld {
  sql: Sql;
  userIds: Record<MatrixActor, string>;
  storeA: string;
  storeB: string;
  pendingStore: string;
}

const EMAILS = Object.values(MATRIX_USERS);

export async function setupMatrixWorld(sql: Sql): Promise<MatrixWorld> {
  const passwordHash = await hashPassword(MATRIX_PASSWORD);
  for (const email of EMAILS) {
    await sql.unsafe(
      `INSERT INTO "users" ("email_normalized","password_hash","status") VALUES ($1,$2,'active') ON CONFLICT DO NOTHING;`,
      [email, passwordHash],
    );
  }
  const rows = (await sql.unsafe(
    `SELECT "email_normalized" AS email, "id" FROM "users" WHERE "email_normalized" = ANY($1);`,
    [EMAILS],
  )) as Array<{ email: string; id: string }>;
  const userIds = Object.fromEntries(rows.map((r) => [actorOf(r.email), r.id])) as Record<MatrixActor, string>;

  await sql.unsafe(
    `INSERT INTO "user_platform_roles" ("user_id","role_id") SELECT $1, "id" FROM "platform_roles" WHERE "key" = 'support' ON CONFLICT DO NOTHING;`,
    [userIds.support],
  );
  await sql.unsafe(
    `INSERT INTO "user_platform_roles" ("user_id","role_id") SELECT $1, "id" FROM "platform_roles" WHERE "key" = 'admin' ON CONFLICT DO NOTHING;`,
    [userIds.admin],
  );

  async function mkStore(ownerEmail: MatrixActor, slug: string, status: string): Promise<string> {
    const biz = (await sql.unsafe(`INSERT INTO "businesses" ("owner_user_id") VALUES ($1) RETURNING "id";`, [
      userIds[ownerEmail],
    ])) as Array<{ id: string }>;
    const store = (await sql.unsafe(
      `INSERT INTO "stores" ("business_id","slug","name","status") VALUES ($1,$2,$3,$4) RETURNING "id";`,
      [biz[0]?.id as string, slug, slug, status],
    )) as Array<{ id: string }>;
    return store[0]?.id as string;
  }

  const storeA = await mkStore('ownerA', 't018-store-a', 'active');
  const storeB = await mkStore('ownerB', 't018-store-b', 'active');
  const pendingStore = await mkStore('ownerA', 't018-store-pending', 'pending');

  async function grant(storeId: string, actor: MatrixActor, role: string): Promise<void> {
    await sql.unsafe(
      `INSERT INTO "store_memberships" ("store_id","user_id","role_id") SELECT $1, $2, "id" FROM "store_roles" WHERE "key" = $3 ON CONFLICT DO NOTHING;`,
      [storeId, userIds[actor], role],
    );
  }

  await grant(storeA, 'ownerA', 'owner');
  await grant(storeB, 'ownerB', 'owner');
  await grant(storeA, 'editorA', 'catalog-editor');
  await grant(storeB, 'fulfillB', 'fulfillment');

  return { sql, userIds, storeA, storeB, pendingStore };
}

function actorOf(email: string): MatrixActor {
  const entry = (Object.entries(MATRIX_USERS) as Array<[MatrixActor, string]>).find(([, v]) => v === email);
  if (!entry) throw new Error(`unknown matrix email ${email}`);
  return entry[0];
}

export async function teardownMatrixWorld(sql: Sql): Promise<void> {
  const list = EMAILS.map((e) => `'${e}'`).join(',');
  const slugs = `'t018-store-a','t018-store-b','t018-store-pending'`;
  await sql.unsafe(
    `DELETE FROM "store_invitations" WHERE "store_id" IN (SELECT "id" FROM "stores" WHERE "slug" IN (${slugs}));`,
  );
  await sql.unsafe(
    `DELETE FROM "store_memberships" WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" IN (${list}));`,
  );
  // products.store_id is RESTRICT, so a spec that created catalog rows under these
  // stores must not leave them behind or this delete fails. Doing it here keeps
  // teardown independent of the order the specs happen to run in (found by the
  // T028c live run: permission-matrix's teardown hit the FK after catalog-write).
  await sql.unsafe(
    `DELETE FROM "product_publications" WHERE "product_id" IN (SELECT "id" FROM "products" WHERE "store_id" IN (SELECT "id" FROM "stores" WHERE "slug" IN (${slugs})));`,
  );
  await sql.unsafe(
    `DELETE FROM "product_variants" WHERE "product_id" IN (SELECT "id" FROM "products" WHERE "store_id" IN (SELECT "id" FROM "stores" WHERE "slug" IN (${slugs})));`,
  );
  await sql.unsafe(
    `DELETE FROM "products" WHERE "store_id" IN (SELECT "id" FROM "stores" WHERE "slug" IN (${slugs}));`,
  );
  await sql.unsafe(`DELETE FROM "stores" WHERE "slug" IN (${slugs});`);
  await sql.unsafe(
    `DELETE FROM "businesses" WHERE "owner_user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" IN (${list})) AND "id" NOT IN (SELECT "business_id" FROM "stores");`,
  );
  await sql.unsafe(
    `DELETE FROM "user_platform_roles" WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" IN (${list}));`,
  );
  await sql.unsafe(
    `DELETE FROM "identity_tokens" WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" IN (${list}));`,
  );
  await sql.unsafe(
    `DELETE FROM "refresh_tokens" WHERE "family_id" IN (SELECT "id" FROM "session_families" WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" IN (${list})));`,
  );
  await sql.unsafe(`DELETE FROM "session_families" WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" IN (${list}));`);
  await sql.unsafe(`DELETE FROM "audit_logs" WHERE "actor_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" IN (${list}));`);
  await sql.unsafe(`DELETE FROM "users" WHERE "email_normalized" IN (${list});`);
}
