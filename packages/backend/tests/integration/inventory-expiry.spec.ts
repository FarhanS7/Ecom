// T039 integration verification for Inventory Expiry Sweep & Manual Stock Adjustment.
// Invariants tested:
// 1. releaseExpiredReservations claims expired active reservations via FOR UPDATE SKIP LOCKED.
// 2. Decrements inventory.reserved and marks reservation status = 'expired'.
// 3. Appends movement ledger with reason = 'reservation_expired' and negative delta_reserved.
// 4. adjustStock prevents reducing on_hand below currently active reserved count.
// 5. Store isolation: cross-store adjustments are rejected with NOT_FOUND.

import { describe, expect, it } from 'vitest';
import { resetEnvCache } from '@shopscale/config';
import {
  openAdminConnection,
  requireDatabaseUrl,
  findMigrationsDir,
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

async function seedStoreWithVariant(
  sql: Sql,
  suffix: string,
  onHand: number,
  reserved = 0,
): Promise<{ storeId: string; variantId: string }> {
  const users = (await sql.unsafe(
    `INSERT INTO "users" ("email_normalized","password_hash") VALUES ($1,'x') RETURNING "id";`,
    [`t039.${suffix}@example.com`],
  )) as unknown as Array<{ id: string }>;

  const businesses = (await sql.unsafe(
    `INSERT INTO "businesses" ("owner_user_id") VALUES ($1) RETURNING "id";`,
    [users[0]!.id],
  )) as unknown as Array<{ id: string }>;

  const stores = (await sql.unsafe(
    `INSERT INTO "stores" ("business_id","slug","name","status") VALUES ($1,$2,$3,'active') RETURNING "id";`,
    [businesses[0]!.id, `t039-${suffix}`, `T039 ${suffix}`],
  )) as unknown as Array<{ id: string }>;
  const storeId = stores[0]!.id;

  const products = (await sql.unsafe(
    `INSERT INTO "products" ("store_id","slug","title","status") VALUES ($1,$2,'Test Product','active') RETURNING "id";`,
    [storeId, `t039-p-${suffix}`],
  )) as unknown as Array<{ id: string }>;

  const variants = (await sql.unsafe(
    `INSERT INTO "product_variants" ("store_id","product_id","sku","price_cents","status")
     VALUES ($1,$2,$3,3000,'active') RETURNING "id";`,
    [storeId, products[0]!.id, `T039-SKU-${suffix}`],
  )) as unknown as Array<{ id: string }>;
  const variantId = variants[0]!.id;

  await sql.unsafe(
    `INSERT INTO "inventory" ("variant_id","store_id","on_hand","reserved")
     VALUES ($1,$2,$3,$4);`,
    [variantId, storeId, onHand, reserved],
  );

  return { storeId, variantId };
}

async function cleanup(sql: Sql): Promise<void> {
  await sql.unsafe(
    `DELETE FROM "stock_movements" WHERE "store_id" IN (SELECT "id" FROM "stores" WHERE "slug" LIKE 't039-%');`,
  );
  await sql.unsafe(
    `DELETE FROM "stock_reservations" WHERE "store_id" IN (SELECT "id" FROM "stores" WHERE "slug" LIKE 't039-%');`,
  );
  await sql.unsafe(
    `DELETE FROM "inventory" WHERE "store_id" IN (SELECT "id" FROM "stores" WHERE "slug" LIKE 't039-%');`,
  );
  await sql.unsafe(`DELETE FROM "product_variants" WHERE "sku" LIKE 'T039-%';`);
  await sql.unsafe(`DELETE FROM "products" WHERE "slug" LIKE 't039-%';`);
  await sql.unsafe(`DELETE FROM "stores" WHERE "slug" LIKE 't039-%';`);
  await sql.unsafe(
    `DELETE FROM "businesses" WHERE "owner_user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" LIKE 't039.%');`,
  );
  await sql.unsafe(`DELETE FROM "users" WHERE "email_normalized" LIKE 't039.%';`);
}

describe('Inventory Expiry Sweep & Adjustments Integration (T039)', () => {
  it('releases expired active reservations, restores available stock, and appends movement ledger', async () => {
    const sql = await connectOrSkip();
    if (!sql) return;

    await runMigrations(sql, migrationsDir);
    await cleanup(sql);

    try {
      const { storeId, variantId } = await seedStoreWithVariant(sql, 'sweep', 20, 5);
      const cartId = '44444444-4444-4444-a444-444444444441';

      // Insert an expired active reservation (expires_at 1 minute ago)
      await sql.unsafe(
        `INSERT INTO "stock_reservations" (
           "cart_id", "variant_id", "store_id", "quantity", "expires_at", "status"
         ) VALUES ($1, $2, $3, 5, now() - interval '60 seconds', 'active');`,
        [cartId, variantId, storeId],
      );

      const service = new InventoryService(sql);

      // Execute expiry sweep
      const sweep = await service.releaseExpiredReservations(100, sql);

      expect(sweep.releasedCount).toBe(1);
      expect(sweep.releasedUnits).toBe(5);

      // Verify inventory.reserved is decremented to 0
      const invRows = (await sql.unsafe(
        `SELECT "on_hand", "reserved" FROM "inventory" WHERE "variant_id" = $1;`,
        [variantId],
      )) as unknown as Array<{ on_hand: number; reserved: number }>;

      expect(invRows[0]!.reserved).toBe(0);
      expect(invRows[0]!.on_hand).toBe(20);

      // Verify reservation status is 'expired'
      const resRows = (await sql.unsafe(
        `SELECT "status" FROM "stock_reservations" WHERE "cart_id" = $1;`,
        [cartId],
      )) as unknown as Array<{ status: string }>;

      expect(resRows[0]!.status).toBe('expired');

      // Verify movement ledger record
      const movRows = (await sql.unsafe(
        `SELECT "delta_reserved", "reason" FROM "stock_movements" WHERE "variant_id" = $1 AND "reason" = 'reservation_expired';`,
        [variantId],
      )) as unknown as Array<{ delta_reserved: number; reason: string }>;

      expect(movRows).toHaveLength(1);
      expect(movRows[0]!.delta_reserved).toBe(-5);
    } finally {
      await cleanup(sql);
      await sql.end();
    }
  });

  it('adjusts physical stock and rejects reduction below currently reserved quantity', async () => {
    const sql = await connectOrSkip();
    if (!sql) return;

    await runMigrations(sql, migrationsDir);
    await cleanup(sql);

    try {
      const { storeId, variantId } = await seedStoreWithVariant(sql, 'adjust', 15, 6);
      const service = new InventoryService(sql);

      // 1. Valid restocking (+10)
      const restockResult = await service.adjustStock(sql, {
        storeId,
        variantId,
        deltaOnHand: 10,
        reason: 'manual_adjustment',
        operationKey: 'op-restock-10',
      });

      expect(restockResult.ok).toBe(true);
      expect(restockResult.onHand).toBe(25);
      expect(restockResult.reserved).toBe(6);
      expect(restockResult.available).toBe(19);

      // 2. Reject reducing on_hand below reserved count (25 - 20 = 5, but reserved is 6!)
      await expect(
        service.adjustStock(sql, {
          storeId,
          variantId,
          deltaOnHand: -20,
          reason: 'manual_adjustment',
          operationKey: 'op-damage-excess',
        }),
      ).rejects.toThrow(expect.objectContaining({ code: 'CANNOT_REDUCE_BELOW_RESERVED' }));

      // 3. Reject cross-store adjustment attempt
      const fakeStoreId = '99999999-9999-4999-a999-999999999999';
      await expect(
        service.adjustStock(sql, {
          storeId: fakeStoreId,
          variantId,
          deltaOnHand: 5,
          reason: 'manual_adjustment',
          operationKey: 'op-cross-store',
        }),
      ).rejects.toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
    } finally {
      await cleanup(sql);
      await sql.end();
    }
  });
});
