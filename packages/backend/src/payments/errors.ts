// @shopscale/backend/payments/errors - Domain errors for refunds and financial ledger (T060).

export class UnbalancedLedgerError extends Error {
  constructor(
    public readonly totalDebits: number,
    public readonly totalCredits: number,
  ) {
    super(
      `Financial ledger entries are unbalanced: total debits (${totalDebits} cents) do not equal total credits (${totalCredits} cents).`,
    );
    this.name = 'UnbalancedLedgerError';
  }
}

export class RefundExceedsPaymentError extends Error {
  constructor(
    public readonly requestedCents: number,
    public readonly remainingCents: number,
  ) {
    super(
      `Requested refund (${requestedCents} cents) exceeds remaining refundable payment balance (${remainingCents} cents).`,
    );
    this.name = 'RefundExceedsPaymentError';
  }
}

export class InvalidRefundAmountError extends Error {
  constructor(public readonly amountCents: number) {
    super(`Refund amount must be strictly greater than 0, received ${amountCents} cents.`);
    this.name = 'InvalidRefundAmountError';
  }
}

export class NoPaidPaymentError extends Error {
  constructor(public readonly orderId: string) {
    super(`Order '${orderId}' has no captured PAID payment attempt.`);
    this.name = 'NoPaidPaymentError';
  }
}

export class RefundPolicyCapExceededError extends Error {
  constructor(
    public readonly requestedCents: number,
    public readonly policyCapCents: number,
  ) {
    super(
      `Requested refund (${requestedCents} cents) exceeds non-escalated support policy limit of ${policyCapCents} cents.`,
    );
    this.name = 'RefundPolicyCapExceededError';
  }
}
