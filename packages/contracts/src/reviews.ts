// packages/contracts/src/reviews.ts - Contracts for verified purchaser reviews and ratings (RV-1, RV-2 / T064).

import { z } from 'zod';

export const reviewStatusSchema = z.enum(['published', 'hidden', 'flagged']);
export type ReviewStatus = z.infer<typeof reviewStatusSchema>;

export const createReviewSchema = z.object({
  rating: z.number().int().min(1, 'Rating must be at least 1 star').max(5, 'Rating cannot exceed 5 stars'),
  body: z.string().trim().min(3, 'Review text must be at least 3 characters').max(2000, 'Review text cannot exceed 2000 characters'),
});

export type CreateReviewDto = z.infer<typeof createReviewSchema>;

export const reviewDtoSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  body: z.string(),
  authorName: z.string(),
  isVerifiedPurchaser: z.boolean(),
  createdAt: z.string().datetime(),
});

export type ReviewDto = z.infer<typeof reviewDtoSchema>;

export const listReviewsResponseSchema = z.object({
  items: z.array(reviewDtoSchema),
  ratingAvg: z.number().nonnegative(),
  ratingCount: z.number().int().nonnegative(),
  nextCursor: z.string().nullable(),
});

export type ListReviewsResponseDto = z.infer<typeof listReviewsResponseSchema>;
