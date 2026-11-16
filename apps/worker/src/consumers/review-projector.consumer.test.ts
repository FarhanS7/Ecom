// apps/worker/src/consumers/review-projector.consumer.test.ts - Unit tests for ReviewProjectorConsumer (T064 / RV-1, RV-2).

import { describe, it, expect, vi } from 'vitest';
import { ReviewProjectorConsumer } from './review-projector.consumer.js';
import type { OutboxRecord, ReviewService } from '@shopscale/backend';

describe('ReviewProjectorConsumer', () => {
  const dummyEvent: OutboxRecord = {
    id: 'outbox-123',
    aggregateType: 'review',
    aggregateId: 'rev-001',
    aggregateVersion: 1,
    eventType: 'review.created',
    payload: {
      reviewId: 'rev-001',
      productId: 'prod-456',
      customerId: 'user-789',
      rating: 5,
    },
    publishedAt: null,
    createdAt: new Date(),
  };

  it('updates rating rollup and invalidates caches on review.created event', async () => {
    const mockReviewService: Partial<ReviewService> = {
      updateRatingRollup: vi.fn().mockResolvedValue({
        ratingSum: 15,
        ratingCount: 3,
        ratingAvg: 5.0,
      }),
    };

    const mockCache = {
      invalidatePattern: vi.fn().mockResolvedValue(undefined),
    };

    const consumer = new ReviewProjectorConsumer({
      reviewService: mockReviewService as ReviewService,
      cache: mockCache,
    });

    const result = await consumer.processEvent(dummyEvent);

    expect(result).toEqual({
      productId: 'prod-456',
      ratingSum: 15,
      ratingCount: 3,
      ratingAvg: 5.0,
    });
    expect(mockReviewService.updateRatingRollup).toHaveBeenCalledWith('prod-456');
    expect(mockCache.invalidatePattern).toHaveBeenCalledWith('cache:pdp:prod-456*');
    expect(mockCache.invalidatePattern).toHaveBeenCalledWith('cache:search:*');
  });

  it('handles JSON string payload gracefully', async () => {
    const mockReviewService: Partial<ReviewService> = {
      updateRatingRollup: vi.fn().mockResolvedValue({
        ratingSum: 4,
        ratingCount: 1,
        ratingAvg: 4.0,
      }),
    };

    const consumer = new ReviewProjectorConsumer({
      reviewService: mockReviewService as ReviewService,
    });

    const stringEvent: OutboxRecord = {
      ...dummyEvent,
      payload: JSON.stringify({ productId: 'prod-999', rating: 4 }) as unknown as Record<string, unknown>,
    };

    const result = await consumer.processEvent(stringEvent);

    expect(result?.productId).toBe('prod-999');
    expect(mockReviewService.updateRatingRollup).toHaveBeenCalledWith('prod-999');
  });

  it('skips event and logs warning when productId is missing', async () => {
    const mockReviewService: Partial<ReviewService> = {
      updateRatingRollup: vi.fn(),
    };
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const consumer = new ReviewProjectorConsumer({
      reviewService: mockReviewService as ReviewService,
      logger: mockLogger,
    });

    const invalidEvent: OutboxRecord = {
      ...dummyEvent,
      payload: { someOtherField: 123 },
    };

    const result = await consumer.processEvent(invalidEvent);

    expect(result).toBeNull();
    expect(mockReviewService.updateRatingRollup).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('missing productId'),
    );
  });
});
