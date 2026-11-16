// @shopscale/backend/cart/errors - Cart domain error types (T041).

export class CartValidationError extends Error {
  constructor(message: string, public readonly code: string = 'CART_VALIDATION_ERROR') {
    super(message);
    this.name = 'CartValidationError';
  }
}

export class StoreMismatchError extends Error {
  constructor(message = 'Product variant does not belong to this store') {
    super(message);
    this.name = 'StoreMismatchError';
  }
}

export class VariantNotFoundError extends Error {
  constructor(message = 'Product variant not found') {
    super(message);
    this.name = 'VariantNotFoundError';
  }
}

export class CartNotFoundError extends Error {
  constructor(message = 'Cart not found') {
    super(message);
    this.name = 'CartNotFoundError';
  }
}

export class CartOwnershipError extends Error {
  constructor(message = 'Access to this cart is unauthorized') {
    super(message);
    this.name = 'CartOwnershipError';
  }
}

export class TamperedTokenError extends Error {
  constructor(message = 'Tampered or invalid guest token signature') {
    super(message);
    this.name = 'TamperedTokenError';
  }
}

export class CartAlreadyMergedError extends Error {
  constructor(message = 'Guest cart has already been merged', public readonly code: string = 'CART_ALREADY_MERGED') {
    super(message);
    this.name = 'CartAlreadyMergedError';
  }
}
