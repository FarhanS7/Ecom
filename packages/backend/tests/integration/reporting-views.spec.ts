// @shopscale/backend/tests/integration/reporting-views.spec.ts - Integration test for materialized sales read models (AD-2, REQ-ENG-002 / T066).

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
import { AnalyticsQueryService } from '../../src/reporting/analytics.service.js';

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

describe('Materialized Sales Read Models Integration (T066 / AD-2, REQ-ENG-002)', () => {
  it('aggregates daily GMV and store performance in materialized views with concurrent refresh', async () => {
    const sql = await connectOrSkip();
    if (!sql) return;

    await runMigrations({ sql, migrationsDir });

    const prefix = `t066_${Date.now()}`;

    // 1. Seed two stores
    const [store1] = (await sql`
      INSERT INTO stores (slug, name, status, currency)
      VALUES (${`${prefix}-store-1`}, 'Top Tech Store', 'active', 'USD')
      RETURNING id;
    `) as unknown as Array<{ id: string }>;

    const [store2] = (await sql`
      INSERT INTO stores (slug, name, status, currency)
      VALUES (${`${prefix}-store-2`}, 'Coffee Beans Store', 'active', 'USD')
      RETURNING id;
    `) as unknown as Array<{ id: string }>;

    // 2. Seed buyer
    const [buyer] = (await sql`
      INSERT INTO users (email, email_normalized, password_hash, name, status)
      VALUES (${`${prefix}.buyer@example.com`}, ${`${prefix}.buyer@example.com`}, 'hash', 'Buyer', 'active')
      RETURNING id;
    `) as unknown as Array<{ id: string }>;

    // 3. Seed paid orders for Store 1: 2 orders ($100 each = $200 GMV)
    const [order1] = (await sql`
      INSERT INTO orders (user_id, channel_key, payment_status, fulfillment_status, subtotal_cents, shipping_cents, total_cents, address_snapshot)
      VALUES (${buyer!.id}, 'marketplace', 'PAID', 'DELIVERED', 10000, 0, 10000, '{}'::jsonb)
      RETURNING id;
    `) as unknown as Array<{ id: string }>;

    const [so1] = (await sql`
      INSERT INTO seller_orders (order_id, store_id, fulfillment_status, subtotal_cents, shipping_cents, total_cents)
      VALUES (${order1!.id}, ${store1!.id}, 'DELIVERED', 10000, 0, 10000)
      RETURNING id;
    `) as unknown as Array<{ id: string }>;

    const [order2] = (await sql`
      INSERT INTO orders (user_id, channel_key, payment_status, fulfillment_status, subtotal_cents, shipping_cents, total_cents, address_snapshot)
      VALUES (${buyer!.id}, 'marketplace', 'PAID', 'DELIVERED', 10000, 0, 10000, '{}'::jsonb)
      RETURNING id;
    `) as unknown as Array<{ id: string }>;

    const [so2] = (await sql`
      INSERT INTO seller_orders (order_id, store_id, fulfillment_status, subtotal_cents, shipping_cents, total_cents)
      VALUES (${order2!.id}, ${store1!.id}, 'DELIVERED', 10000, 0, 10000)
      RETURNING id;
    `) as unknown as Array<{ id: string }>;

    // 4. Seed paid order for Store 2: 1 order ($50 GMV)
    const [order3] = (await sql`
      INSERT INTO orders (user_id, channel_key, payment_status, fulfillment_status, subtotal_cents, shipping_cents, total_cents, address_snapshot)
      VALUES (${buyer!.id}, 'marketplace', 'PAID', 'DELIVERED', 5000, 0, 5000, '{}'::jsonb)
      RETURNING id;
    `) as unknown as Array<{ id: string }>;

    const [so3] = (await sql`
      INSERT INTO seller_orders (order_id, store_id, fulfillment_status, subtotal_cents, shipping_cents, total_cents)
      VALUES (${order3!.id}, ${store2!.id}, 'DELIVERED', 5000, 0, 5000)
      RETURNING id;
    `) as unknown as Array<{ id: string }>;

    // 5. Seed unpaid pending order for Store 2 ($30 GMV - must NOT be counted)
    const [unpaidOrder] = (await sql`
      INSERT INTO orders (user_id, channel_key, payment_status, fulfillment_status, subtotal_cents, shipping_cents, total_cents, address_snapshot)
      VALUES (${buyer!.id}, 'marketplace', 'PENDING', 'PENDING', 3000, 0, 3000, '{}'::jsonb)
      RETURNING id;
    `) as unknown as Array<{ id: string }>;

    const [soUnpaid] = (await sql`
      INSERT INTO seller_orders (order_id, store_id, fulfillment_status, subtotal_cents, shipping_cents, total_cents)
      VALUES (${unpaidOrder!.id}, ${store2!.id}, 'PENDING', 3000, 0, 3000)
      RETURNING id;
    `) as unknown as Array<{ id: string }>;

    const analyticsService = new AnalyticsQueryService(sql);

    // 6. Refresh materialized views concurrently
    const refreshResult = await analyticsService.refreshMaterializedViews(true);
    expect(refreshResult.refreshed).toBe(true);

    // 7. Verify Store 1 analytics (Strictly scoped)
    const store1Analytics = await analyticsService.getStoreAnalytics(store1!.id);
    expect(store1Analytics.storeId).toBe(store1!.id);
    expect(store1Analytics.totalOrders).toBe(2);
    expect(store1Analytics.totalGmvCents).toBe(20000);
    expect(store1Analytics.avgOrderValueCents).toBe(10000);
    expect(store1Analytics.dailyTrends.length).toBeGreaterThanOrEqual(1);

    // 8. Verify Store 2 analytics (Unpaid order is excluded)
    const store2Analytics = await analyticsService.getStoreAnalytics(store2!.id);
    expect(store2Analytics.storeId).toBe(store2!.id);
    expect(store2Analytics.totalOrders).toBe(1);
    expect(store2Analytics.totalGmvCents).toBe(5000);
    expect(store2Analytics.avgOrderValueCents).toBe(5000);

    // 9. Verify Platform analytics & Store ranking
    const platformAnalytics = await analyticsService.getPlatformAnalytics();
    expect(platformAnalytics.platformTotalOrders).toBeGreaterThanOrEqual(3);
    expect(platformAnalytics.platformTotalGmvCents).toBeGreaterThanOrEqual(25000);

    const s1Ranked = platformAnalytics.topStores.find((s) => s.storeId === store1!.id);
    const s2Ranked = platformAnalytics.topStores.find((s) => s.storeId === store2!.id);
    expect(s1Ranked).toBeDefined();
    expect(s2Ranked).toBeDefined();
    expect(s1Ranked!.lifetimeGmvCents).toBe(20000);
    expect(s2Ranked!.lifetimeGmvCents).toBe(5000);

    // Clean up
    await sql`DELETE FROM seller_orders WHERE id IN (${so1!.id}, ${so2!.id}, ${so3!.id}, ${soUnpaid!.id});`;
    await sql`DELETE FROM orders WHERE id IN (${order1!.id}, ${order2!.id}, ${order3!.id}, ${unpaidOrder!.id});`;
    await sql`DELETE FROM stores WHERE id IN (${store1!.id}, ${store2!.id});`;
    await sql`DELETE FROM users WHERE id = ${buyer!.id};`;
    await sql.end();
  });
});
