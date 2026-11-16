// T044 integration verification: High-concurrency stock contention.
// Invariants proven:
// 1. 500 concurrent reservation requests competing for 50 units of stock.
// 2. Exactly 50 requests succeed; exactly 450 fail with INSUFFICIENT_STOCK.
// 3. PostgreSQL atomic row-lock predicate ("on_hand" - "reserved") >= $1 prevents overselling.
// 4. Zero deadlocks: deterministic row locking and conditional updates.
// 5. Final database state: on_hand = 50, reserved = 50, available = 0.
// 6. Movement ledger records sum(delta_reserved) = exactly 50.

import { describe, expect, it } from 'vitest';
import { resetEnvCache } from '@shopscale/config';
import {
  findMigrationsDir,
  openAdminConnection,
  requireDatabaseUrl,
  runMigrations,
} from '../../src/platform/database.js';
import { InventoryService } from '../../src/inventory/inventory.service.js';
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

async function cleanup(sql: Sql, prefix: string): Promise<void> {
  await sql.unsafe(
    `DELETE FROM "stock_movements" WHERE "store_id" IN (SELECT "id" FROM "stores" WHERE "slug" LIKE $1);`,
    [`${prefix}-%`],
  );
  await sql.unsafe(
    `DELETE FROM "stock_reservations" WHERE "store_id" IN (SELECT "id" FROM "stores" WHERE "slug" LIKE $1);`,
    [`${prefix}-%`],
  );
  await sql.unsafe(
    `DELETE FROM "inventory" WHERE "store_id" IN (SELECT "id" FROM "stores" WHERE "slug" LIKE $1);`,
    [`${prefix}-%`],
  );
  await sql.unsafe(`DELETE FROM "product_variants" WHERE "sku" LIKE $1;`, [`${prefix.toUpperCase()}-%`]);
  await sql.unsafe(`DELETE FROM "products" WHERE "slug" LIKE $1;`, [`${prefix}-%`]);
  await sql.unsafe(`DELETE FROM "stores" WHERE "slug" LIKE $1;`, [`${prefix}-%`]);
  await sql.unsafe(
    `DELETE FROM "businesses" WHERE "owner_user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" LIKE $1);`,
    [`${prefix}.%`],
  );
  await sql.unsafe(`DELETE FROM "users" WHERE "email_normalized" LIKE $1;`, [`${prefix}.%`]);
}

describe('Cross-Channel Stock Contention Concurrency (T044)', () => {
  it('proves 500 concurrent buyers competing for 50 stock units never oversell (G2, IN-3)', async () => {
    const sql = await connectOrSkip();
    if (!sql) return;

    await runMigrations(sql, migrationsDir);
    const prefix = 't044-race';
    await cleanup(sql, prefix);

    try {
      // 1. Seed user, business, store, product, and target variant
      const userRows = (await sql.unsafe(
        `INSERT INTO "users" ("email_normalized", "password_hash") VALUES ($1, 'x') RETURNING "id";`,
        [`${prefix}.seller@example.com`],
      )) as unknown as Array<{ id: string }>;
      const userId = userRows[0]!.id;

      const bizRows = (await sql.unsafe(
        `INSERT INTO "businesses" ("owner_user_id") VALUES ($1) RETURNING "id";`,
        [userId],
      )) as unknown as Array<{ id: string }>;
      const bizId = bizRows[0]!.id;

      const storeRows = (await sql.unsafe(
        `INSERT INTO "stores" ("business_id", "slug", "name", "status") VALUES ($1, $2, 'Race Store', 'active') RETURNING "id";`,
        [bizId, `${prefix}-store`],
      )) as unknown as Array<{ id: string }>;
      const storeId = storeRows[0]!.id;

      const productRows = (await sql.unsafe(
        `INSERT INTO "products" ("store_id", "slug", "title", "status") VALUES ($1, $2, 'Limited Sneaker', 'active') RETURNING "id";`,
        [storeId, `${prefix}-sneaker`],
      )) as unknown as Array<{ id: string }>;
      const productId = productRows[0]!.id;

      const variantRows = (await sql.unsafe(
        `INSERT INTO "product_variants" ("store_id", "product_id", "sku", "price_cents", "status")
         VALUES ($1, $2, 'T044-SNK-LIMITED', 19900, 'active') RETURNING "id";`,
        [storeId, productId],
      )) as unknown as Array<{ id: string }>;
      const variantId = variantRows[0]!.id;

      // Seed initial stock: on_hand = 50, reserved = 0
      const INITIAL_STOCK = 50;
      const TOTAL_CONCURRENT_BUYERS = 500;

      await sql.unsafe(
        `INSERT INTO "inventory" ("variant_id", "store_id", "on_hand", "reserved")
         VALUES ($1, $2, $3, 0);`,
        [variantId, storeId, INITIAL_STOCK],
      );

      // Verify baseline stock
      const initialStockRows = (await sql.unsafe(
        `SELECT "on_hand", "reserved" FROM "inventory" WHERE "variant_id" = $1;`,
        [variantId],
      )) as unknown as Array<{ on_hand: number; reserved: number }>;
      expect(initialStockRows[0]?.on_hand).toBe(INITIAL_STOCK);
      expect(initialStockRows[0]?.reserved).toBe(0);

      // 2. Launch 500 concurrent buyers competing across channels
      const inventoryService = new InventoryService(sql);

      const buyers = Array.from({ length: TOTAL_CONCURRENT_BUYERS }, (_, index) => {
        const isMarketplace = index % 2 === 0;
        const channelTag = isMarketplace ? 'mkt' : 'str';
        const checkoutId = `chk-${prefix}-${channelTag}-${index}`;

        return inventoryService.reserve({
          checkoutId,
          items: [{ variantId, qty: 1 }],
          ttlSeconds: 600,
        });
      });

      const startTime = performance.now();
      const results = await Promise.all(buyers);
      const durationMs = performance.now() - startTime;

      console.info(
        `[T044 Concurrency] Processed ${TOTAL_CONCURRENT_BUYERS} concurrent reservations in ${durationMs.toFixed(2)}ms (${(TOTAL_CONCURRENT_BUYERS / (durationMs / 1000)).toFixed(1)} req/s)`,
      );

      // 3. Partition results
      const successes = results.filter((r) => r.ok === true);
      const rejections = results.filter((r) => r.ok === false);

      // Core Invariant 1: Exactly 50 reservations succeed
      expect(successes).toHaveLength(INITIAL_STOCK);

      // Core Invariant 2: Exactly 450 reservations fail with INSUFFICIENT_STOCK
      expect(rejections).toHaveLength(TOTAL_CONCURRENT_BUYERS - INITIAL_STOCK);
      for (const rej of rejections) {
        expect(rej.ok).toBe(false);
        if (!rej.ok) {
          expect(rej.code).toBe('INSUFFICIENT_STOCK');
          expect(rej.available).toBe(0);
        }
      }

      // 4. Assert SQL database invariants
      const finalInventory = (await sql.unsafe(
        `SELECT "on_hand", "reserved" FROM "inventory" WHERE "variant_id" = $1;`,
        [variantId],
      )) as unknown as Array<{ on_hand: number; reserved: number }>;

      // on_hand remains 50; reserved reached 50; available is 0
      expect(finalInventory[0]?.on_hand).toBe(INITIAL_STOCK);
      expect(finalInventory[0]?.reserved).toBe(INITIAL_STOCK);
      expect(finalInventory[0]!.on_hand - finalInventory[0]!.reserved).toBe(0);

      // Core Invariant 3: Active reservation rows count equals 50
      const reservationCount = (await sql.unsafe(
        `SELECT count(*)::int AS count FROM "stock_reservations" WHERE "variant_id" = $1 AND "status" = 'active';`,
        [variantId],
      )) as unknown as Array<{ count: number }>;
      expect(reservationCount[0]?.count).toBe(INITIAL_STOCK);

      // Core Invariant 4: Sum of delta_reserved in stock_movements equals exactly 50
      const movementSum = (await sql.unsafe(
        `SELECT coalesce(sum("delta_reserved"), 0)::int AS total FROM "stock_movements" WHERE "variant_id" = $1;`,
        [variantId],
      )) as unknown as Array<{ total: number }>;
      expect(movementSum[0]?.total).toBe(INITIAL_STOCK);

      // Core Invariant 5: Zero delta_on_hand changes during reservation
      const onHandSum = (await sql.unsafe(
        `SELECT coalesce(sum("delta_on_hand"), 0)::int AS total FROM "stock_movements" WHERE "variant_id" = $1;`,
        [variantId],
      )) as unknown as Array<{ total: number }>;
      expect(onHandSum[0]?.total).toBe(0);

      // Core Invariant 6: Zero oversold units (on_hand >= reserved is strictly satisfied)
      expect(finalInventory[0]!.reserved).toBeLessThanOrEqual(finalInventory[0]!.on_hand);
    } finally {
      await cleanup(sql, prefix);
      await sql.end();
    }
  }, 120_000);
});
