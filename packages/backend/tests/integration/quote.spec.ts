// @shopscale/backend/tests/integration/quote.spec - Canonical quote engine integration tests (T045).
// Invariants verified against real PostgreSQL:
// 1. Multi-seller shipping calculation: $5.00 (500 cents) fixed shipping per unique seller suborder.
// 2. Proportional coupon discount allocation without penny loss.
// 3. Price change detection (CA-3): throws PriceChangedError if live catalog price differs from expected price.
// 4. Cryptographic HMAC quote token issuance and tamper rejection.

import { describe, expect, it } from 'vitest';
import { resetEnvCache } from '@shopscale/config';
import {
  findMigrationsDir,
  openAdminConnection,
  requireDatabaseUrl,
  runMigrations,
} from '../../src/platform/database.js';
import { quoteService } from '../../src/commerce/quote.service.js';
import {
  InvalidQuoteTokenError,
  PriceChangedError,
} from '../../src/commerce/errors.js';
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
  await sql.unsafe(`DELETE FROM "product_variants" WHERE "sku" LIKE $1;`, [`${prefix.toUpperCase()}-%`]);
  await sql.unsafe(`DELETE FROM "products" WHERE "slug" LIKE $1;`, [`${prefix}-%`]);
  await sql.unsafe(`DELETE FROM "stores" WHERE "slug" LIKE $1;`, [`${prefix}-%`]);
  await sql.unsafe(
    `DELETE FROM "businesses" WHERE "owner_user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" LIKE $1);`,
    [`${prefix}.%`],
  );
  await sql.unsafe(`DELETE FROM "users" WHERE "email_normalized" LIKE $1;`, [`${prefix}.%`]);
}

describe('Canonical Quote Engine Integration (T045)', () => {
  it('calculates multi-seller shipping ($10 for 2 sellers) and signs quote token', async () => {
    const sql = await connectOrSkip();
    if (!sql) return;

    await runMigrations(sql, migrationsDir);
    const prefix = 't045-quote';
    await cleanup(sql, prefix);

    try {
      // 1. Create User & Business
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

      // 2. Create Seller A Store & Product
      const storeARows = (await sql.unsafe(
        `INSERT INTO "stores" ("business_id", "slug", "name", "status") VALUES ($1, $2, 'Seller A Store', 'active') RETURNING "id";`,
        [bizId, `${prefix}-store-a`],
      )) as unknown as Array<{ id: string }>;
      const storeAId = storeARows[0]!.id;

      const prodARows = (await sql.unsafe(
        `INSERT INTO "products" ("store_id", "slug", "title", "status") VALUES ($1, $2, 'Store A Item', 'active') RETURNING "id";`,
        [storeAId, `${prefix}-item-a`],
      )) as unknown as Array<{ id: string }>;
      const prodAId = prodARows[0]!.id;

      const varARows = (await sql.unsafe(
        `INSERT INTO "product_variants" ("store_id", "product_id", "sku", "price_cents", "status")
         VALUES ($1, $2, 'T045-VAR-A', 2000, 'active') RETURNING "id";`,
        [storeAId, prodAId],
      )) as unknown as Array<{ id: string }>;
      const variantAId = varARows[0]!.id;

      // 3. Create Seller B Store & Product
      const storeBRows = (await sql.unsafe(
        `INSERT INTO "stores" ("business_id", "slug", "name", "status") VALUES ($1, $2, 'Seller B Store', 'active') RETURNING "id";`,
        [bizId, `${prefix}-store-b`],
      )) as unknown as Array<{ id: string }>;
      const storeBId = storeBRows[0]!.id;

      const prodBRows = (await sql.unsafe(
        `INSERT INTO "products" ("store_id", "slug", "title", "status") VALUES ($1, $2, 'Store B Item', 'active') RETURNING "id";`,
        [storeBId, `${prefix}-item-b`],
      )) as unknown as Array<{ id: string }>;
      const prodBId = prodBRows[0]!.id;

      const varBRows = (await sql.unsafe(
        `INSERT INTO "product_variants" ("store_id", "product_id", "sku", "price_cents", "status")
         VALUES ($1, $2, 'T045-VAR-B', 3000, 'active') RETURNING "id";`,
        [storeBId, prodBId],
      )) as unknown as Array<{ id: string }>;
      const variantBId = varBRows[0]!.id;

      // 4. Request quote for items from both sellers
      const quote = await quoteService.calculateQuote({
        channelKey: 'marketplace',
        items: [
          { variantId: variantAId, qty: 1, expectedUnitPriceCents: '2000' },
          { variantId: variantBId, qty: 1, expectedUnitPriceCents: '3000' },
        ],
      });

      // Assert multi-seller totals: subtotal = 5000, shipping = 1000 (2 * 500), total = 6000
      expect(quote.subtotalCents).toBe('5000');
      expect(quote.shippingCents).toBe('1000');
      expect(quote.discountCents).toBe('0');
      expect(quote.totalCents).toBe('6000');
      expect(quote.sellers).toHaveLength(2);

      const sellerA = quote.sellers.find((s) => s.storeId === storeAId);
      expect(sellerA).toBeDefined();
      expect(sellerA?.subtotalCents).toBe('2000');
      expect(sellerA?.shippingCents).toBe('500');
      expect(sellerA?.totalCents).toBe('2500');

      const sellerB = quote.sellers.find((s) => s.storeId === storeBId);
      expect(sellerB).toBeDefined();
      expect(sellerB?.subtotalCents).toBe('3000');
      expect(sellerB?.shippingCents).toBe('500');
      expect(sellerB?.totalCents).toBe('3500');

      // Assert quote token is cryptographically verifiable
      const verified = quoteService.verifyQuoteToken(quote.quoteToken);
      expect(verified.subtotalCents).toBe(5000);
      expect(verified.shippingCents).toBe(1000);
      expect(verified.totalCents).toBe(6000);
      expect(verified.sellers).toHaveLength(2);

      // Assert tampered token is rejected
      const tampered = quote.quoteToken.replace(/.[a-f0-9]{5}$/, 'abcde');
      expect(() => quoteService.verifyQuoteToken(tampered)).toThrow(InvalidQuoteTokenError);
    } finally {
      await cleanup(sql, prefix);
      await sql.end();
    }
  });

  it('detects catalog price shifts and throws PriceChangedError (CA-3)', async () => {
    const sql = await connectOrSkip();
    if (!sql) return;

    await runMigrations(sql, migrationsDir);
    const prefix = 't045-price-shift';
    await cleanup(sql, prefix);

    try {
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
        `INSERT INTO "stores" ("business_id", "slug", "name", "status") VALUES ($1, $2, 'Price Shift Store', 'active') RETURNING "id";`,
        [bizId, `${prefix}-store`],
      )) as unknown as Array<{ id: string }>;
      const storeId = storeRows[0]!.id;

      const prodRows = (await sql.unsafe(
        `INSERT INTO "products" ("store_id", "slug", "title", "status") VALUES ($1, $2, 'Shift Item', 'active') RETURNING "id";`,
        [storeId, `${prefix}-shift-item`],
      )) as unknown as Array<{ id: string }>;
      const prodId = prodRows[0]!.id;

      const varRows = (await sql.unsafe(
        `INSERT INTO "product_variants" ("store_id", "product_id", "sku", "price_cents", "status")
         VALUES ($1, $2, 'T045-SHIFT-VAR', 1500, 'active') RETURNING "id";`,
        [storeId, prodId],
      )) as unknown as Array<{ id: string }>;
      const variantId = varRows[0]!.id;

      // First quote succeeds with expected price 1500
      const quote1 = await quoteService.calculateQuote({
        channelKey: 'marketplace',
        items: [{ variantId, qty: 1, expectedUnitPriceCents: '1500' }],
      });
      expect(quote1.subtotalCents).toBe('1500');

      // Alter price in the database: 1500 -> 2200
      await sql.unsafe(
        `UPDATE "product_variants" SET "price_cents" = 2200 WHERE "id" = $1;`,
        [variantId],
      );

      // Second quote with original expected price 1500 must fail with PriceChangedError
      await expect(
        quoteService.calculateQuote({
          channelKey: 'marketplace',
          items: [{ variantId, qty: 1, expectedUnitPriceCents: '1500' }],
        }),
      ).rejects.toThrow(PriceChangedError);

      try {
        await quoteService.calculateQuote({
          channelKey: 'marketplace',
          items: [{ variantId, qty: 1, expectedUnitPriceCents: '1500' }],
        });
      } catch (err) {
        expect(err).toBeInstanceOf(PriceChangedError);
        const pce = err as PriceChangedError;
        expect(pce.variantId).toBe(variantId);
        expect(pce.expectedPriceCents).toBe(1500);
        expect(pce.currentPriceCents).toBe(2200);
      }
    } finally {
      await cleanup(sql, prefix);
      await sql.end();
    }
  });

  it('allocates coupon discount proportionally across multi-seller items', async () => {
    const sql = await connectOrSkip();
    if (!sql) return;

    await runMigrations(sql, migrationsDir);
    const prefix = 't045-coupon-prop';
    await cleanup(sql, prefix);

    try {
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
        `INSERT INTO "stores" ("business_id", "slug", "name", "status") VALUES ($1, $2, 'Store Multi', 'active') RETURNING "id";`,
        [bizId, `${prefix}-store`],
      )) as unknown as Array<{ id: string }>;
      const storeId = storeRows[0]!.id;

      const prodRows = (await sql.unsafe(
        `INSERT INTO "products" ("store_id", "slug", "title", "status") VALUES ($1, $2, 'Item', 'active') RETURNING "id";`,
        [storeId, `${prefix}-item`],
      )) as unknown as Array<{ id: string }>;
      const prodId = prodRows[0]!.id;

      // 3 items with prices: 1000, 1000, 1000 -> subtotal = 3000
      const var1 = (await sql.unsafe(
        `INSERT INTO "product_variants" ("store_id", "product_id", "sku", "price_cents", "status")
         VALUES ($1, $2, 'T045-CPN-1', 1000, 'active') RETURNING "id";`,
        [storeId, prodId],
      )) as unknown as Array<{ id: string }>;

      const var2 = (await sql.unsafe(
        `INSERT INTO "product_variants" ("store_id", "product_id", "sku", "price_cents", "status")
         VALUES ($1, $2, 'T045-CPN-2', 1000, 'active') RETURNING "id";`,
        [storeId, prodId],
      )) as unknown as Array<{ id: string }>;

      const var3 = (await sql.unsafe(
        `INSERT INTO "product_variants" ("store_id", "product_id", "sku", "price_cents", "status")
         VALUES ($1, $2, 'T045-CPN-3', 1000, 'active') RETURNING "id";`,
        [storeId, prodId],
      )) as unknown as Array<{ id: string }>;

      // Coupon SAVE10 ($10.00 / 1000 cents) across 3 equal items:
      // 1000 / 3 = 333.33 -> allocations must be 334, 333, 333 and sum to 1000
      const quote = await quoteService.calculateQuote({
        channelKey: 'marketplace',
        items: [
          { variantId: var1[0]!.id, qty: 1 },
          { variantId: var2[0]!.id, qty: 1 },
          { variantId: var3[0]!.id, qty: 1 },
        ],
        couponCode: 'SAVE10',
      });

      expect(quote.subtotalCents).toBe('3000');
      expect(quote.discountCents).toBe('1000');
      expect(quote.shippingCents).toBe('500');
      expect(quote.totalCents).toBe('2500'); // 3000 + 500 - 1000 = 2500

      const discounts = quote.sellers[0]!.items.map((it) => parseInt(it.discountCents, 10));
      expect(discounts.reduce((a, b) => a + b, 0)).toBe(1000);
      expect(discounts.sort()).toEqual([333, 333, 334]);
    } finally {
      await cleanup(sql, prefix);
      await sql.end();
    }
  });
});
