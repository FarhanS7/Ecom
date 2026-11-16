// packages/backend/src/promotions/errors.ts - Domain errors for promotions and coupons (OR-9 / T063).

export class PromotionError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 400, code = 'PROMOTION_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.code = code;
  }
}

export class CouponNotFoundError extends PromotionError {
  constructor(codeOrId: string) {
    super(`Coupon '${codeOrId}' was not found.`, 404, 'COUPON_NOT_FOUND');
  }
}

export class CouponInactiveError extends PromotionError {
  constructor(code: string) {
    super(`Coupon '${code}' is inactive or disabled.`, 400, 'COUPON_INACTIVE');
  }
}

export class CouponExpiredError extends PromotionError {
  constructor(code: string) {
    super(`Coupon '${code}' has expired.`, 400, 'COUPON_EXPIRED');
  }
}

export class CouponNotStartedError extends PromotionError {
  constructor(code: string) {
    super(`Coupon '${code}' is not yet valid.`, 400, 'COUPON_NOT_YET_VALID');
  }
}

export class CouponGlobalLimitExceededError extends PromotionError {
  constructor(code: string) {
    super(`Coupon '${code}' has reached its global redemption limit.`, 409, 'COUPON_LIMIT_EXCEEDED');
  }
}

export class CouponPerUserLimitExceededError extends PromotionError {
  constructor(code: string) {
    super(
      `You have already reached the redemption limit for coupon '${code}'.`,
      409,
      'COUPON_USER_LIMIT_EXCEEDED',
    );
  }
}

export class CouponStoreMismatchError extends PromotionError {
  constructor(code: string) {
    super(
      `Coupon '${code}' is valid only for products from its originating store.`,
      400,
      'COUPON_STORE_MISMATCH',
    );
  }
}

export class CouponConflictError extends PromotionError {
  constructor(code: string) {
    super(`Coupon with code '${code}' already exists in this scope.`, 409, 'COUPON_ALREADY_EXISTS');
  }
}
