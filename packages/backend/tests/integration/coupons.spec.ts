// @shopscale/backend/tests/integration/coupons.spec.ts - Integration test for coupons & limits (OR-9 / T063).

import { describe, expect, it } from 'vitest';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resetEnvCache } from '@shopscale/config';
import {
  findMigrationsDir,
  openAdminConnection,
  requireDatabaseUrl,
  runMigrations,
} from '../../src/platform/database.js';
import { couponService } from '../../src/promotions/coupon.service.js';
import {
  CouponGlobalLimitExceededError,
  CouponPerUserLimitExceededError,
  CouponStoreMismatchError,
} from '../../src/promotions/errors.js';

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

describe('Coupons & Atomic Limits Integration (T063 / OR-9)', () => {
  it('enforces store scoping, atomic holds, per-user limits, and redemption', async () => {
    const sql = await connectOrSkip();
    if (!sql) return;

    await runMigrations({ sql, migrationsDir });

    const prefix = `t063_${Date.now()}`;
    const code = `TEST_${Date.now().toString(36).toUpperCase()}`;

    // 1. Seed two stores and two users
    const [user1] = (await sql`
      INSERT INTO users (email, email_normalized, password_hash, status)
      VALUES (${`${prefix}.user1@example.com`}, ${`${prefix}.user1@example.com`}, 'hash', 'active')
      RETURNING id;
    `) as unknown as Array<{ id: string }>;

    const [user2] = (await sql`
      INSERT INTO users (email, email_normalized, password_hash, status)
      VALUES (${`${prefix}.user2@example.com`}, ${`${prefix}.user2@example.com`}, 'hash', 'active')
      RETURNING id;
    `) as unknown as Array<{ id: string }>;

    const [biz] = (await sql`
      INSERT INTO businesses (owner_user_id) VALUES (${user1!.id}) RETURNING id;
    `) as unknown as Array<{ id: string }>;

    const [store1] = (await sql`
      INSERT INTO stores (business_id, name, slug, status)
      VALUES (${biz!.id}, 'Store Alpha', ${`${prefix}-alpha`}, 'active')
      RETURNING id;
    `) as unknown as Array<{ id: string }>;

    const [store2] = (await sql`
      INSERT INTO stores (business_id, name, slug, status)
      VALUES (${biz!.id}, 'Store Beta', ${`${prefix}-beta`}, 'active')
      RETURNING id;
    `) as unknown as Array<{ id: string }>;

    try {
      // 2. Create store-scoped coupon for store 1: 20% off, max 2 global redemptions, 1 per user
      const coupon = await couponService.createCoupon(
        {
          code,
          kind: 'PERCENT',
          value: 20,
          endsAt: new Date(Date.now() + 86400000).toISOString(),
          globalLimit: 2,
          perUserLimit: 1,
        },
        store1!.id,
        user1!.id,
      );

      expect(coupon.code).toBe(code);
      expect(coupon.storeId).toBe(store1!.id);
      expect(coupon.globalLimit).toBe(2);
      expect(coupon.perUserLimit).toBe(1);

      // 3. Validate store-scoped calculation: only store 1 items qualify
      const calculation = await couponService.validateAndCalculateDiscount({
        code,
        items: [
          { variantId: 'v1', storeId: store1!.id, subtotalCents: 10000 }, // $100 from Store Alpha
          { variantId: 'v2', storeId: store2!.id, subtotalCents: 5000 }, // $50 from Store Beta
        ],
        userId: user1!.id,
      });

      expect(calculation.isStoreScoped).toBe(true);
      expect(calculation.eligibleSubtotalCents).toBe(10000);
      expect(calculation.discountCents).toBe(2000); // 20% of $100 = $20 (2000 cents), Beta is untouched!

      // 4. Cart with only Store Beta items throws CouponStoreMismatchError
      await expect(
        couponService.validateAndCalculateDiscount({
          code,
          items: [{ variantId: 'v2', storeId: store2!.id, subtotalCents: 5000 }],
          userId: user1!.id,
        }),
      ).rejects.toThrow(CouponStoreMismatchError);

      // 5. Seed test order and hold coupon for user 1
      const [order1] = (await sql`
        INSERT INTO orders (
          user_id, channel_key, total_cents, subtotal_cents, shipping_cents,
          discount_cents, currency, payment_status, fulfillment_status, address_snapshot
        ) VALUES (
          ${user1!.id}, 'marketplace', 13000, 15000, 0,
          2000, 'USD', 'PENDING', 'PENDING', '{}'::jsonb
        ) RETURNING id;
      `) as unknown as Array<{ id: string }>;

      await sql.begin(async (tx) => {
        await couponService.holdCoupon(tx, {
          couponId: coupon.id,
          orderId: order1!.id,
          userId: user1!.id,
          discountCents: 2000,
        });
      });

      // Assert held counter incremented
      const couponAfterHold = await couponService.getCouponById(coupon.id);
      expect(couponAfterHold.heldCount).toBe(1);
      expect(couponAfterHold.redeemedCount).toBe(0);

      // 6. User 1 attempting second checkout with same coupon is rejected (perUserLimit = 1)
      await expect(
        couponService.validateAndCalculateDiscount({
          code,
          items: [{ variantId: 'v1', storeId: store1!.id, subtotalCents: 10000 }],
          userId: user1!.id,
        }),
      ).rejects.toThrow(CouponPerUserLimitExceededError);

      // 7. Complete order 1 -> transition to REDEEMED
      await sql.begin(async (tx) => {
        await couponService.redeemCoupon(tx, order1!.id);
      });

      // Assert redeemed_count incremented and held_count decremented
      const couponAfterRedeem = await couponService.getCouponById(coupon.id);
      expect(couponAfterRedeem.heldCount).toBe(0);
      expect(couponAfterRedeem.redeemedCount).toBe(1);

      // 8. User 2 redeems remaining coupon (global limit = 2)
      const [order2] = (await sql`
        INSERT INTO orders (
          user_id, channel_key, total_cents, subtotal_cents, shipping_cents,
          discount_cents, currency, payment_status, fulfillment_status, address_snapshot
        ) VALUES (
          ${user2!.id}, 'marketplace', 13000, 15000, 0,
          2000, 'USD', 'PENDING', 'PENDING', '{}'::jsonb
        ) RETURNING id;
      `) as unknown as Array<{ id: string }>;

      await sql.begin(async (tx) => {
        await couponService.holdCoupon(tx, {
          couponId: coupon.id,
          orderId: order2!.id,
          userId: user2!.id,
          discountCents: 2000,
        });
      });

      await sql.begin(async (tx) => {
        await couponService.redeemCoupon(tx, order2!.id);
      });

      const couponFullyRedeemed = await couponService.getCouponById(coupon.id);
      expect(couponFullyRedeemed.redeemedCount).toBe(2);

      // 9. Third user attempting redemption hits global limit
      const [user3] = (await sql`
        INSERT INTO users (email, email_normalized, password_hash, status)
        VALUES (${`${prefix}.user3@example.com`}, ${`${prefix}.user3@example.com`}, 'hash', 'active')
        RETURNING id;
      `) as unknown as Array<{ id: string }>;

      await expect(
        couponService.validateAndCalculateDiscount({
          code,
          items: [{ variantId: 'v1', storeId: store1!.id, subtotalCents: 10000 }],
          userId: user3!.id,
        }),
      ).rejects.toThrow(CouponGlobalLimitExceededError);
    } finally {
      // Cleanup seeded data
      await sql.unsafe(`DELETE FROM "coupon_uses" WHERE "order_id" IN (SELECT "id" FROM "orders" WHERE "user_id" IN ($1, $2));`, [user1!.id, user2!.id]);
      await sql.unsafe(`DELETE FROM "coupon_user_counters" WHERE "user_id" IN ($1, $2);`, [user1!.id, user2!.id]);
      await sql.unsafe(`DELETE FROM "coupons" WHERE "store_id" IN ($1, $2);`, [store1!.id, store2!.id]);
      await sql.unsafe(`DELETE FROM "orders" WHERE "user_id" IN ($1, $2);`, [user1!.id, user2!.id]);
      await sql.unsafe(`DELETE FROM "stores" WHERE "id" IN ($1, $2);`, [store1!.id, store2!.id]);
      await sql.unsafe(`DELETE FROM "businesses" WHERE "id" = $1;`, [biz!.id]);
      await sql.unsafe(`DELETE FROM "users" WHERE "email_normalized" LIKE $1;`, [`${prefix}.%`]);
      await sql.end();
    }
  });
});
