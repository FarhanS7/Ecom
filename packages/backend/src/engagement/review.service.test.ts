// packages/backend/src/engagement/review.service.test.ts - Unit tests for ReviewService (RV-1, RV-2 / T064).

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Sql } from 'postgres';
import { ReviewService, type ReviewDbRow } from './review.service.js';
import {
  InvalidRatingError,
  NotVerifiedPurchaserError,
  ReviewAlreadyExistsError,
} from './errors.js';

vi.mock('../platform/outbox.service.js', () => ({
  writeOutboxEvent: vi.fn().mockResolvedValue({ id: 'outbox-mock-1' }),
}));

function createSql(mock: unknown): Sql {
  return mock as unknown as Sql;
}

describe('ReviewService (T064 Unit Tests)', () => {
  const productId = '11111111-1111-4111-8111-111111111111';
  const userId = '22222222-2222-4222-8222-222222222222';
  const orderItemId = '33333333-3333-4333-8333-333333333333';
  const reviewId = '44444444-4444-4444-8444-444444444444';

  const baseReviewRow: ReviewDbRow = {
    id: reviewId,
    product_id: productId,
    user_id: userId,
    order_item_id: orderItemId,
    rating: 5,
    body: 'Outstanding build quality and battery life.',
    status: 'published',
    created_at: new Date('2026-11-16T12:00:00Z'),
    updated_at: new Date('2026-11-16T12:00:00Z'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createReview', () => {
    it('throws InvalidRatingError when rating is less than 1 or greater than 5 or not an integer', async () => {
      const mockSql = vi.fn();
      const service = new ReviewService(createSql(mockSql));

      await expect(
        service.createReview(userId, productId, { rating: 0, body: 'Bad rating' }),
      ).rejects.toThrow(InvalidRatingError);

      await expect(
        service.createReview(userId, productId, { rating: 6, body: 'Too high' }),
      ).rejects.toThrow(InvalidRatingError);

      await expect(
        service.createReview(userId, productId, { rating: 3.5, body: 'Fractional' }),
      ).rejects.toThrow(InvalidRatingError);

      expect(mockSql).not.toHaveBeenCalled();
    });

    it('throws ReviewAlreadyExistsError when customer has already reviewed this product', async () => {
      const mockSql = vi.fn().mockImplementation((strings: TemplateStringsArray) => {
        const query = strings.join('').replace(/\s+/g, ' ');
        if (query.includes('SELECT id FROM reviews')) {
          return Promise.resolve([{ id: reviewId }]);
        }
        return Promise.resolve([]);
      });

      const service = new ReviewService(createSql(mockSql));

      await expect(
        service.createReview(userId, productId, {
          rating: 5,
          body: 'Great second review attempt',
        }),
      ).rejects.toThrow(ReviewAlreadyExistsError);
    });

    it('throws NotVerifiedPurchaserError when customer has no delivered order item for product', async () => {
      const mockSql = vi.fn().mockImplementation((strings: TemplateStringsArray) => {
        const query = strings.join('').replace(/\s+/g, ' ');
        if (query.includes('SELECT id FROM reviews')) {
          return Promise.resolve([]); // No existing review
        }
        if (query.includes('FROM order_items oi')) {
          return Promise.resolve([]); // No delivered order item
        }
        return Promise.resolve([]);
      });

      const service = new ReviewService(createSql(mockSql));

      await expect(
        service.createReview(userId, productId, {
          rating: 5,
          body: 'I never actually bought this item',
        }),
      ).rejects.toThrow(NotVerifiedPurchaserError);
    });

    it('inserts review and writes outbox event when purchaser is verified', async () => {
      const mockSql = vi.fn().mockImplementation((strings: TemplateStringsArray) => {
        const query = strings.join('').replace(/\s+/g, ' ');
        if (query.includes('SELECT id FROM reviews')) {
          return Promise.resolve([]);
        }
        if (query.includes('FROM order_items oi')) {
          return Promise.resolve([{ order_item_id: orderItemId }]);
        }
        if (query.includes('INSERT INTO reviews')) {
          return Promise.resolve([baseReviewRow]);
        }
        if (query.includes('SELECT name, email FROM users')) {
          return Promise.resolve([{ name: 'Alice Smith', email: 'alice@example.com' }]);
        }
        return Promise.resolve([]);
      });

      (mockSql as unknown as { begin: unknown }).begin = vi
        .fn()
        .mockImplementation(async (callback: (tx: Sql) => Promise<unknown>) => {
          return callback(createSql(mockSql));
        });

      const service = new ReviewService(createSql(mockSql));

      const review = await service.createReview(userId, productId, {
        rating: 5,
        body: 'Outstanding build quality and battery life.',
      });

      expect(review.id).toBe(reviewId);
      expect(review.productId).toBe(productId);
      expect(review.rating).toBe(5);
      expect(review.authorName).toBe('Alice Smith');
      expect(review.isVerifiedPurchaser).toBe(true);
    });
  });

  describe('listReviewsForProduct', () => {
    it('returns reviews with author names and aggregate rating stats', async () => {
      const mockSql = vi.fn().mockImplementation((strings: TemplateStringsArray) => {
        const query = strings.join('').replace(/\s+/g, ' ');
        if (query.includes('FROM reviews r')) {
          return Promise.resolve([
            {
              ...baseReviewRow,
              author_name: 'Alice Smith',
            },
          ]);
        }
        if (query.includes('FROM products')) {
          return Promise.resolve([{ rating_sum: 10, rating_count: 2 }]);
        }
        return Promise.resolve([]);
      });

      const service = new ReviewService(createSql(mockSql));
      const result = await service.listReviewsForProduct(productId);

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.authorName).toBe('Alice Smith');
      expect(result.ratingAvg).toBe(5.0);
      expect(result.ratingCount).toBe(2);
    });

    it('returns 0 rating average if rating_count is 0', async () => {
      const mockSql = vi.fn().mockImplementation((strings: TemplateStringsArray) => {
        const query = strings.join('').replace(/\s+/g, ' ');
        if (query.includes('FROM reviews r')) {
          return Promise.resolve([]);
        }
        if (query.includes('FROM products')) {
          return Promise.resolve([{ rating_sum: 0, rating_count: 0 }]);
        }
        return Promise.resolve([]);
      });

      const service = new ReviewService(createSql(mockSql));
      const result = await service.listReviewsForProduct(productId);

      expect(result.items).toEqual([]);
      expect(result.ratingAvg).toBe(0);
      expect(result.ratingCount).toBe(0);
    });
  });

  describe('updateRatingRollup', () => {
    it('aggregates reviews and updates products and search_documents', async () => {
      const mockSql = vi.fn().mockImplementation((strings: TemplateStringsArray) => {
        const query = strings.join('').replace(/\s+/g, ' ');
        if (query.includes('SELECT') && query.includes('rating_sum')) {
          return Promise.resolve([{ rating_sum: 18, rating_count: 4 }]);
        }
        if (query.includes('UPDATE products')) {
          return Promise.resolve([]);
        }
        if (query.includes('UPDATE search_documents')) {
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      });

      const service = new ReviewService(createSql(mockSql));
      const result = await service.updateRatingRollup(productId);

      expect(result.ratingSum).toBe(18);
      expect(result.ratingCount).toBe(4);
      expect(result.ratingAvg).toBe(4.5);
    });
  });
});
