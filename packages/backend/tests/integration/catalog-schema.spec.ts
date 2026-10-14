// T019b verification against real PostgreSQL: the catalog schema invariants
// that unit mocks CANNOT prove. Skips honestly without DATABASE_URL or a
// reachable DB (T003 contract); CI runs it live.
//
// Proves: composite FK rejects cross-store variants at the DB boundary,
// duplicate SKU collides per store only, slugs isolate per store, category
// cycles are rejected (self-loop by CHECK, longer chains by the service's
// locked walk), RESTRICT blocks deleting in-use parents, and the migration
// applies from an empty database.

import { describe, expect, it } from 'vitest';
import { resetEnvCache } from '@shopscale/config';
import { CategoryError, createCategory, listCategories, reparentCategory } from '../../src/catalog/category.service.js';
import {
  openAdminConnection,
  requireDatabaseUrl,
  resolveMigrationsDir,
  runMigrations,
} from '../../src/platform/database.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const migrationsDir = resolveMigrationsDir(repoRoot);

type Sql = Awaited<ReturnType<typeof openAdminConnection>>;

async function connectOrSkip() {
  resetEnvCache();
  let url: string;
  try {
    url = requireDatabaseUrl();
  } catch {
    console.warn('SKIP: DATABASE_URL not configured; start infra first (T004).');
    return null;
  }
  const sql = openAdminConnection(url);
  try {
    await sql`SELECT 1`;
    return sql;
  } catch {
    await sql.end();
    console.warn('SKIP: database unreachable; start infra first (T004).');
    return null;
  }
}

async function seedStore(sql: Sql, suffix: string): Promise<string> {
  // Self-contained store graph; cleanup removes it by the t019 marker.
  const users = (await sql.unsafe(
    `INSERT INTO "users" ("email_normalized","password_hash") VALUES ($1,'x') RETURNING "id";`,
    [`t019.${suffix}@example.com`],
  )) as unknown as Array<{ id: string }>;
  const businesses = (await sql.unsafe(
    `INSERT INTO "businesses" ("owner_user_id") VALUES ($1) RETURNING "id";`,
    [users[0]!.id],
  )) as unknown as Array<{ id: string }>;
  const stores = (await sql.unsafe(
    `INSERT INTO "stores" ("business_id","slug","name","status") VALUES ($1,$2,$3,'active') RETURNING "id";`,
    [businesses[0]!.id, `t019-${suffix}`, `T019 ${suffix}`],
  )) as unknown as Array<{ id: string }>;
  return stores[0]!.id;
}

async function cleanup(sql: Sql): Promise<void> {
  await sql.unsafe(`DELETE FROM "product_publications" WHERE "product_id" IN (SELECT "id" FROM "products" WHERE "slug" LIKE 't019-%');`);
  await sql.unsafe(`DELETE FROM "product_variants" WHERE "sku" LIKE 'T019-%';`);
  await sql.unsafe(`DELETE FROM "products" WHERE "slug" LIKE 't019-%';`);
  await sql.unsafe(`DELETE FROM "categories" WHERE "slug" LIKE 't019-%';`);
  await sql.unsafe(`DELETE FROM "stores" WHERE "slug" LIKE 't019-%';`);
  // Scope business/user deletion to THIS spec's fixtures only: businesses
  // owned by t019 users, never "every business without a store".
  await sql.unsafe(
    `DELETE FROM "businesses" WHERE "owner_user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" LIKE 't019.%');`,
  );
  await sql.unsafe(`DELETE FROM "users" WHERE "email_normalized" LIKE 't019.%';`);
}

async function insertProduct(sql: Sql, storeId: string, slug: string, categoryId?: string): Promise<string> {
  const rows = (await sql.unsafe(
    `INSERT INTO "products" ("store_id","category_id","slug","title") VALUES ($1,$2,$3,$4) RETURNING "id";`,
    [storeId, categoryId ?? null, slug, `Product ${slug}`],
  )) as unknown as Array<{ id: string }>;
  return rows[0]!.id;
}

describe('catalog schema boundaries (T019b)', () => {
  it('rejects cross-store variants, duplicate SKUs, and keeps slugs per-store', async () => {
    const sql = await connectOrSkip();
    if (!sql) return;
    try {
      await runMigrations(sql, migrationsDir);
      await cleanup(sql);
      const storeA = await seedStore(sql, 'store-a');
      const storeB = await seedStore(sql, 'store-b');
      const productA = await insertProduct(sql, storeA, 't019-lamp');

      // Composite FK: variant claiming store B on store A's product fails.
      await expect(
        sql.unsafe(`INSERT INTO "product_variants" ("product_id","store_id","sku","price_cents") VALUES ($1,$2,'T019-XSKU',1000);`, [
          productA,
          storeB,
        ]),
      ).rejects.toThrow(/product_variants_product_fk|violates foreign key/);

      // Valid variant, then its twin in the SAME store collides on SKU.
      await sql.unsafe(
        `INSERT INTO "product_variants" ("product_id","store_id","sku","price_cents") VALUES ($1,$2,'T019-XSKU',1000);`,
        [productA, storeA],
      );
      await expect(
        sql.unsafe(`INSERT INTO "product_variants" ("product_id","store_id","sku","price_cents") VALUES ($1,$2,'T019-XSKU',2000);`, [
          productA,
          storeA,
        ]),
      ).rejects.toThrow(/product_variants_store_sku_uniq|duplicate key/);

      // Same SKU in the OTHER store is legal (per-store uniqueness).
      const productB = await insertProduct(sql, storeB, 't019-lamp');
      await sql.unsafe(
        `INSERT INTO "product_variants" ("product_id","store_id","sku","price_cents") VALUES ($1,$2,'T019-XSKU',900);`,
        [productB, storeB],
      );

      // Same slug in the other store is legal; same slug same store collides.
      await expect(
        sql.unsafe(`INSERT INTO "products" ("store_id","slug","title") VALUES ($1,'t019-lamp','Dup');`, [storeA]),
      ).rejects.toThrow(/products_store_slug_uniq|duplicate key/);
    } finally {
      await cleanup(sql);
      await sql.end();
    }
  });

  it('rejects category cycles and blocks deleting in-use parents', async () => {
    const sql = await connectOrSkip();
    if (!sql) return;
    try {
      await runMigrations(sql, migrationsDir);
      await cleanup(sql);

      const root = await createCategory({ slug: 't019-electronics', name: 'Electronics' }, sql);
      const child = await createCategory({ slug: 't019-phones', name: 'Phones', parentId: root.id }, sql);
      expect(child.path).toBe('/t019-electronics/t019-phones/');

      // Self-loop: rejected by DB CHECK even if service guard were bypassed.
      await expect(
        sql.unsafe(`UPDATE "categories" SET "parent_id" = "id" WHERE "id" = $1;`, [root.id]),
      ).rejects.toThrow(/categories_no_self_parent|violates check constraint/);

      // Longer cycle: service walk rejects root-under-child.
      await expect(reparentCategory(root.id, child.id, sql)).rejects.toMatchObject({
        failure: 'CATEGORY_CYCLE',
      });

      // Legal re-parent rewrites the subtree path in one statement.
      const grandchild = await createCategory({ slug: 't019-ios', name: 'iOS', parentId: child.id }, sql);
      const secondRoot = await createCategory({ slug: 't019-home', name: 'Home' }, sql);
      const moved = await reparentCategory(child.id, secondRoot.id, sql);
      expect(moved.path).toBe('/t019-home/t019-phones/');
      const all = await listCategories(sql);
      expect(all.find((c) => c.id === grandchild.id)?.path).toBe('/t019-home/t019-phones/t019-ios/');

      // RESTRICT: a parent with children cannot be deleted.
      await expect(reparentCategory(root.id, null, sql)).resolves.toBeDefined();
      await expect(
        sql.unsafe(`DELETE FROM "categories" WHERE "id" = $1;`, [secondRoot.id]),
      ).rejects.toThrow(/violates foreign key|RESTRICT|restrict/);

      // Nonexistent parent is NOT_FOUND, never a silent root move.
      await expect(reparentCategory(child.id, '00000000-0000-0000-0000-000000000000', sql)).rejects.toMatchObject({
        failure: 'NOT_FOUND',
      });
      await expect(reparentCategory('00000000-0000-0000-0000-000000000000', null, sql)).rejects.toBeInstanceOf(
        CategoryError,
      );
    } finally {
      await cleanup(sql);
      await sql.end();
    }
  });
});
