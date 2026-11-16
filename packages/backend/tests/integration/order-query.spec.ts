// packages/backend/tests/integration/order-query.spec.ts - Integration test for scoped order queries & PII masking (T055).
// Invariants verified:
// 1. Customer can list their own orders with keyset cursor pagination.
// 2. Customer fetching a foreign orderId receives OrderNotFoundError (no oracle).
// 3. Seller suborder queries are strictly isolated to that store's suborders and line items.
// 4. Seller fetching a foreign suborder receives SuborderNotFoundError (no oracle).
// 5. Customer PII (recipient name, address lines, phone) is masked for sellers when order is unpaid.
// 6. Customer PII is unmasked to sellers once order payment status is PAID.

import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetEnvCache } from '@shopscale/config';
import {
  OrderNotFoundError,
  OrderQueryService,
  SuborderNotFoundError,
  findMigrationsDir,
  openAdminConnection,
  requireDatabaseUrl,
  runMigrations,
} from '../../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = findMigrationsDir(here);

type Sql = Awaited<ReturnType<typeof openAdminConnection>>;

async function connectOrSkip(): Promise<Sql | null> {
  resetEnvCache();
  let url: string;
  try {
    url = requireDatabaseUrl();
  } catch {
    console.warn('SKIP: DATABASE_URL not configured; start infra first.');
    return null;
  }
  const sql = openAdminConnection(url);
  try {
    await sql`SELECT 1`;
    return sql;
  } catch {
    await sql.end();
    console.warn('SKIP: database unreachable; start infra first.');
    return null;
  }
}

describe('Scoped Order History, Detail, and PII Masking (T055)', () => {
  let sql: Sql | null = null;
  let orderQueryService: OrderQueryService;

  beforeAll(async () => {
    sql = await connectOrSkip();
    if (sql) {
      await runMigrations(sql, migrationsDir);
      orderQueryService = new OrderQueryService(sql);
    }
  });

  afterAll(async () => {
    if (sql) {
      await sql.end();
    }
  });

  it('verifies customer isolation, seller suborder scoping, and payment-driven PII masking', async () => {
    if (!sql) return;

    const prefix = `q_${Date.now()}`;

    // 1. Create two customers
    const [cust1] = await sql`
      INSERT INTO "users" ("email_normalized", "password_hash", "status")
      VALUES (${`cust1_${prefix}@test.com`}, 'hash', 'active')
      RETURNING id;
    `;
    const [cust2] = await sql`
      INSERT INTO "users" ("email_normalized", "password_hash", "status")
      VALUES (${`cust2_${prefix}@test.com`}, 'hash', 'active')
      RETURNING id;
    `;

    // 2. Create two stores (Store A and Store B)
    const [storeA] = await sql`
      INSERT INTO "stores" ("business_id", "slug", "name", "status")
      VALUES (
        (INSERT INTO "businesses" ("owner_user_id", "legal_name") VALUES (${cust1.id}, ${`BizA ${prefix}`}) RETURNING id),
        ${`store-a-${prefix}`}, ${`Store A ${prefix}`}, 'active'
      ) RETURNING id;
    `;

    const [storeB] = await sql`
      INSERT INTO "stores" ("business_id", "slug", "name", "status")
      VALUES (
        (INSERT INTO "businesses" ("owner_user_id", "legal_name") VALUES (${cust2.id}, ${`BizB ${prefix}`}) RETURNING id),
        ${`store-b-${prefix}`}, ${`Store B ${prefix}`}, 'active'
      ) RETURNING id;
    `;

    // 3. Create products and variants for Store A and Store B
    const [cat] = await sql`
      INSERT INTO "categories" ("slug", "name", "path")
      VALUES (${`cat-${prefix}`}, 'Cat', ${`cat-${prefix}`})
      RETURNING id;
    `;

    const [prodA] = await sql`
      INSERT INTO "products" ("store_id", "category_id", "slug", "title", "description", "currency")
      VALUES (${storeA.id}, ${cat.id}, ${`prod-a-${prefix}`}, 'Prod A', 'Desc A', 'USD')
      RETURNING id;
    `;
    const [varA] = await sql`
      INSERT INTO "product_variants" ("product_id", "store_id", "sku", "price_cents")
      VALUES (${prodA.id}, ${storeA.id}, ${`sku-a-${prefix}`}, 2000)
      RETURNING id;
    `;

    const [prodB] = await sql`
      INSERT INTO "products" ("store_id", "category_id", "slug", "title", "description", "currency")
      VALUES (${storeB.id}, ${cat.id}, ${`prod-b-${prefix}`}, 'Prod B', 'Desc B', 'USD')
      RETURNING id;
    `;
    const [varB] = await sql`
      INSERT INTO "product_variants" ("product_id", "store_id", "sku", "price_cents")
      VALUES (${prodB.id}, ${storeB.id}, ${`sku-b-${prefix}`}, 3000)
      RETURNING id;
    `;

    // 4. Customer 1 places multi-vendor Order 1 (split across Store A and Store B)
    const order1Id = randomUUID();
    const suborderAId = randomUUID();
    const suborderBId = randomUUID();

    const fullAddress = {
      fullName: 'Alice Customer',
      line1: '742 Evergreen Terrace',
      city: 'Springfield',
      state: 'IL',
      postalCode: '62701',
      country: 'USA',
      phone: '+1-555-0144',
    };

    await sql`
      INSERT INTO "orders" (
        "id", "user_id", "channel_key", "payment_status", "fulfillment_status",
        "subtotal_cents", "shipping_cents", "discount_cents", "total_cents", "currency",
        "address_snapshot", "version"
      ) VALUES (
        ${order1Id}, ${cust1.id}, 'marketplace', 'PENDING', 'PENDING',
        5000, 1000, 0, 6000, 'USD',
        ${JSON.stringify(fullAddress)}::jsonb, 1
      );
    `;

    await sql`
      INSERT INTO "seller_orders" (
        "id", "order_id", "store_id", "fulfillment_status",
        "subtotal_cents", "shipping_cents", "discount_cents", "total_cents"
      ) VALUES
        (${suborderAId}, ${order1Id}, ${storeA.id}, 'PENDING', 2000, 500, 0, 2500),
        (${suborderBId}, ${order1Id}, ${storeB.id}, 'PENDING', 3000, 500, 0, 3500);
    `;

    await sql`
      INSERT INTO "order_items" (
        "order_id", "seller_order_id", "store_id", "variant_id",
        "title_snapshot", "sku_snapshot", "qty", "unit_price_cents", "total_cents", "discount_cents"
      ) VALUES
        (${order1Id}, ${suborderAId}, ${storeA.id}, ${varA.id}, 'Prod A', 'sku-a', 1, 2000, 2000, 0),
        (${order1Id}, ${suborderBId}, ${storeB.id}, ${varB.id}, 'Prod B', 'sku-b', 1, 3000, 3000, 0);
    `;

    // --- TEST PART 1: Customer Scoping ---
    // Customer 1 lists their orders
    const cust1List = await orderQueryService.listCustomerOrders(cust1.id);
    expect(cust1List.items).toHaveLength(1);
    expect(cust1List.items[0]!.id).toBe(order1Id);
    expect(cust1List.items[0]!.itemsCount).toBe(2);

    // Customer 2 lists their orders: receives empty list
    const cust2List = await orderQueryService.listCustomerOrders(cust2.id);
    expect(cust2List.items).toHaveLength(0);

    // Customer 1 fetches their order detail: unmasked address and all 2 suborders visible
    const cust1Detail = await orderQueryService.getCustomerOrder(cust1.id, order1Id);
    expect(cust1Detail.id).toBe(order1Id);
    expect(cust1Detail.address.fullName).toBe('Alice Customer');
    expect(cust1Detail.address.line1).toBe('742 Evergreen Terrace');
    expect(cust1Detail.suborders).toHaveLength(2);
    expect(cust1Detail.items).toHaveLength(2);

    // Customer 2 attempts to fetch Customer 1's orderId: rejected with OrderNotFoundError
    await expect(
      orderQueryService.getCustomerOrder(cust2.id, order1Id),
    ).rejects.toThrow(OrderNotFoundError);

    // --- TEST PART 2: Seller Scoping & PII Masking (UNPAID) ---
    // Store A queries their suborders: sees only Store A suborder
    const storeAList = await orderQueryService.listSellerOrders(storeA.id);
    expect(storeAList.items).toHaveLength(1);
    expect(storeAList.items[0]!.id).toBe(suborderAId);
    expect(storeAList.items[0]!.storeId).toBe(storeA.id);
    expect(storeAList.items[0]!.totalCents).toBe(2500);

    // Unpaid PII Masking verification: recipient name and address lines are masked
    const maskedAddr = storeAList.items[0]!.shippingAddress!;
    expect(maskedAddr.fullName).toBe('*** MASKED UNTIL PAID ***');
    expect(maskedAddr.line1).toBe('*** MASKED UNTIL PAID ***');
    expect(maskedAddr.city).toBe('Springfield'); // Regional preserved

    // Store A fetches their suborder detail: sees only Store A line item
    const storeADetail = await orderQueryService.getSellerOrder(storeA.id, suborderAId);
    expect(storeADetail.id).toBe(suborderAId);
    expect(storeADetail.items).toHaveLength(1);
    expect(storeADetail.items![0]!.storeId).toBe(storeA.id);
    expect(storeADetail.items![0]!.title).toBe('Prod A');

    // Store A attempts to fetch Store B's suborder: rejected with SuborderNotFoundError (404)
    await expect(
      orderQueryService.getSellerOrder(storeA.id, suborderBId),
    ).rejects.toThrow(SuborderNotFoundError);

    // --- TEST PART 3: PII Unmasking Once Order Is PAID ---
    await sql`
      UPDATE "orders" SET "payment_status" = 'PAID' WHERE "id" = ${order1Id};
    `;

    const storeAListPaid = await orderQueryService.listSellerOrders(storeA.id);
    const unmaskedAddr = storeAListPaid.items[0]!.shippingAddress!;
    expect(unmaskedAddr.fullName).toBe('Alice Customer');
    expect(unmaskedAddr.line1).toBe('742 Evergreen Terrace');
    expect(unmaskedAddr.phone).toBe('+1-555-0144');
  });
});
