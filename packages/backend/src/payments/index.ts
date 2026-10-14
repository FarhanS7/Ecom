// @shopscale/backend/payments - Mock provider, webhook ingestion, reconciliation
export interface Payment {
  id: string;
  orderId: string;
  providerRef: string;
  status: 'initiated' | 'pending' | 'succeeded' | 'failed' | 'cancelled';
  amountCents: number;
  currency: string;
  effectKey: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookEvent {
  eventId: string;
  provider: string;
  payload: unknown;
  receivedAt: Date;
  processedAt: Date | null;
}

export interface PaymentPorts {
  initiatePayment(data: { orderId: string; amountCents: number; currency: string; effectKey: string }): Promise<{ paymentId: string; paymentUrl: string }>;
  handleWebhook(eventId: string, provider: string, payload: unknown): Promise<void>;
  findPaymentByOrder(orderId: string): Promise<Payment | null>;
  reconcileUncertainPayments(): Promise<void>;
}

export const paymentPorts: PaymentPorts = {
  async initiatePayment() { throw new Error('Not implemented'); },
  async handleWebhook() { throw new Error('Not implemented'); },
  async findPaymentByOrder() { return null; },
  async reconcileUncertainPayments() { throw new Error('Not implemented'); },
};