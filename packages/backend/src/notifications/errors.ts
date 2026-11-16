// @shopscale/backend/notifications/errors - Domain errors for notifications & invoices (T061).

export class InvoiceNotFoundError extends Error {
  readonly code = 'INVOICE_NOT_FOUND';
  constructor(message = 'Invoice not found for order') {
    super(message);
    this.name = 'InvoiceNotFoundError';
  }
}

export class InvoiceForbiddenError extends Error {
  readonly code = 'INVOICE_FORBIDDEN';
  constructor(message = 'Not authorized to access this invoice') {
    super(message);
    this.name = 'InvoiceForbiddenError';
  }
}

export class InvoiceNotReadyError extends Error {
  readonly code = 'INVOICE_NOT_READY';
  constructor(message = 'Invoice generation is currently in progress') {
    super(message);
    this.name = 'InvoiceNotReadyError';
  }
}
