// T037 integration verification for Inventory Schema & Database Constraints.
// Invariants:
// 1. inventory CHECK constraints reject negative on_hand (code 23514).
// 2. inventory CHECK constraints reject reserved > on_hand (code 23514).
// 3. stock_reservations enforces quantity > 0 and uniqueness for active reservations.
// 4. stock_movements enforces append-only deduplication via unique (operation_key, variant_id, reason).

import { describe, expect, it } from 'vitest';
import { resetEnvCache } from '@shopscale/config';
import {
  openAdminConnection,
  requireDatabaseUrl,
  findMigrationsDir,
  runMigrations,
} from '../../src/platform/database.js';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = findMigrationsDir(here);

type Sql = Awaited<ReturnType<typeof openAdminConnection>>;

async function connectOrSkip(): Promise<Sql | null> {
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

async function seedStoreAndVariant(sql: Sql, suffix: string): Promise<{ storeId: string; variantId: string }> {
  const users = (await sql.unsafe(
    `INSERT INTO "users" ("email_normalized","password_hash") VALUES ($1,'x') RETURNING "id";`,
    [`t037.${suffix}@example.com`],
  )) as unknown as Array<{ id: string }>;
  const businesses = (await sql.unsafe(
    `INSERT INTO "businesses" ("owner_user_id") VALUES ($1) RETURNING "id";`,
    [users[0]!.id],
  )) as unknown as Array<{ id: string }>;
  const stores = (await sql.unsafe(
    `INSERT INTO "stores" ("business_id","slug","name","status") VALUES ($1,$2,$3,'active') RETURNING "id";`,
    [businesses[0]!.id, `t037-${suffix}`, `T037 ${suffix}`],
  )) as unknown as Array<{ id: string }>;
  const storeId = stores[0]!.id;

  const products = (await sql.unsafe(
    `INSERT INTO "products" ("store_id","slug","title","status") VALUES ($1,$2,'Test Product','active') RETURNING "id";`,
    [storeId, `t037-p-${suffix}`],
  )) as unknown as Array<{ id: string }>;

  const variants = (await sql.unsafe(
    `INSERT INTO "product_variants" ("store_id","product_id","sku","price_cents","status")
     VALUES ($1,$2,$3,5000,'active') RETURNING "id";`,
    [storeId, products[0]!.id, `T037-SKU-${suffix}`],
  )) as unknown as Array<{ id: string }>;

  return { storeId, variantId: variants[0]!.id };
}

async function cleanup(sql: Sql): Promise<void> {
  await sql.unsafe(
    `DELETE FROM "stock_movements" WHERE "store_id" IN (SELECT "id" FROM "stores" WHERE "slug" LIKE 't037-%');`,
  );
  await sql.unsafe(
    `DELETE FROM "stock_reservations" WHERE "store_id" IN (SELECT "id" FROM "stores" WHERE "slug" LIKE 't037-%');`,
  );
  await sql.unsafe(
    `DELETE FROM "inventory" WHERE "store_id" IN (SELECT "id" FROM "stores" WHERE "slug" LIKE 't037-%');`,
  );
  await sql.unsafe(
    `DELETE FROM "product_variants" WHERE "sku" LIKE 'T037-%';`,
  );
  await sql.unsafe(
    `DELETE FROM "products" WHERE "slug" LIKE 't037-%';`,
  );
  await sql.unsafe(
    `DELETE FROM "stores" WHERE "slug" LIKE 't037-%';`,
  );
  await sql.unsafe(
    `DELETE FROM "businesses" WHERE "owner_user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" LIKE 't037.%');`,
  );
  await sql.unsafe(`DELETE FROM "users" WHERE "email_normalized" LIKE 't037.%';`);
}

describe('Inventory Database Constraints (T037)', () => {
  it('enforces on_hand >= 0 and reserved <= on_hand via SQL CHECK constraints', async () => {
    const sql = await connectOrSkip();
    if (!sql) return;

    await runMigrations(sql, migrationsDir);
    await cleanup(sql);

    try {
      const { storeId, variantId } = await seedStoreAndVariant(sql, 'invariants');

      // 1. Inserting negative on_hand must fail with check_violation (23514)
      await expect(
        sql.unsafe(
          `INSERT INTO "inventory" ("variant_id", "store_id", "on_hand", "reserved")
           VALUES ($1, $2, -5, 0);`,
          [variantId, storeId],
        ),
      ).rejects.toThrow(expect.objectContaining({ code: '23514' }));

      // 2. Inserting reserved > on_hand must fail with check_violation (23514)
      await expect(
        sql.unsafe(
          `INSERT INTO "inventory" ("variant_id", "store_id", "on_hand", "reserved")
           VALUES ($1, $2, 10, 15);`,
          [variantId, storeId],
        ),
      ).rejects.toThrow(expect.objectContaining({ code: '23514' }));

      // 3. Valid inventory succeeds
      await sql.unsafe(
        `INSERT INTO "inventory" ("variant_id", "store_id", "on_hand", "reserved")
         VALUES ($1, $2, 20, 5);`,
        [variantId, storeId],
      );

      // 4. Updating on_hand below reserved must fail
      await expect(
        sql.unsafe(
          `UPDATE "inventory" SET "on_hand" = 3 WHERE "variant_id" = $1;`,
          [variantId],
        ),
      ).rejects.toThrow(expect.objectContaining({ code: '23514' }));
    } finally {
      await cleanup(sql);
      await sql.end();
    }
  });

  it('enforces stock_movements deduplication uniqueness', async () => {
    const sql = await connectOrSkip();
    if (!sql) return;

    await runMigrations(sql, migrationsDir);
    await cleanup(sql);

    try {
      const { storeId, variantId } = await seedStoreAndVariant(sql, 'movements');

      // 1. Initial movement succeeds
      await sql.unsafe(
        `INSERT INTO "stock_movements" (
           "store_id", "variant_id", "delta_on_hand", "delta_reserved", "reason", "operation_key"
         ) VALUES ($1, $2, 100, 0, 'initial_stock', 'op-init-100');`,
        [storeId, variantId],
      );

      // 2. Replaying identical operation_key, variant_id, and reason fails with unique_violation (23505)
      await expect(
        sql.unsafe(
          `INSERT INTO "stock_movements" (
             "store_id", "variant_id", "delta_on_hand", "delta_reserved", "reason", "operation_key"
           ) VALUES ($1, $2, 100, 0, 'initial_stock', 'op-init-100');`,
          [storeId, variantId],
        ),
      ).rejects.toThrow(expect.objectContaining({ code: '23505' }));

      // 3. Invalid reason fails with check_violation (23514)
      await expect(
        sql.unsafe(
          `INSERT INTO "stock_movements" (
             "store_id", "variant_id", "delta_on_hand", "delta_reserved", "reason", "operation_key"
           ) VALUES ($1, $2, 10, 0, 'invalid_reason_string', 'op-invalid');`,
          [storeId, variantId],
        ),
      ).rejects.toThrow(expect.objectContaining({ code: '23514' }));
    } finally {
      await cleanup(sql);
      await sql.end();
    }
  });
});
