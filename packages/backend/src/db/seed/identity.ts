// @shopscale/backend/db/seed/identity - T028a identity + store fixtures.
//
// Two halves, deliberately separated:
//   * planIdentity() is PURE. It returns plain rows, so determinism and scope can
//     be asserted in unit tests with no database at all.
//   * writeIdentity() is the thin SQL writer for that plan.
//
// Every fixture lives under one marker (`seed.` emails, `seed-` slugs), which is
// what makes the seeded data removable without touching anything else.

import type { Sql } from 'postgres';
import { idFor, intBetween, isoAt, pick, seedRandom } from './random.js';

export type SeedSize = 's' | 'm' | 'l' | 'xl';
export type SeedStoreRole = 'owner' | 'manager' | 'catalog-editor' | 'fulfillment';
export type SeedPlatformRole = 'admin' | 'support' | 'seller' | 'customer';

/** Rows are excluded from lint/type noise by being plain records. */
export interface SeedUserRow {
  id: string;
  email_normalized: string;
  password_hash: string;
  status: 'active' | 'suspended' | 'pending_verification';
  created_at: string;
  updated_at: string;
}

export interface SeedBusinessRow {
  id: string;
  owner_user_id: string;
  status: 'active' | 'suspended';
  commission_bps: number;
  created_at: string;
}

export interface SeedStoreRow {
  id: string;
  business_id: string;
  slug: string;
  name: string;
  status: 'pending' | 'active' | 'suspended';
  created_at: string;
}

export interface SeedMembershipRow {
  store_id: string;
  user_id: string;
  role_key: SeedStoreRole;
  status: 'active' | 'revoked';
  version: number;
}

export interface SeedPlatformRoleRow {
  user_id: string;
  role_key: SeedPlatformRole;
}

export interface SeededStaff {
  userId: string;
  email: string;
  role: SeedStoreRole;
}

export interface SeededStore {
  /** Position in the deterministic store order; the catalog plan keys off it. */
  index: number;
  slug: string;
  storeId: string;
  ownerUserId: string;
  ownerEmail: string;
  staff: SeededStaff[];
}

export interface IdentityPlan {
  seed: number;
  shape: SeedShape;
  users: SeedUserRow[];
  businesses: SeedBusinessRow[];
  stores: SeedStoreRow[];
  memberships: SeedMembershipRow[];
  platformRoles: SeedPlatformRoleRow[];
  accounts: {
    /** Platform admin: the T018/T015 admin surface and approval flows. */
    adminUserId: string;
    /** A registered customer who owns NOTHING — the isolation baseline. */
    emptyAccountUserId: string;
    /** Owner of the last store: a real foreign seller for the first store. */
    foreignSellerUserId: string;
    stores: SeededStore[];
  };
}

export interface SeedShape {
  stores: number;
  /**
   * How many of the seeded stores are deliberately EMPTY. The catalogued total is
   * `(stores - emptyStores) * productsPerStore`, which is why the Tier S shape
   * below names them separately instead of hiding the subtraction.
   */
  emptyStores: number;
  productsPerStore: number;
  /** Inclusive range of variants per product. */
  variantsPerProduct: [number, number];
  categories: number;
  staffPerStore: number;
}

/**
 * Tier S shape. The task is explicitly Tier S ("extend later for orders"): two
 * catalogued stores of 500 products (1,000 products, ~2,500 variants) plus one
 * active-but-empty store, which is what makes the storefront's empty state real.
 * M/L/XL need streaming bulk load (T077) and are refused by the CLI rather than
 * half-implemented, because generating a million rows as JS objects would not
 * model the real thing.
 */
export const TIER_S_SHAPE: SeedShape = {
  stores: 3,
  emptyStores: 1,
  productsPerStore: 500,
  variantsPerProduct: [2, 3],
  categories: 8,
  staffPerStore: 3,
};

export const SEED_EMAIL_PREFIX = 'seed.';
export const SEED_SLUG_PREFIX = 'seed-';

const STORE_NAMES = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta'] as const;
const STAFF_ROLES: readonly SeedStoreRole[] = ['manager', 'catalog-editor', 'fulfillment'];

/**
 * The demo credential. These accounts exist only in a seeded local/demo database
 * (the CLI refuses a production host without an explicit override), and the hash
 * is a fixed constant so `users` rows are reproducible too. Password:
 * `seed-demo-password-42`.
 */
export const SEED_DEMO_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$77ZCpfpF8PL1BduZ81uLng$m4E6j0ISFea+RQBeKwdBzFqx1xob/3iLlhVeKnxPOVk';

export function shapeForSize(size: SeedSize): SeedShape {
  if (size !== 's') {
    throw new Error(
      `Seed size "${size}" is not implemented: T028 ships the Tier S catalog and T077 owns the M/L/XL streaming tiers.`,
    );
  }
  return TIER_S_SHAPE;
}

function storeSlug(index: number): string {
  const name = STORE_NAMES[index];
  return `${SEED_SLUG_PREFIX}${name ?? index}`;
}

function user(emailLocal: string, index: number): SeedUserRow {
  // Deterministic offsets keep rows byte-identical across runs; a wall clock
  // would make two seeds of the same data differ.
  const created = isoAt(3 * index);
  return {
    id: idFor('user', emailLocal),
    email_normalized: `${SEED_EMAIL_PREFIX}${emailLocal}`,
    password_hash: SEED_DEMO_PASSWORD_HASH,
    status: 'active',
    created_at: created,
    updated_at: created,
  };
}

/**
 * Build the identity fixture set for a seed + shape. Pure: same inputs, same
 * rows, byte for byte.
 *
 * Fixture roles (named in the acceptance criteria):
 *   * `seed.admin@…`     — platform admin (user_platform_roles: admin)
 *   * `seed.empty@…`     — a customer who owns no business, store, or membership
 *   * `seed.owner.<slug>@…` and `seed.staff.<slug>.<role>@…` — scoped staff whose
 *     memberships mirror STORE_ROLE_GRANTS exactly (see the unit suite)
 */
export function planIdentity(options: { seed: number; shape: SeedShape }): IdentityPlan {
  const { seed, shape } = options;
  const rng = seedRandom(seed ^ 0x1d3a71);
  const users: SeedUserRow[] = [];
  const businesses: SeedBusinessRow[] = [];
  const stores: SeedStoreRow[] = [];
  const memberships: SeedMembershipRow[] = [];
  const platformRoles: SeedPlatformRoleRow[] = [];
  const seededStores: SeededStore[] = [];

  const admin = user('admin@example.com', 0);
  const empty = user('empty@example.com', 1);
  users.push(admin, empty);
  platformRoles.push({ user_id: admin.id, role_key: 'admin' });
  platformRoles.push({ user_id: empty.id, role_key: 'customer' });

  let index = 2;
  for (let storeIndex = 0; storeIndex < shape.stores; storeIndex += 1) {
    const slug = storeSlug(storeIndex);
    const owner = user(`owner.${slug}@example.com`, index);
    index += 1;
    users.push(owner);
    platformRoles.push({ user_id: owner.id, role_key: 'seller' });

    const business: SeedBusinessRow = {
      id: idFor('business', slug),
      owner_user_id: owner.id,
      status: 'active',
      commission_bps: intBetween(rng, 300, 800),
      created_at: isoAt(10 * storeIndex),
    };
    businesses.push(business);

    const store: SeedStoreRow = {
      id: idFor('store', slug),
      business_id: business.id,
      slug,
      name: `Seed ${slug.replace(`${SEED_SLUG_PREFIX}`, '')}`,
      status: 'active',
      created_at: isoAt(12 * storeIndex),
    };
    stores.push(store);

    memberships.push({
      store_id: store.id,
      user_id: owner.id,
      role_key: 'owner',
      status: 'active',
      version: 1,
    });

    const staff: SeededStaff[] = [];
    for (let staffIndex = 0; staffIndex < Math.min(shape.staffPerStore, STAFF_ROLES.length); staffIndex += 1) {
      const role = STAFF_ROLES[staffIndex]!;
      const email = `staff.${slug}.${role}@example.com`;
      const member = user(email, index);
      index += 1;
      users.push(member);
      platformRoles.push({ user_id: member.id, role_key: 'seller' });
      memberships.push({ store_id: store.id, user_id: member.id, role_key: role, status: 'active', version: 1 });
      staff.push({ userId: member.id, email: member.email_normalized, role });
    }

    seededStores.push({
      index: storeIndex,
      slug,
      storeId: store.id,
      ownerUserId: owner.id,
      ownerEmail: owner.email_normalized,
      staff,
    });
  }

  // The foreign seller is the owner of the LAST store: a real, authorised seller
  // who must still be refused by the FIRST store. Using a non-member would prove
  // less, because a non-member is refused for the boring reason.
  const foreignSellerUserId = seededStores[seededStores.length - 1]?.ownerUserId ?? empty.id;

  return {
    seed,
    shape,
    users,
    businesses,
    stores,
    memberships,
    platformRoles,
    accounts: { adminUserId: admin.id, emptyAccountUserId: empty.id, foreignSellerUserId, stores: seededStores },
  };
}

/** Ids of the plan's users, for callers that need to assert on the whole set. */
export function identityUserIds(plan: IdentityPlan): string[] {
  return plan.users.map((row) => row.id);
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    batches.push(items.slice(start, start + size));
  }
  return batches;
}

/**
 * Batched multi-row INSERT ... ON CONFLICT DO NOTHING.
 * Returns how many rows were actually inserted, which is how idempotence is
 * observed rather than assumed: a second seed run must report zero.
 */
export async function insertChunked(
  sql: Sql,
  options: {
    table: string;
    columns: string[];
    casts?: Record<string, string>;
    rows: readonly unknown[];
    valuesOf: (row: unknown) => Array<string | number | boolean | null>;
    batchSize?: number;
  },
): Promise<number> {
  let inserted = 0;
  for (const batch of chunk(options.rows, options.batchSize ?? 250)) {
    const params: Array<string | number | boolean | null> = [];
    const tuples = batch.map((row) => {
      const placeholders = options.valuesOf(row).map((value, columnIndex) => {
        params.push(value);
        const column = options.columns[columnIndex];
        const cast = column ? options.casts?.[column] : undefined;
        return `$${params.length}${cast ? `::${cast}` : ''}`;
      });
      return `(${placeholders.join(',')})`;
    });
    const columns = options.columns.map((column) => `"${column}"`).join(',');
    const result = (await sql.unsafe(
      `INSERT INTO "${options.table}" (${columns}) VALUES ${tuples.join(',')} ON CONFLICT DO NOTHING RETURNING 1 AS inserted;`,
      params,
    )) as unknown as Array<{ inserted: number }>;
    inserted += result.length;
  }
  return inserted;
}

export interface IdentityWriteReport {
  user: number;
  business: number;
  store: number;
  membership: number;
  platformRole: number;
}

/** Write the identity plan in FK order. Idempotent per row. */
export async function writeIdentity(sql: Sql, plan: IdentityPlan): Promise<IdentityWriteReport> {
  const users = await insertChunked(sql, {
    table: 'users',
    columns: ['id', 'email_normalized', 'password_hash', 'status', 'created_at', 'updated_at'],
    rows: plan.users,
    valuesOf: (row) => {
      const item = row as SeedUserRow;
      return [item.id, item.email_normalized, item.password_hash, item.status, item.created_at, item.updated_at];
    },
  });

  const businesses = await insertChunked(sql, {
    table: 'businesses',
    columns: ['id', 'owner_user_id', 'status', 'commission_bps', 'created_at'],
    rows: plan.businesses,
    valuesOf: (row) => {
      const item = row as SeedBusinessRow;
      return [item.id, item.owner_user_id, item.status, item.commission_bps, item.created_at];
    },
  });

  const stores = await insertChunked(sql, {
    table: 'stores',
    columns: ['id', 'business_id', 'slug', 'name', 'status', 'created_at'],
    rows: plan.stores,
    valuesOf: (row) => {
      const item = row as SeedStoreRow;
      return [item.id, item.business_id, item.slug, item.name, item.status, item.created_at];
    },
  });

  // Memberships and platform roles reference rows seeded by MIGRATIONS
  // (store_roles / platform_roles carry fixed uuids), so the writer joins on the
  // role KEY rather than duplicating those constants here.
  let membership = 0;
  for (const batch of chunk(plan.memberships, 250)) {
    const params: Array<string | number> = [];
    const tuples = batch.map((row) => {
      params.push(row.store_id, row.user_id, row.role_key, row.status, row.version);
      const base = params.length - 5;
      return `($${base + 1}::uuid,$${base + 2}::uuid,$${base + 3}::text,$${base + 4}::text,$${base + 5}::int)`;
    });
    const result = (await sql.unsafe(
      `INSERT INTO "store_memberships" ("store_id","user_id","role_id","status","version")
       SELECT v.store_id, v.user_id, r."id", v.status, v.version
         FROM (VALUES ${tuples.join(',')}) AS v(store_id,user_id,role_key,status,version)
         JOIN "store_roles" r ON r."key" = v.role_key
       ON CONFLICT DO NOTHING RETURNING 1 AS inserted;`,
      params,
    )) as unknown as Array<{ inserted: number }>;
    membership += result.length;
  }

  let platformRole = 0;
  for (const batch of chunk(plan.platformRoles, 250)) {
    const params: Array<string> = [];
    const tuples = batch.map((row) => {
      params.push(row.user_id, row.role_key);
      const base = params.length - 2;
      return `($${base + 1}::uuid,$${base + 2}::text)`;
    });
    const result = (await sql.unsafe(
      `INSERT INTO "user_platform_roles" ("user_id","role_id")
       SELECT v.user_id, r."id"
         FROM (VALUES ${tuples.join(',')}) AS v(user_id,role_key)
         JOIN "platform_roles" r ON r."key" = v.role_key
       ON CONFLICT DO NOTHING RETURNING 1 AS inserted;`,
      params,
    )) as unknown as Array<{ inserted: number }>;
    platformRole += result.length;
  }

  return { user: users, business: businesses, store: stores, membership, platformRole };
}

/** A stable ordering helper for anything that iterates stores. */
export function orderedStores(plan: IdentityPlan): SeededStore[] {
  return [...plan.accounts.stores].sort((a, b) => a.index - b.index);
}

/** Deterministic pick of a store for tests that need "some store". */
export function someStore(plan: IdentityPlan, seed: number): SeededStore {
  return pick(seedRandom(seed), orderedStores(plan));
}
