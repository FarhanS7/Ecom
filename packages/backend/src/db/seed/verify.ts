// @shopscale/backend/db/seed/verify - T028b verification (counts/FKs/distributions).
//
// `docs/operations/commands.md` promises `pnpm seed:verify` reports
// "counts/FKs/distributions/ledger". Counts, foreign keys, and distributions are
// implemented here; the ledger half is about order/payment rows, which do not
// exist until T077, so it is reported as not applicable rather than faked.
//
// Two kinds of proof, on purpose:
//   * checksums — a per-table digest over the DOMAIN columns. Two runs of the
//     same seed must agree; a different seed must not. Credential columns
//     (`password_hash`, token hashes) are excluded: they are salted secrets, not
//     reproducible data, and they must never appear in a digest an operator
//     prints.
//   * invariants — the facts a seed can get wrong even when it is deterministic:
//     orphaned children, a product whose `min_price_cents` disagrees with its
//     active variants, a product with no active variant at all.

import { createHash } from 'node:crypto';
import type { Sql } from 'postgres';
import { canonicalJson } from './random.js';
import type { IdentityPlan } from './identity.js';
import type { CatalogPlan } from './catalog.js';
import type { ThemePlan } from './themes.js';

export interface SeedPlanBundle {
  identity: IdentityPlan;
  catalog: CatalogPlan;
  themes: ThemePlan;
}

// --- pure digests over the plan ------------------------------------------

/** Canonical, credential-free rendering of one planned row. */
function planRowKey(table: string, row: Record<string, unknown>): string {
  const entries = Object.entries(row)
    .filter(([column]) => column !== 'password_hash')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `${table}|${entries.map(([column, value]) => `${column}=${canonicalJson(value)}`).join(';')}`;
}

/**
 * Per-table digests of the plan. Sorted by the row key so the digest does not
 * depend on array order — the DB checksum cannot see order either, and the two
 * must be comparable in spirit.
 */
export function planChecksums(plan: SeedPlanBundle): Record<string, string> {
  const tables: Record<string, Array<Record<string, unknown>>> = {
    users: plan.identity.users as unknown as Array<Record<string, unknown>>,
    businesses: plan.identity.businesses as unknown as Array<Record<string, unknown>>,
    stores: plan.identity.stores as unknown as Array<Record<string, unknown>>,
    store_memberships: plan.identity.memberships as unknown as Array<Record<string, unknown>>,
    user_platform_roles: plan.identity.platformRoles as unknown as Array<Record<string, unknown>>,
    categories: plan.catalog.categories as unknown as Array<Record<string, unknown>>,
    products: plan.catalog.products as unknown as Array<Record<string, unknown>>,
    product_variants: plan.catalog.variants as unknown as Array<Record<string, unknown>>,
    product_publications: plan.catalog.publications as unknown as Array<Record<string, unknown>>,
    store_themes: plan.themes.themes as unknown as Array<Record<string, unknown>>,
    store_content: plan.themes.content as unknown as Array<Record<string, unknown>>,
  };
  const digests: Record<string, string> = {};
  for (const [table, rows] of Object.entries(tables)) {
    const digest = createHash('md5');
    for (const key of rows.map((row) => planRowKey(table, row)).sort()) {
      digest.update(key);
      digest.update('\n');
    }
    digests[table] = digest.digest('hex');
  }
  return digests;
}

/** One digest over every table, for a one-line comparison between two runs. */
export function planChecksum(plan: SeedPlanBundle): string {
  const digests = planChecksums(plan);
  const combined = createHash('md5');
  for (const table of Object.keys(digests).sort()) {
    combined.update(`${table}=${digests[table]}\n`);
  }
  return combined.digest('hex');
}

// --- live checksums ------------------------------------------------------

interface ChecksumSpec {
  table: string;
  columns: string[];
  orderBy: string[];
  where: string;
}

const TIMESTAMP_COLUMNS = new Set(['created_at', 'updated_at', 'published_at']);

/**
 * Render a column for a digest. Timestamps are formatted in UTC explicitly:
 * `timestamptz::text` depends on the session TimeZone, which would make two runs
 * of the same data disagree for a reason that has nothing to do with the seed.
 */
function columnExpression(column: string): string {
  const quoted = `"${column}"`;
  if (TIMESTAMP_COLUMNS.has(column)) {
    return `coalesce(to_char(${quoted} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), '<null>')`;
  }
  return `coalesce(${quoted}::text, '<null>')`;
}

// Subqueries (not string surgery): every marker-scoped table needs the SAME
// "which ids are seeded" set, and building it by rewriting another predicate is
// exactly the kind of cleverness that silently selects the wrong column.
const SEED_USER_IDS = `(SELECT "id" FROM "users" WHERE "email_normalized" LIKE 'seed.%')`;
const SEED_STORE_IDS = `(SELECT "id" FROM "stores" WHERE "slug" LIKE 'seed-%')`;
const SEED_PRODUCT_IDS = `(SELECT "id" FROM "products" WHERE "slug" LIKE 'seed-%')`;
const SEED_BUSINESS_IDS = `(SELECT "business_id" FROM "stores" WHERE "slug" LIKE 'seed-%')`;

// Credential columns are absent by design (see the module comment).
const CHECKSUM_SPECS: readonly ChecksumSpec[] = [
  {
    table: 'users',
    columns: ['id', 'email_normalized', 'status', 'created_at', 'updated_at'],
    orderBy: ['id'],
    where: `"email_normalized" LIKE 'seed.%'`,
  },
  {
    table: 'businesses',
    columns: ['id', 'owner_user_id', 'status', 'commission_bps', 'created_at'],
    orderBy: ['id'],
    where: `"id" IN ${SEED_BUSINESS_IDS}`,
  },
  {
    table: 'stores',
    columns: ['id', 'business_id', 'slug', 'name', 'status', 'created_at'],
    orderBy: ['id'],
    where: `"slug" LIKE 'seed-%'`,
  },
  {
    table: 'store_memberships',
    columns: ['store_id', 'user_id', 'role_id', 'status', 'version'],
    orderBy: ['store_id', 'user_id'],
    where: `"store_id" IN ${SEED_STORE_IDS}`,
  },
  {
    table: 'user_platform_roles',
    columns: ['user_id', 'role_id'],
    orderBy: ['user_id', 'role_id'],
    where: `"user_id" IN ${SEED_USER_IDS}`,
  },
  {
    table: 'categories',
    columns: ['id', 'parent_id', 'slug', 'name', 'path'],
    orderBy: ['id'],
    where: `"slug" LIKE 'seed-%'`,
  },
  {
    table: 'products',
    columns: [
      'id',
      'store_id',
      'category_id',
      'slug',
      'title',
      'description',
      'brand',
      'status',
      'attributes',
      'min_price_cents',
      'currency',
      'version',
      'created_at',
      'updated_at',
    ],
    orderBy: ['id'],
    where: `"slug" LIKE 'seed-%'`,
  },
  {
    table: 'product_variants',
    columns: ['id', 'product_id', 'store_id', 'sku', 'price_cents', 'attributes', 'status'],
    orderBy: ['id'],
    where: `"sku" LIKE 'SEED-%'`,
  },
  {
    table: 'product_publications',
    columns: ['product_id', 'marketplace_enabled', 'store_enabled', 'published_at'],
    orderBy: ['product_id'],
    where: `"product_id" IN (SELECT "id" FROM "products" WHERE "slug" LIKE 'seed-%')`,
  },
  {
    table: 'store_themes',
    columns: ['store_id', 'version', 'approved_tokens', 'updated_at'],
    orderBy: ['store_id'],
    where: `"store_id" IN (SELECT "id" FROM "stores" WHERE "slug" LIKE 'seed-%')`,
  },
  {
    table: 'store_content',
    columns: ['store_id', 'version', 'featured_ids', 'headline', 'socials', 'swatches', 'updated_at'],
    orderBy: ['store_id'],
    where: `"store_id" IN ${SEED_STORE_IDS}`,
  },
];

/** Per-table digests computed from the DATABASE (not from the plan). */
export async function databaseChecksums(sql: Sql): Promise<Record<string, string>> {
  const digests: Record<string, string> = {};
  for (const spec of CHECKSUM_SPECS) {
    const concatenated = spec.columns.map(columnExpression).join(`, '|', `);
    const order = spec.orderBy.map((column) => `"${column}"`).join(', ');
    const rows = (await sql.unsafe(
      `SELECT md5(coalesce(string_agg(md5(concat_ws('|', ${concatenated})), '' ORDER BY ${order}), '')) AS digest
         FROM "${spec.table}" WHERE ${spec.where};`,
    )) as unknown as Array<{ digest: string }>;
    digests[spec.table] = rows[0]?.digest ?? '';
  }
  return digests;
}

export async function databaseChecksum(sql: Sql): Promise<string> {
  const digests = await databaseChecksums(sql);
  const combined = createHash('md5');
  for (const table of Object.keys(digests).sort()) {
    combined.update(`${table}=${digests[table]}\n`);
  }
  return combined.digest('hex');
}

// --- live counts ---------------------------------------------------------

export interface TableCount {
  table: string;
  rows: number;
}

const COUNT_SPECS: ReadonlyArray<{ table: string; where: string }> = [
  { table: 'users', where: `"email_normalized" LIKE 'seed.%'` },
  { table: 'businesses', where: `"id" IN ${SEED_BUSINESS_IDS}` },
  { table: 'stores', where: `"slug" LIKE 'seed-%'` },
  { table: 'store_memberships', where: `"store_id" IN ${SEED_STORE_IDS}` },
  { table: 'user_platform_roles', where: `"user_id" IN ${SEED_USER_IDS}` },
  { table: 'categories', where: `"slug" LIKE 'seed-%'` },
  { table: 'products', where: `"slug" LIKE 'seed-%'` },
  { table: 'product_variants', where: `"sku" LIKE 'SEED-%'` },
  { table: 'product_publications', where: `"product_id" IN ${SEED_PRODUCT_IDS}` },
  { table: 'store_themes', where: `"store_id" IN ${SEED_STORE_IDS}` },
  { table: 'store_content', where: `"store_id" IN ${SEED_STORE_IDS}` },
];

export async function tableCounts(sql: Sql): Promise<TableCount[]> {
  const counts: TableCount[] = [];
  for (const spec of COUNT_SPECS) {
    const rows = (await sql.unsafe(
      `SELECT count(*)::int AS rows FROM "${spec.table}" WHERE ${spec.where};`,
    )) as unknown as Array<{ rows: number }>;
    counts.push({ table: spec.table, rows: rows[0]?.rows ?? 0 });
  }
  return counts;
}

// --- referential integrity ----------------------------------------------

export interface IntegrityCheck {
  name: string;
  detail: string;
  orphans: number;
}

const INTEGRITY_SQL: ReadonlyArray<{ name: string; detail: string; query: string }> = [
  {
    name: 'product_variants_product_fk',
    detail: 'seeded variant whose (store_id, product_id) does not resolve — the composite FK boundary',
    query: `SELECT count(*)::int AS n FROM "product_variants" v
              LEFT JOIN "products" p ON p."id" = v."product_id" AND p."store_id" = v."store_id"
             WHERE v."sku" LIKE 'SEED-%' AND p."id" IS NULL`,
  },
  {
    name: 'product_publications_product_fk',
    detail: 'seeded publication without its product',
    query: `SELECT count(*)::int AS n FROM "product_publications" pub
              LEFT JOIN "products" p ON p."id" = pub."product_id"
             WHERE p."slug" LIKE 'seed-%' AND p."id" IS NULL`,
  },
  {
    name: 'products_store_fk',
    detail: 'seeded product without a store',
    query: `SELECT count(*)::int AS n FROM "products" pr
              LEFT JOIN "stores" s ON s."id" = pr."store_id"
             WHERE pr."slug" LIKE 'seed-%' AND s."id" IS NULL`,
  },
  {
    name: 'products_category_fk',
    detail: 'seeded product pointing at a missing category',
    query: `SELECT count(*)::int AS n FROM "products" pr
              LEFT JOIN "categories" c ON c."id" = pr."category_id"
             WHERE pr."slug" LIKE 'seed-%' AND pr."category_id" IS NOT NULL AND c."id" IS NULL`,
  },
  {
    name: 'categories_parent_fk',
    detail: 'seeded category with a missing parent',
    query: `SELECT count(*)::int AS n FROM "categories" c
              LEFT JOIN "categories" parent ON parent."id" = c."parent_id"
             WHERE c."slug" LIKE 'seed-%' AND c."parent_id" IS NOT NULL AND parent."id" IS NULL`,
  },
  {
    name: 'store_memberships_store_fk',
    detail: 'seeded membership without its store',
    query: `SELECT count(*)::int AS n FROM "store_memberships" m
              LEFT JOIN "stores" s ON s."id" = m."store_id"
             WHERE s."slug" LIKE 'seed-%' AND s."id" IS NULL`,
  },
  {
    name: 'store_memberships_user_fk',
    detail: 'seeded membership without a seeded user',
    query: `SELECT count(*)::int AS n FROM "store_memberships" m
              LEFT JOIN "users" u ON u."id" = m."user_id"
             WHERE m."store_id" IN (SELECT "id" FROM "stores" WHERE "slug" LIKE 'seed-%')
               AND (u."id" IS NULL OR u."email_normalized" NOT LIKE 'seed.%')`,
  },
  {
    name: 'store_memberships_role_fk',
    detail: 'seeded membership whose role is not a known store role',
    query: `SELECT count(*)::int AS n FROM "store_memberships" m
              LEFT JOIN "store_roles" r ON r."id" = m."role_id"
             WHERE m."store_id" IN (SELECT "id" FROM "stores" WHERE "slug" LIKE 'seed-%')
               AND r."id" IS NULL`,
  },
  {
    name: 'user_platform_roles_role_fk',
    detail: 'seeded platform role link whose role is not a known platform role',
    query: `SELECT count(*)::int AS n FROM "user_platform_roles" upr
              LEFT JOIN "platform_roles" r ON r."id" = upr."role_id"
             WHERE upr."user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" LIKE 'seed.%')
               AND r."id" IS NULL`,
  },
  {
    name: 'businesses_owner_fk',
    detail: 'seeded business whose owner is missing or not seeded',
    query: `SELECT count(*)::int AS n FROM "businesses" b
              LEFT JOIN "users" u ON u."id" = b."owner_user_id"
             WHERE b."id" IN (SELECT "business_id" FROM "stores" WHERE "slug" LIKE 'seed-%')
               AND (u."id" IS NULL OR u."email_normalized" NOT LIKE 'seed.%')`,
  },
  {
    name: 'stores_business_fk',
    detail: 'seeded store whose business is missing',
    query: `SELECT count(*)::int AS n FROM "stores" s
              LEFT JOIN "businesses" b ON b."id" = s."business_id"
             WHERE s."slug" LIKE 'seed-%' AND b."id" IS NULL`,
  },
  {
    name: 'stores_one_business_each',
    detail: 'a prepared business used by more than one seeded store (D-007)',
    query: `SELECT count(*)::int AS n FROM (
              SELECT "business_id" FROM "stores" WHERE "slug" LIKE 'seed-%'
               GROUP BY "business_id" HAVING count(*) > 1
            ) dupes`,
  },
  {
    name: 'store_themes_store_fk',
    detail: 'seeded theme without its store',
    query: `SELECT count(*)::int AS n FROM "store_themes" t
              LEFT JOIN "stores" s ON s."id" = t."store_id"
             WHERE s."slug" LIKE 'seed-%' AND s."id" IS NULL`,
  },
  {
    name: 'store_content_store_fk',
    detail: 'seeded storefront content without its store',
    query: `SELECT count(*)::int AS n FROM "store_content" c
              LEFT JOIN "stores" s ON s."id" = c."store_id"
             WHERE s."slug" LIKE 'seed-%' AND s."id" IS NULL`,
  },
  {
    name: 'store_content_featured_fk',
    detail: 'featured product id that is not a product of THAT store',
    query: `SELECT count(*)::int AS n FROM "store_content" c,
              LATERAL jsonb_array_elements_text(c."featured_ids") AS featured(id)
             WHERE c."store_id" IN (SELECT "id" FROM "stores" WHERE "slug" LIKE 'seed-%')
               AND NOT EXISTS (
                 SELECT 1 FROM "products" p
                  WHERE p."id" = featured.id::uuid AND p."store_id" = c."store_id"
               )`,
  },
];

export async function integrityChecks(sql: Sql): Promise<IntegrityCheck[]> {
  const checks: IntegrityCheck[] = [];
  for (const spec of INTEGRITY_SQL) {
    const rows = (await sql.unsafe(spec.query)) as unknown as Array<{ n: number }>;
    checks.push({ name: spec.name, detail: spec.detail, orphans: rows[0]?.n ?? 0 });
  }
  return checks;
}

// --- distributions + derived invariants ---------------------------------

export interface DistributionFacts {
  stores: number;
  emptyStores: number;
  products: number;
  variants: number;
  activeVariants: number;
  productsWithoutActiveVariant: number;
  derivedPriceMismatches: number;
  storeChannelVisible: number;
  marketplaceVisible: number;
  draftProductsWithChannelFlag: number;
  archivedProducts: number;
  categories: number;
}

export async function distributionFacts(sql: Sql): Promise<DistributionFacts> {
  const scalar = async (query: string): Promise<number> => {
    const rows = (await sql.unsafe(query)) as unknown as Array<{ n: number }>;
    return rows[0]?.n ?? 0;
  };
  const seeded = `"slug" LIKE 'seed-%'`;
  return {
    stores: await scalar(`SELECT count(*)::int AS n FROM "stores" WHERE "slug" LIKE 'seed-%';`),
    emptyStores: await scalar(
      `SELECT count(*)::int AS n FROM "stores" s WHERE s."slug" LIKE 'seed-%'
         AND NOT EXISTS (SELECT 1 FROM "products" p WHERE p."store_id" = s."id");`,
    ),
    products: await scalar(`SELECT count(*)::int AS n FROM "products" WHERE ${seeded};`),
    variants: await scalar(`SELECT count(*)::int AS n FROM "product_variants" WHERE "sku" LIKE 'SEED-%';`),
    activeVariants: await scalar(
      `SELECT count(*)::int AS n FROM "product_variants" WHERE "sku" LIKE 'SEED-%' AND "status" = 'active';`,
    ),
    // Both of these must be zero: they are the T019 invariants the seed must not
    // be able to violate even when it is deterministic.
    productsWithoutActiveVariant: await scalar(
      `SELECT count(*)::int AS n FROM "products" p WHERE p.${seeded}
         AND NOT EXISTS (SELECT 1 FROM "product_variants" v WHERE v."product_id" = p."id" AND v."status" = 'active');`,
    ),
    derivedPriceMismatches: await scalar(
      `SELECT count(*)::int AS n FROM "products" p WHERE p.${seeded}
         AND p."min_price_cents" <> coalesce(
           (SELECT min(v."price_cents") FROM "product_variants" v
             WHERE v."product_id" = p."id" AND v."status" = 'active'), 0);`,
    ),
    storeChannelVisible: await scalar(
      `SELECT count(*)::int AS n FROM "products" p
         JOIN "product_publications" pub ON pub."product_id" = p."id"
        WHERE p.${seeded} AND p."status" = 'active' AND pub."store_enabled" = true;`,
    ),
    marketplaceVisible: await scalar(
      `SELECT count(*)::int AS n FROM "products" p
         JOIN "product_publications" pub ON pub."product_id" = p."id"
        WHERE p.${seeded} AND p."status" = 'active' AND pub."marketplace_enabled" = true;`,
    ),
    draftProductsWithChannelFlag: await scalar(
      `SELECT count(*)::int AS n FROM "products" p
         JOIN "product_publications" pub ON pub."product_id" = p."id"
        WHERE p.${seeded} AND p."status" = 'draft' AND (pub."store_enabled" OR pub."marketplace_enabled");`,
    ),
    archivedProducts: await scalar(`SELECT count(*)::int AS n FROM "products" WHERE ${seeded} AND "status" = 'archived';`),
    categories: await scalar(`SELECT count(*)::int AS n FROM "categories" WHERE "slug" LIKE 'seed-%';`),
  };
}

// --- cleanup + the composed report --------------------------------------

/**
 * Remove every seeded row. Scoped entirely by the `seed` markers, so it can
 * never touch another spec's fixtures (the other suites use `t0xx-` markers).
 * Order matters: children before parents.
 */
export async function cleanupSeedData(sql: Sql): Promise<void> {
  await sql.unsafe(
    `DELETE FROM "product_publications" WHERE "product_id" IN (SELECT "id" FROM "products" WHERE "slug" LIKE 'seed-%');`,
  );
  await sql.unsafe(`DELETE FROM "product_variants" WHERE "sku" LIKE 'SEED-%';`);
  await sql.unsafe(`DELETE FROM "products" WHERE "slug" LIKE 'seed-%';`);
  await sql.unsafe(`DELETE FROM "categories" WHERE "slug" LIKE 'seed-%';`);
  await sql.unsafe(`DELETE FROM "store_content" WHERE "store_id" IN (SELECT "id" FROM "stores" WHERE "slug" LIKE 'seed-%');`);
  await sql.unsafe(`DELETE FROM "store_themes" WHERE "store_id" IN (SELECT "id" FROM "stores" WHERE "slug" LIKE 'seed-%');`);
  await sql.unsafe(`DELETE FROM "store_memberships" WHERE "store_id" IN (SELECT "id" FROM "stores" WHERE "slug" LIKE 'seed-%');`);
  await sql.unsafe(`DELETE FROM "stores" WHERE "slug" LIKE 'seed-%';`);
  await sql.unsafe(
    `DELETE FROM "businesses" WHERE "id" NOT IN (SELECT "business_id" FROM "stores")
       AND "owner_user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" LIKE 'seed.%');`,
  );
  await sql.unsafe(
    `DELETE FROM "user_platform_roles" WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" LIKE 'seed.%');`,
  );
  await sql.unsafe(`DELETE FROM "users" WHERE "email_normalized" LIKE 'seed.%';`);
}

export interface SeedVerification {
  counts: TableCount[];
  checksums: Record<string, string>;
  checksum: string;
  integrity: IntegrityCheck[];
  distributions: DistributionFacts;
  /** Human-readable reasons the dataset is NOT valid; empty means it is. */
  failures: string[];
}

export async function verifyDatabase(sql: Sql): Promise<SeedVerification> {
  const counts = await tableCounts(sql);
  const checksums = await databaseChecksums(sql);
  const integrity = await integrityChecks(sql);
  const distributions = await distributionFacts(sql);

  const failures: string[] = [];
  for (const check of integrity) {
    if (check.orphans > 0) failures.push(`${check.name}: ${check.orphans} orphaned row(s) — ${check.detail}`);
  }
  if (distributions.productsWithoutActiveVariant > 0) {
    failures.push(`${distributions.productsWithoutActiveVariant} seeded product(s) have no active variant`);
  }
  if (distributions.derivedPriceMismatches > 0) {
    failures.push(`${distributions.derivedPriceMismatches} seeded product(s) disagree with min(active variant price)`);
  }
  if (distributions.emptyStores < 1) {
    failures.push('no empty store was seeded, so the empty storefront state is not covered');
  }
  if (distributions.draftProductsWithChannelFlag < 1) {
    failures.push('no draft-with-channel-flag product was seeded, so the ADR-0010 case is not covered');
  }
  if (distributions.marketplaceVisible < 1) {
    failures.push('no marketplace-visible product was seeded');
  }
  if (distributions.storeChannelVisible < 1) {
    failures.push('no store-channel-visible product was seeded');
  }

  const combined = createHash('md5');
  for (const table of Object.keys(checksums).sort()) {
    combined.update(`${table}=${checksums[table]}\n`);
  }

  return { counts, checksums, checksum: combined.digest('hex'), integrity, distributions, failures };
}
