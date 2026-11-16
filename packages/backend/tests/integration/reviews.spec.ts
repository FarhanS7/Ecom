// @shopscale/backend/tests/integration/reviews.spec.ts - Integration test for verified purchaser reviews and rating rollup (RV-1, RV-2 / T064).

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
import { ReviewService } from '../../src/engagement/review.service.js';
import {
  NotVerifiedPurchaserError,
  ReviewAlreadyExistsError,
} from '../../src/engagement/errors.js';

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

describe('Verified Reviews & Rating Projection Integration (T064 / RV-1, RV-2)', () => {
  it('enforces purchaser eligibility, unique customer review constraint, and rating rollup projection', async () => {
    const sql = await connectOrSkip();
    if (!sql) return;

    await runMigrations({ sql, migrationsDir });

    const prefix = `t064_${Date.now()}`;

    // 1. Seed two users (one purchaser, one non-purchaser)
    const [buyer1] = (await sql`
      INSERT INTO users (email, email_normalized, password_hash, name, status)
      VALUES (${`${prefix}.buyer1@example.com`}, ${`${prefix}.buyer1@example.com`}, 'hash', 'Buyer One', 'active')
      RETURNING id;
    `) as unknown as Array<{ id: string }>;

    const [buyer2] = (await sql`
      INSERT INTO users (email, email_normalized, password_hash, name, status)
      VALUES (${`${prefix}.buyer2@example.com`}, ${`${prefix}.buyer2@example.com`}, 'hash', 'Buyer Two', 'active')
      RETURNING id;
    `) as unknown as Array<{ id: string }>;

    // 2. Seed a store and product
    const [store] = (await sql`
      INSERT INTO stores (slug, name, status, currency)
      VALUES (${`${prefix}-store`}, 'Test Audio Store', 'active', 'USD')
      RETURNING id;
    `) as unknown as Array<{ id: string }>;

    const [product] = (await sql`
      INSERT INTO products (store_id, slug, title, description, price_cents, currency, status)
      VALUES (
        ${store!.id},
        ${`${prefix}-headphones`},
        'Audiophile Wireless Headphones',
        'Noise cancelling wireless headphones',
        19900,
        'USD',
        'active'
      )
      RETURNING id;
    `) as unknown as Array<{ id: string }>;

    const [variant] = (await sql`
      INSERT INTO product_variants (product_id, sku, price_cents, currency, position)
      VALUES (${product!.id}, ${`SKU-${prefix}`}, 19900, 'USD', 0)
      RETURNING id;
    `) as unknown as Array<{ id: string }>;

    // Seed search_documents row
    await sql`
      INSERT INTO search_documents (
        product_id, store_id, title, description, brand, tags, category_name,
        price_cents, rating_avg, rating_count, status, visibility, in_stock,
        tsv
      ) VALUES (
        ${product!.id}, ${store!.id}, 'Audiophile Wireless Headphones', 'Noise cancelling',
        'AudioBrand', '{}', 'Electronics', 19900, 0, 0, 'active', 'public', true,
        to_tsvector('english', 'Audiophile Wireless Headphones')
      )
      ON CONFLICT (product_id) DO NOTHING;
    `;

    const reviewService = new ReviewService(sql);

    // 3. Buyer 2 (never purchased) attempts to leave a review -> rejected with 403
    await expect(
      reviewService.createReview(buyer2!.id, product!.id, {
        rating: 5,
        body: 'Never bought this, trying to leave a review.',
      }),
    ).rejects.toThrow(NotVerifiedPurchaserError);

    // 4. Create an order for Buyer 1, but fulfillment is still PROCESSING (not DELIVERED)
    const [order] = (await sql`
      INSERT INTO orders (user_id, status, payment_status, currency, total_cents)
      VALUES (${buyer1!.id}, 'confirmed', 'PAID', 'USD', 19900)
      RETURNING id;
    `) as unknown as Array<{ id: string }>;

    const [sellerOrder] = (await sql`
      INSERT INTO seller_orders (order_id, store_id, fulfillment_status, subtotal_cents)
      VALUES (${order!.id}, ${store!.id}, 'PROCESSING', 19900)
      RETURNING id;
    `) as unknown as Array<{ id: string }>;

    const [orderItem] = (await sql`
      INSERT INTO order_items (order_id, seller_order_id, variant_id, quantity, unit_price_cents, total_price_cents)
      VALUES (${order!.id}, ${sellerOrder!.id}, ${variant!.id}, 1, 19900, 19900)
      RETURNING id;
    `) as unknown as Array<{ id: string }>;

    // Buyer 1 attempts review before package is delivered -> rejected
    await expect(
      reviewService.createReview(buyer1!.id, product!.id, {
        rating: 5,
        body: 'Order is still processing in transit!',
      }),
    ).rejects.toThrow(NotVerifiedPurchaserError);

    // 5. Update fulfillment to DELIVERED
    await sql`
      UPDATE seller_orders
      SET fulfillment_status = 'DELIVERED', updated_at = NOW()
      WHERE id = ${sellerOrder!.id};
    `;

    // Buyer 1 submits review -> succeeds!
    const createdReview = await reviewService.createReview(buyer1!.id, product!.id, {
      rating: 5,
      body: 'Amazing headphones! Bass is rich and battery lasts 30 hours.',
    });

    expect(createdReview.id).toBeDefined();
    expect(createdReview.rating).toBe(5);
    expect(createdReview.isVerifiedPurchaser).toBe(true);
    expect(createdReview.authorName).toBe('Buyer One');

    // Verify outbox record
    const outboxRows = (await sql`
      SELECT id, event_type, payload
      FROM outbox
      WHERE aggregate_id = ${createdReview.id} AND event_type = 'review.created';
    `) as unknown as Array<{ id: string; event_type: string; payload: Record<string, unknown> }>;

    expect(outboxRows.length).toBeGreaterThanOrEqual(1);

    // 6. Buyer 1 attempts duplicate review for same product -> rejected with 409
    await expect(
      reviewService.createReview(buyer1!.id, product!.id, {
        rating: 4,
        body: 'Trying to review a second time!',
      }),
    ).rejects.toThrow(ReviewAlreadyExistsError);

    // 7. Verify asynchronous rating rollup projection
    const rollup = await reviewService.updateRatingRollup(product!.id);
    expect(rollup.ratingSum).toBe(5);
    expect(rollup.ratingCount).toBe(1);
    expect(rollup.ratingAvg).toBe(5.0);

    const [prodCheck] = (await sql`
      SELECT rating_sum, rating_count FROM products WHERE id = ${product!.id};
    `) as unknown as Array<{ rating_sum: number; rating_count: number }>;
    expect(prodCheck!.rating_sum).toBe(5);
    expect(prodCheck!.rating_count).toBe(1);

    const [searchCheck] = (await sql`
      SELECT rating_avg, rating_count FROM search_documents WHERE product_id = ${product!.id};
    `) as unknown as Array<{ rating_avg: number; rating_count: number }>;
    expect(Number(searchCheck!.rating_avg)).toBe(5.0);
    expect(searchCheck!.rating_count).toBe(1);

    // Clean up
    await sql`DELETE FROM reviews WHERE product_id = ${product!.id};`;
    await sql`DELETE FROM search_documents WHERE product_id = ${product!.id};`;
    await sql`DELETE FROM order_items WHERE id = ${orderItem!.id};`;
    await sql`DELETE FROM seller_orders WHERE id = ${sellerOrder!.id};`;
    await sql`DELETE FROM orders WHERE id = ${order!.id};`;
    await sql`DELETE FROM product_variants WHERE id = ${variant!.id};`;
    await sql`DELETE FROM products WHERE id = ${product!.id};`;
    await sql`DELETE FROM stores WHERE id = ${store!.id};`;
    await sql`DELETE FROM users WHERE id IN (${buyer1!.id}, ${buyer2!.id});`;
    await sql.end();
  });
});
