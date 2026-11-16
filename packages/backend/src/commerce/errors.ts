// @shopscale/backend/commerce/errors - Quote and commerce domain errors (T045).

export class PriceChangedError extends Error {
  constructor(
    public readonly variantId: string,
    public readonly expectedPriceCents: number,
    public readonly currentPriceCents: number,
  ) {
    super(
      `Price changed for variant ${variantId}: expected ${expectedPriceCents} cents, but current price is ${currentPriceCents} cents.`,
    );
    this.name = 'PriceChangedError';
  }
}

export class InvalidCouponError extends Error {
  public readonly code: string;
  constructor(public readonly couponCode: string) {
    super(`Coupon code '${couponCode}' is invalid or expired.`);
    this.name = 'InvalidCouponError';
    this.code = couponCode;
  }
}

export class InvalidQuoteTokenError extends Error {
  constructor(message = 'Quote token is invalid, tampered, or expired.') {
    super(message);
    this.name = 'InvalidQuoteTokenError';
  }
}

export class QuoteValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuoteValidationError';
  }
}

export class IdempotencyConflictError extends Error {
  constructor(message = 'Idempotency key was previously used with a different request payload.') {
    super(message);
    this.name = 'IdempotencyConflictError';
  }
}

export class InsufficientStockError extends Error {
  constructor(
    public readonly variantId: string,
    public readonly available: number,
    message?: string,
  ) {
    super(message ?? `Insufficient stock for variant ${variantId}: available ${available}`);
    this.name = 'InsufficientStockError';
  }
}

export class AddressNotFoundError extends Error {
  constructor(public readonly addressId: string) {
    super(`Address ${addressId} was not found or does not belong to user.`);
    this.name = 'AddressNotFoundError';
  }
}

export class MissingIdempotencyKeyError extends Error {
  constructor(message = 'Missing required Idempotency-Key header') {
    super(message);
    this.name = 'MissingIdempotencyKeyError';
  }
}

export class OrderNotFoundError extends Error {
  constructor(message = 'Order not found') {
    super(message);
    this.name = 'OrderNotFoundError';
  }
}

export class SuborderNotFoundError extends Error {
  constructor(message = 'Suborder not found') {
    super(message);
    this.name = 'SuborderNotFoundError';
  }
}

export class OrderNotPaidError extends Error {
  constructor(public readonly paymentStatus: string) {
    super(`Cannot transition fulfillment status for an unpaid order (current payment status: ${paymentStatus}).`);
    this.name = 'OrderNotPaidError';
  }
}

export class IllegalFulfillmentTransitionError extends Error {
  constructor(
    public readonly fromStatus: string,
    public readonly toStatus: string,
    message?: string,
  ) {
    super(
      message ??
        `Illegal fulfillment transition from '${fromStatus}' to '${toStatus}'.`,
    );
    this.name = 'IllegalFulfillmentTransitionError';
  }
}

export class MissingTrackingRefError extends Error {
  constructor(message = 'trackingRef is required when transitioning suborder to SHIPPED.') {
    super(message);
    this.name = 'MissingTrackingRefError';
  }
}

export class FulfillmentSuborderNotFoundError extends Error {
  constructor(public readonly suborderId: string) {
    super(`Suborder '${suborderId}' was not found.`);
    this.name = 'FulfillmentSuborderNotFoundError';
  }
}

export class FulfillmentStoreMismatchError extends Error {
  constructor(public readonly storeId: string, public readonly suborderId: string) {
    super(`Suborder '${suborderId}' does not belong to store '${storeId}'.`);
    this.name = 'FulfillmentStoreMismatchError';
  }
}

export class AlreadyShippedError extends Error {
  constructor(message = 'Cannot cancel an order that has already shipped or been delivered.') {
    super(message);
    this.name = 'AlreadyShippedError';
  }
}

export class OrderAlreadyCancelledError extends Error {
  constructor(message = 'Order is already cancelled.') {
    super(message);
    this.name = 'OrderAlreadyCancelledError';
  }
}

export class OrderNotDeliveredError extends Error {
  constructor(message = 'Cannot submit return request on an order that has not been delivered.') {
    super(message);
    this.name = 'OrderNotDeliveredError';
  }
}

export class ReturnQuantityExceededError extends Error {
  constructor(
    public readonly requestedQty: number,
    public readonly maxReturnableQty: number,
  ) {
    super(
      `Requested return quantity (${requestedQty}) exceeds remaining returnable quantity (${maxReturnableQty}).`,
    );
    this.name = 'ReturnQuantityExceededError';
  }
}

export class OrderItemNotFoundError extends Error {
  constructor(public readonly orderItemId: string) {
    super(`Order item '${orderItemId}' not found in order.`);
    this.name = 'OrderItemNotFoundError';
  }
}

export class ReturnRequestNotFoundError extends Error {
  constructor(public readonly returnId: string) {
    super(`Return request '${returnId}' not found.`);
    this.name = 'ReturnRequestNotFoundError';
  }
}

export class ReturnAlreadyInspectedError extends Error {
  constructor(public readonly returnId: string, public readonly currentStatus: string) {
    super(`Return request '${returnId}' has already been inspected (status: ${currentStatus}).`);
    this.name = 'ReturnAlreadyInspectedError';
  }
}



