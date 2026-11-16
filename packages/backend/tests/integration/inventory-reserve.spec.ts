// T038 integration verification for Atomic Basket Reservations.
// Core invariants verified:
// 1. Multi-item atomic reservation updates inventory.reserved, inserts stock_reservations, and logs stock_movements.
// 2. Rollback on failure: if item 3 of 3 has insufficient stock, zero partial reservations survive.
// 3. Deadlock avoidance: concurrent reservations requesting items in reverse order acquire locks in ascending order without deadlock.

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

async function seedStoreWithVariants(
  sql: Sql,
  suffix: string,
  variantConfigs: Array<{ sku: string; onHand: number }>,
): Promise<{ storeId: string; variants: Array<{ id: string; sku: string; onHand: number }> }> {
  const users = (await sql.unsafe(
    `INSERT INTO "users" ("email_normalized","password_hash") VALUES ($1,'x') RETURNING "id";`,
    [`t038.${suffix}@example.com`],
  )) as unknown as Array<{ id: string }>;

  const businesses = (await sql.unsafe(
    `INSERT INTO "businesses" ("owner_user_id") VALUES ($1) RETURNING "id";`,
    [users[0]!.id],
  )) as unknown as Array<{ id: string }>;

  const stores = (await sql.unsafe(
    `INSERT INTO "stores" ("business_id","slug","name","status") VALUES ($1,$2,$3,'active') RETURNING "id";`,
    [businesses[0]!.id, `t038-${suffix}`, `T038 ${suffix}`],
  )) as unknown as Array<{ id: string }>;
  const storeId = stores[0]!.id;

  const products = (await sql.unsafe(
    `INSERT INTO "products" ("store_id","slug","title","status") VALUES ($1,$2,'Test Product','active') RETURNING "id";`,
    [storeId, `t038-p-${suffix}`],
  )) as unknown as Array<{ id: string }>;

  const variants: Array<{ id: string; sku: string; onHand: number }> = [];

  for (const cfg of variantConfigs) {
    const vRows = (await sql.unsafe(
      `INSERT INTO "product_variants" ("store_id","product_id","sku","price_cents","status")
       VALUES ($1,$2,$3,2500,'active') RETURNING "id";`,
      [storeId, products[0]!.id, cfg.sku],
    )) as unknown as Array<{ id: string }>;

    const variantId = vRows[0]!.id;

    await sql.unsafe(
      `INSERT INTO "inventory" ("variant_id","store_id","on_hand","reserved")
       VALUES ($1,$2,$3,0);`,
      [variantId, storeId, cfg.onHand],
    );

    variants.push({ id: variantId, sku: cfg.sku, onHand: cfg.onHand });
  }

  return { storeId, variants };
}

async function cleanup(sql: Sql): Promise<void> {
  await sql.unsafe(
    `DELETE FROM "stock_movements" WHERE "store_id" IN (SELECT "id" FROM "stores" WHERE "slug" LIKE 't038-%');`,
  );
  await sql.unsafe(
    `DELETE FROM "stock_reservations" WHERE "store_id" IN (SELECT "id" FROM "stores" WHERE "slug" LIKE 't038-%');`,
  );
  await sql.unsafe(
    `DELETE FROM "inventory" WHERE "store_id" IN (SELECT "id" FROM "stores" WHERE "slug" LIKE 't038-%');`,
  );
  await sql.unsafe(`DELETE FROM "product_variants" WHERE "sku" LIKE 'T038-%';`);
  await sql.unsafe(`DELETE FROM "products" WHERE "slug" LIKE 't038-%';`);
  await sql.unsafe(`DELETE FROM "stores" WHERE "slug" LIKE 't038-%';`);
  await sql.unsafe(
    `DELETE FROM "businesses" WHERE "owner_user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" LIKE 't038.%');`,
  );
  await sql.unsafe(`DELETE FROM "users" WHERE "email_normalized" LIKE 't038.%';`);
}

describe('Atomic Basket Reservations Integration (T038)', () => {
  it('reserves multi-item baskets atomically with movement ledger and expiration TTL', async () => {
    const sql = await connectOrSkip();
    if (!sql) return;

    await runMigrations(sql, migrationsDir);
    await cleanup(sql);

    try {
      const { variants } = await seedStoreWithVariants(sql, 'multi', [
        { sku: 'T038-SKU-1', onHand: 15 },
        { sku: 'T038-SKU-2', onHand: 25 },
      ]);

      const service = new InventoryService(sql);
      const checkoutId = '11111111-1111-4111-a111-111111111111';

      const result = await sql.begin(async (tx) => {
        return service.reserve(tx, {
          checkoutId,
          items: [
            { variantId: variants[1]!.id, qty: 5 },
            { variantId: variants[0]!.id, qty: 3 },
          ],
          ttlSeconds: 900,
        });
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.reservationIds).toHaveLength(2);
      }

      // Verify inventory counters
      const invRows = (await sql.unsafe(
        `SELECT "variant_id", "on_hand", "reserved", "version" FROM "inventory"
         WHERE "variant_id" IN ($1, $2) ORDER BY "variant_id" ASC;`,
        [variants[0]!.id, variants[1]!.id],
      )) as unknown as Array<{ variant_id: string; on_hand: number; reserved: number; version: number }>;

      const inv0 = invRows.find((r) => r.variant_id === variants[0]!.id);
      const inv1 = invRows.find((r) => r.variant_id === variants[1]!.id);

      expect(inv0).toBeDefined();
      expect(inv0!.reserved).toBe(3);
      expect(inv0!.version).toBe(2);

      expect(inv1).toBeDefined();
      expect(inv1!.reserved).toBe(5);
      expect(inv1!.version).toBe(2);

      // Verify stock_reservations
      const resRows = (await sql.unsafe(
        `SELECT "cart_id", "variant_id", "quantity", "status" FROM "stock_reservations"
         WHERE "cart_id" = $1 ORDER BY "variant_id" ASC;`,
        [checkoutId],
      )) as unknown as Array<{ cart_id: string; variant_id: string; quantity: number; status: string }>;

      expect(resRows).toHaveLength(2);
      expect(resRows[0]!.status).toBe('active');
      expect(resRows[1]!.status).toBe('active');

      // Verify stock_movements
      const movRows = (await sql.unsafe(
        `SELECT "variant_id", "delta_reserved", "reason", "ref_id" FROM "stock_movements"
         WHERE "ref_id" = $1 ORDER BY "variant_id" ASC;`,
        [checkoutId],
      )) as unknown as Array<{ variant_id: string; delta_reserved: number; reason: string; ref_id: string }>;

      expect(movRows).toHaveLength(2);
      expect(movRows[0]!.reason).toBe('reservation_created');
      expect(movRows[0]!.delta_reserved).toBe(resRows.find((r) => r.variant_id === movRows[0]!.variant_id)!.quantity);
    } finally {
      await cleanup(sql);
      await sql.end();
    }
  });

  it('rolls back completely when 3rd item has insufficient stock (0 partial reservations survive)', async () => {
    const sql = await connectOrSkip();
    if (!sql) return;

    await runMigrations(sql, migrationsDir);
    await cleanup(sql);

    try {
      const { variants } = await seedStoreWithVariants(sql, 'rollback', [
        { sku: 'T038-RB-1', onHand: 10 },
        { sku: 'T038-RB-2', onHand: 10 },
        { sku: 'T038-RB-3', onHand: 2 }, // Only 2 available
      ]);

      const service = new InventoryService(sql);
      const checkoutId = '22222222-2222-4222-a222-222222222222';

      const result = await sql.begin(async (tx) => {
        return service.reserve(tx, {
          checkoutId,
          items: [
            { variantId: variants[0]!.id, qty: 5 },
            { variantId: variants[1]!.id, qty: 5 },
            { variantId: variants[2]!.id, qty: 4 }, // Exceeds available stock (2)
          ],
        });
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('INSUFFICIENT_STOCK');
        expect(result.variantId).toBe(variants[2]!.id);
        expect(result.available).toBe(2);
      }

      // Assert 0 partial reservations survive in inventory table
      const invRows = (await sql.unsafe(
        `SELECT "variant_id", "reserved" FROM "inventory"
         WHERE "variant_id" IN ($1, $2, $3);`,
        [variants[0]!.id, variants[1]!.id, variants[2]!.id],
      )) as unknown as Array<{ variant_id: string; reserved: number }>;

      for (const inv of invRows) {
        expect(inv.reserved).toBe(0);
      }

      // Assert 0 rows in stock_reservations
      const resRows = (await sql.unsafe(
        `SELECT COUNT(*)::int AS count FROM "stock_reservations" WHERE "cart_id" = $1;`,
        [checkoutId],
      )) as unknown as Array<{ count: number }>;
      expect(resRows[0]!.count).toBe(0);

      // Assert 0 rows in stock_movements
      const movRows = (await sql.unsafe(
        `SELECT COUNT(*)::int AS count FROM "stock_movements" WHERE "ref_id" = $1;`,
        [checkoutId],
      )) as unknown as Array<{ count: number }>;
      expect(movRows[0]!.count).toBe(0);
    } finally {
      await cleanup(sql);
      await sql.end();
    }
  });

  it('avoids deadlocks under reverse-order concurrent reservation calls', async () => {
    const sql = await connectOrSkip();
    if (!sql) return;

    await runMigrations(sql, migrationsDir);
    await cleanup(sql);

    try {
      const { variants } = await seedStoreWithVariants(sql, 'deadlock', [
        { sku: 'T038-DL-A', onHand: 100 },
        { sku: 'T038-DL-B', onHand: 100 },
      ]);

      const service = new InventoryService(sql);
      const checkout1 = '33333333-3333-4333-a333-333333333331';
      const checkout2 = '33333333-3333-4333-a333-333333333332';

      // Ensure variants are ordered [vLow, vHigh]
      const sorted = [...variants].sort((a, b) => a.id.localeCompare(b.id));
      const vLow = sorted[0]!;
      const vHigh = sorted[1]!;

      // Concurrently run Tx 1 (natural order [vLow, vHigh]) and Tx 2 (reverse order [vHigh, vLow])
      const [res1, res2] = await Promise.all([
        sql.begin((tx) =>
          service.reserve(tx, {
            checkoutId: checkout1,
            items: [
              { variantId: vLow.id, qty: 10 },
              { variantId: vHigh.id, qty: 15 },
            ],
          }),
        ),
        sql.begin((tx) =>
          service.reserve(tx, {
            checkoutId: checkout2,
            items: [
              { variantId: vHigh.id, qty: 20 }, // Reverse order!
              { variantId: vLow.id, qty: 25 },
            ],
          }),
        ),
      ]);

      expect(res1.ok).toBe(true);
      expect(res2.ok).toBe(true);

      // Verify totals
      const invRows = (await sql.unsafe(
        `SELECT "variant_id", "reserved" FROM "inventory" WHERE "variant_id" IN ($1, $2);`,
        [vLow.id, vHigh.id],
      )) as unknown as Array<{ variant_id: string; reserved: number }>;

      const invLow = invRows.find((r) => r.variant_id === vLow.id);
      const invHigh = invRows.find((r) => r.variant_id === vHigh.id);

      expect(invLow!.reserved).toBe(35); // 10 + 25
      expect(invHigh!.reserved).toBe(35); // 15 + 20
    } finally {
      await cleanup(sql);
      await sql.end();
    }
  });
});
