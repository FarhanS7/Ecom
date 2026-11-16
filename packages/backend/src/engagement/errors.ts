// packages/backend/src/engagement/errors.ts - Domain errors for reviews and wishlists (RV-1, RV-2 / T064).

export class EngagementError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 400, code = 'ENGAGEMENT_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.code = code;
  }
}

export class NotVerifiedPurchaserError extends EngagementError {
  constructor(_productId?: string) {
    super(
      `Only customers who have purchased and received this product may leave a review.`,
      403,
      'NOT_VERIFIED_PURCHASER',
    );
  }
}

export class ReviewAlreadyExistsError extends EngagementError {
  constructor(_productId?: string) {
    super(
      `You have already submitted a review for this product. Only one review per customer is permitted.`,
      409,
      'REVIEW_ALREADY_EXISTS',
    );
  }
}

export class ReviewNotFoundError extends EngagementError {
  constructor(reviewId: string) {
    super(`Review '${reviewId}' was not found.`, 404, 'REVIEW_NOT_FOUND');
  }
}

export class InvalidRatingError extends EngagementError {
  constructor(rating: number) {
    super(`Rating must be an integer between 1 and 5 (received ${rating}).`, 400, 'INVALID_RATING');
  }
}

export class ProductNotFoundError extends EngagementError {
  constructor(productId: string) {
    super(`Product '${productId}' was not found.`, 404, 'PRODUCT_NOT_FOUND');
  }
}
