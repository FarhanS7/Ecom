// packages/backend/src/engagement/review.service.ts - Verified purchaser reviews and rating rollup engine (RV-1, RV-2 / T064).

import type { Sql, TransactionSql } from 'postgres';
import type { CreateReviewDto, ListReviewsResponseDto, ReviewDto } from '@shopscale/contracts';
import { getDb } from '../db/client.js';
import { writeOutboxEvent } from '../platform/outbox.service.js';
import {
  InvalidRatingError,
  NotVerifiedPurchaserError,
  ReviewAlreadyExistsError,
} from './errors.js';

export type ReviewSqlOrTx =
  | Sql
  | TransactionSql
  | {
      unsafe: (query: string, params?: unknown[]) => Promise<unknown[]>;
    };

function asSql(tx: ReviewSqlOrTx): Sql {
  return tx as unknown as Sql;
}

export interface ReviewDbRow {
  id: string;
  product_id: string;
  user_id: string;
  order_item_id: string | null;
  rating: number;
  body: string;
  status: 'published' | 'hidden' | 'flagged';
  created_at: Date;
  updated_at: Date;
  author_name?: string | undefined;
}

export class ReviewService {
  constructor(private readonly explicitSql?: Sql) {}

  /**
   * Submits a verified purchaser review for a product.
   * Requires that the customer has at least one DELIVERED order item containing this product.
   */
  async createReview(
    actorId: string,
    productId: string,
    input: CreateReviewDto,
    txOverride?: ReviewSqlOrTx,
  ): Promise<ReviewDto> {
    if (input.rating < 1 || input.rating > 5 || !Number.isInteger(input.rating)) {
      throw new InvalidRatingError(input.rating);
    }

    const sql = txOverride ? asSql(txOverride) : this.getSql();

    // 1. Check duplicate review: strictly 1 review per customer per product
    const existing = (await sql`
      SELECT id FROM reviews
      WHERE product_id = ${productId} AND user_id = ${actorId};
    `) as unknown as Array<{ id: string }>;

    if (existing.length > 0) {
      throw new ReviewAlreadyExistsError(productId);
    }

    // 2. Verified purchaser check:
    // Requires an order item for a variant of this product from a PAID order
    // where the associated seller suborder has reached DELIVERED status.
    const deliveredItems = (await sql`
      SELECT oi.id AS order_item_id
      FROM order_items oi
      JOIN product_variants pv ON pv.id = oi.variant_id
      JOIN orders o ON o.id = oi.order_id
      JOIN seller_orders so ON so.id = oi.seller_order_id
      WHERE pv.product_id = ${productId}
        AND o.user_id = ${actorId}
        AND o.payment_status = 'PAID'
        AND so.fulfillment_status = 'DELIVERED'
      LIMIT 1;
    `) as unknown as Array<{ order_item_id: string }>;

    if (deliveredItems.length === 0) {
      throw new NotVerifiedPurchaserError(productId);
    }

    const orderItemId = deliveredItems[0]!.order_item_id;

    // 3. Insert review and write ReviewCreated domain event to outbox
    const insertOp = async (tx: Sql): Promise<ReviewDto> => {
      const rows = (await tx`
        INSERT INTO reviews (
          product_id,
          user_id,
          order_item_id,
          rating,
          body,
          status
        ) VALUES (
          ${productId},
          ${actorId},
          ${orderItemId},
          ${input.rating},
          ${input.body.trim()},
          'published'
        )
        RETURNING *;
      `) as unknown as ReviewDbRow[];

      const review = rows[0]!;

      // Lookup author name
      const userRows = (await tx`
        SELECT name, email FROM users WHERE id = ${actorId};
      `) as unknown as Array<{ name: string | null; email: string }>;
      const user = userRows[0];
      const authorName = user?.name || user?.email.split('@')[0] || 'Customer';

      // Emit transactional outbox event
      await writeOutboxEvent(tx, {
        aggregateType: 'review',
        aggregateId: review.id,
        type: 'review.created',
        payload: {
          reviewId: review.id,
          productId,
          customerId: actorId,
          rating: review.rating,
        },
      });

      return {
        id: review.id,
        productId: review.product_id,
        rating: review.rating,
        body: review.body,
        authorName,
        isVerifiedPurchaser: true,
        createdAt: review.created_at.toISOString(),
      };
    };

    if (txOverride) {
      return insertOp(asSql(txOverride));
    }

    return this.getSql().begin((tx) => insertOp(tx as unknown as Sql));
  }

  /**
   * Lists reviews for a product with author names and aggregate rating stats.
   */
  async listReviewsForProduct(
    productId: string,
    options?: { limit?: number | undefined; cursor?: string | undefined },
  ): Promise<ListReviewsResponseDto> {
    const limit = Math.min(options?.limit ?? 20, 50);
    const sql = this.getSql();

    // 1. Fetch published reviews with user author name
    const rows = (await sql`
      SELECT
        r.id,
        r.product_id,
        r.rating,
        r.body,
        r.created_at,
        r.order_item_id,
        COALESCE(u.name, split_part(u.email, '@', 1)) AS author_name
      FROM reviews r
      JOIN users u ON u.id = r.user_id
      WHERE r.product_id = ${productId} AND r.status = 'published'
      ORDER BY r.created_at DESC
      LIMIT ${limit};
    `) as unknown as Array<ReviewDbRow & { author_name: string }>;

    // 2. Fetch aggregate rating info from products table
    const prodRows = (await sql`
      SELECT rating_sum, rating_count
      FROM products
      WHERE id = ${productId};
    `) as unknown as Array<{ rating_sum: number; rating_count: number }>;

    const prod = prodRows[0];
    const ratingSum = prod?.rating_sum ?? 0;
    const ratingCount = prod?.rating_count ?? 0;
    const ratingAvg = ratingCount > 0 ? Number((ratingSum / ratingCount).toFixed(2)) : 0;

    const items: ReviewDto[] = rows.map((r) => ({
      id: r.id,
      productId: r.product_id,
      rating: r.rating,
      body: r.body,
      authorName: r.author_name || 'Customer',
      isVerifiedPurchaser: Boolean(r.order_item_id),
      createdAt: r.created_at.toISOString(),
    }));

    return {
      items,
      ratingAvg,
      ratingCount,
      nextCursor: null,
    };
  }

  /**
   * Recomputes rating sum, count, and average from approved reviews,
   * then updates both products table and search_documents projection.
   */
  async updateRatingRollup(
    productId: string,
    txOverride?: ReviewSqlOrTx,
  ): Promise<{ ratingSum: number; ratingCount: number; ratingAvg: number }> {
    const client = txOverride ? asSql(txOverride) : this.getSql();

    // 1. Compute aggregate sum and count
    const aggRows = (await client`
      SELECT
        COALESCE(SUM(rating), 0)::integer AS rating_sum,
        COUNT(*)::integer AS rating_count
      FROM reviews
      WHERE product_id = ${productId} AND status = 'published';
    `) as unknown as Array<{ rating_sum: number; rating_count: number }>;

    const agg = aggRows[0]!;
    const ratingSum = agg.rating_sum;
    const ratingCount = agg.rating_count;
    const ratingAvg = ratingCount > 0 ? Number((ratingSum / ratingCount).toFixed(2)) : 0;

    // 2. Update products table
    await client`
      UPDATE products
      SET
        rating_sum = ${ratingSum},
        rating_count = ${ratingCount},
        updated_at = NOW()
      WHERE id = ${productId};
    `;

    // 3. Update search_documents projection table
    await client`
      UPDATE search_documents
      SET
        rating_avg = ${ratingAvg},
        rating_count = ${ratingCount}
      WHERE product_id = ${productId};
    `;

    return { ratingSum, ratingCount, ratingAvg };
  }

  private getSql(): Sql {
    return this.explicitSql ?? getDb();
  }
}

export const reviewService = new ReviewService();
