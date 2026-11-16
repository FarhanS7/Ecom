export * from './schema.js';
export * from './errors.js';
export * from './financial-ledger.service.js';
export * from './refund.service.js';
export * from './settlement.service.js';
export * from './signature-validator.js';
export * from './webhook.service.js';
export * from './reconciliation.service.js';

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
  initiatePayment() { return Promise.reject(new Error('Not implemented')); },
  handleWebhook() { return Promise.reject(new Error('Not implemented')); },
  findPaymentByOrder() { return Promise.resolve(null); },
  reconcileUncertainPayments() { return Promise.reject(new Error('Not implemented')); },
};