// @shopscale/mock-payments/ledger - In-memory persistent mock payment attempt ledger (T049).
// Invariants:
// 1. Reused effectKey with identical amounts is idempotent (returns existing attempt).
// 2. Reused effectKey with conflicting amount or currency throws 409 Conflict.
// 3. Status updates track transition to SUCCEEDED or FAILED.

import type { PaymentOutcome } from '@shopscale/contracts';

export interface MockPaymentEntry {
  effectKey: string;
  providerRef: string;
  amountCents: string;
  currency: 'USD';
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
  simulateOutcome: PaymentOutcome;
  returnUrl?: string | undefined;
  webhookUrl?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export class ConflictingEffectKeyError extends Error {
  constructor(
    public readonly effectKey: string,
    public readonly existingAmountCents: string,
    public readonly requestedAmountCents: string,
  ) {
    super(
      `Conflicting effectKey '${effectKey}': existing amount is ${existingAmountCents} cents, requested was ${requestedAmountCents} cents`,
    );
    this.name = 'ConflictingEffectKeyError';
  }
}

export class MockPaymentLedger {
  private readonly entries = new Map<string, MockPaymentEntry>();

  public recordAttempt(params: {
    effectKey: string;
    providerRef: string;
    amountCents: string;
    currency: 'USD';
    simulateOutcome: PaymentOutcome;
    returnUrl?: string | undefined;
    webhookUrl?: string | undefined;
  }): { entry: MockPaymentEntry; isNew: boolean } {
    const existing = this.entries.get(params.effectKey);
    if (existing) {
      if (existing.amountCents !== params.amountCents || existing.currency !== params.currency) {
        throw new ConflictingEffectKeyError(params.effectKey, existing.amountCents, params.amountCents);
      }
      return { entry: existing, isNew: false };
    }

    const now = new Date().toISOString();
    const newEntry: MockPaymentEntry = {
      effectKey: params.effectKey,
      providerRef: params.providerRef,
      amountCents: params.amountCents,
      currency: params.currency,
      status: 'PENDING',
      simulateOutcome: params.simulateOutcome,
      returnUrl: params.returnUrl,
      webhookUrl: params.webhookUrl,
      createdAt: now,
      updatedAt: now,
    };

    this.entries.set(params.effectKey, newEntry);
    return { entry: newEntry, isNew: true };
  }

  public getAttempt(effectKey: string): MockPaymentEntry | null {
    return this.entries.get(effectKey) ?? null;
  }

  public updateStatus(effectKey: string, status: 'PENDING' | 'SUCCEEDED' | 'FAILED'): MockPaymentEntry | null {
    const entry = this.entries.get(effectKey);
    if (!entry) return null;
    entry.status = status;
    entry.updatedAt = new Date().toISOString();
    return entry;
  }

  public clear(): void {
    this.entries.clear();
  }

  public size(): number {
    return this.entries.size;
  }
}
