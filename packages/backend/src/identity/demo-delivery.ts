// @shopscale/backend/identity/demo-delivery - Local demo delivery sink.
// Demo ONLY: password-reset and verification proofs are recorded here instead
// of emailed (provider integrations are deferred production work). It exists
// so the full recovery loop is exercisable without accounts or money.
// NEVER use for real users: deliveries contain single-use secrets in clear.

export type DeliveryPurpose = 'reset' | 'verification';

export interface Delivery {
  to: string;
  purpose: DeliveryPurpose;
  /** Single-use proof, cleartext by demo design. Redacted everywhere else. */
  token: string;
  createdAt: Date;
}

export class DemoDeliverySink {
  private outbox: Delivery[] = [];

  send(input: { to: string; purpose: DeliveryPurpose; token: string }): void {
    this.outbox.push({ ...input, createdAt: new Date() });
  }

  list(): Delivery[] {
    return [...this.outbox];
  }

  clear(): void {
    this.outbox = [];
  }
}

/** Process-local demo singleton wired by default. Tests use fresh instances
 * or clear() between cases — never assert across cases without clearing. */
export const demoDelivery = new DemoDeliverySink();
