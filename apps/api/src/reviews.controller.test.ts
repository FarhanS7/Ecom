// @shopscale/api/reviews.controller.test - Unit tests for ReviewsController (RV-1, RV-2 / T064).

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ReviewsController } from './reviews.controller.js';
import {
  InvalidRatingError,
  NotVerifiedPurchaserError,
  ReviewAlreadyExistsError,
  reviewService,
} from '@shopscale/backend';

vi.mock('@shopscale/backend', () => ({
  reviewService: {
    listReviewsForProduct: vi.fn(),
    createReview: vi.fn(),
  },
  NotVerifiedPurchaserError: class NotVerifiedPurchaserError extends Error {
    readonly status = 403;
    readonly code = 'NOT_VERIFIED_PURCHASER';
  },
  ReviewAlreadyExistsError: class ReviewAlreadyExistsError extends Error {
    readonly status = 409;
    readonly code = 'REVIEW_ALREADY_EXISTS';
  },
  InvalidRatingError: class InvalidRatingError extends Error {
    readonly status = 400;
    readonly code = 'INVALID_RATING';
  },
  ReviewNotFoundError: class ReviewNotFoundError extends Error {
    readonly status = 404;
    readonly code = 'REVIEW_NOT_FOUND';
  },
}));

describe('ReviewsController (T064 Unit Tests)', () => {
  let controller: ReviewsController;
  const productId = '11111111-1111-4111-8111-111111111111';
  const userId = '22222222-2222-4222-8222-222222222222';
  const reviewId = '33333333-3333-4333-8333-333333333333';

  const mockReview = {
    id: reviewId,
    productId,
    rating: 5,
    body: 'Fantastic product! Delivered fast and works perfectly.',
    authorName: 'Alice',
    isVerifiedPurchaser: true,
    createdAt: '2026-11-16T12:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new ReviewsController();
  });

  describe('GET /v1/catalog/products/:productId/reviews', () => {
    it('returns reviews list and aggregate ratings for valid product ID', async () => {
      vi.mocked(reviewService.listReviewsForProduct).mockResolvedValueOnce({
        items: [mockReview],
        ratingAvg: 5.0,
        ratingCount: 1,
        nextCursor: null,
      });

      const result = await controller.listReviews(productId);

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.authorName).toBe('Alice');
      expect(result.ratingAvg).toBe(5.0);
      expect(result.ratingCount).toBe(1);
      expect(reviewService.listReviewsForProduct).toHaveBeenCalledWith(productId);
    });

    it('throws NotFoundException for non-UUID product ID', async () => {
      await expect(controller.listReviews('invalid-uuid')).rejects.toThrow(
        NotFoundException,
      );
      expect(reviewService.listReviewsForProduct).not.toHaveBeenCalled();
    });
  });

  describe('POST /v1/catalog/products/:productId/reviews', () => {
    const validBody = {
      rating: 5,
      body: 'Fantastic product! Delivered fast and works perfectly.',
    };

    it('creates review successfully for verified purchaser', async () => {
      vi.mocked(reviewService.createReview).mockResolvedValueOnce(mockReview);

      const result = await controller.createReview(
        productId,
        { actor: { userId, email: 'alice@example.com', roles: ['buyer'] } },
        validBody,
      );

      expect(result).toEqual(mockReview);
      expect(reviewService.createReview).toHaveBeenCalledWith(
        userId,
        productId,
        validBody,
      );
    });

    it('throws UnauthorizedException when actor is missing', async () => {
      await expect(
        controller.createReview(productId, {}, validBody),
      ).rejects.toThrow(UnauthorizedException);

      expect(reviewService.createReview).not.toHaveBeenCalled();
    });

    it('throws BadRequestException for invalid rating (e.g. 6 stars)', async () => {
      await expect(
        controller.createReview(
          productId,
          { actor: { userId, email: 'alice@example.com', roles: ['buyer'] } },
          { rating: 6, body: 'Super great!' },
        ),
      ).rejects.toThrow(BadRequestException);

      expect(reviewService.createReview).not.toHaveBeenCalled();
    });

    it('throws BadRequestException for review body too short', async () => {
      await expect(
        controller.createReview(
          productId,
          { actor: { userId, email: 'alice@example.com', roles: ['buyer'] } },
          { rating: 4, body: 'ok' },
        ),
      ).rejects.toThrow(BadRequestException);

      expect(reviewService.createReview).not.toHaveBeenCalled();
    });

    it('maps NotVerifiedPurchaserError to 403 Forbidden', async () => {
      vi.mocked(reviewService.createReview).mockRejectedValueOnce(
        new NotVerifiedPurchaserError(productId),
      );

      await expect(
        controller.createReview(
          productId,
          { actor: { userId, email: 'alice@example.com', roles: ['buyer'] } },
          validBody,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('maps ReviewAlreadyExistsError to 409 Conflict', async () => {
      vi.mocked(reviewService.createReview).mockRejectedValueOnce(
        new ReviewAlreadyExistsError(productId),
      );

      await expect(
        controller.createReview(
          productId,
          { actor: { userId, email: 'alice@example.com', roles: ['buyer'] } },
          validBody,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('maps InvalidRatingError to 400 BadRequest', async () => {
      vi.mocked(reviewService.createReview).mockRejectedValueOnce(
        new InvalidRatingError(0),
      );

      await expect(
        controller.createReview(
          productId,
          { actor: { userId, email: 'alice@example.com', roles: ['buyer'] } },
          validBody,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
