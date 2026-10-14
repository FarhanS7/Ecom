// @shopscale/backend/notifications - Email/SMS workers, invoice PDF, retry + DLQ
export interface Notification {
  id: string;
  type: 'email' | 'sms';
  to: string;
  subject: string | null;
  body: string;
  status: 'pending' | 'sent' | 'failed' | 'dead_letter';
  attempts: number;
  lastError: string | null;
  createdAt: Date;
  sentAt: Date | null;
}

export interface Invoice {
  id: string;
  orderId: string;
  suborderId: string | null;
  pdfUrl: string;
  generatedAt: Date;
}

export interface NotificationPorts {
  enqueueEmail(data: { to: string; subject: string; body: string }): Promise<void>;
  enqueueSms(data: { to: string; body: string }): Promise<void>;
  generateInvoice(data: { orderId: string; suborderId?: string }): Promise<Invoice>;
  processQueue(): Promise<void>;
}

export const notificationPorts: NotificationPorts = {
  async enqueueEmail() { throw new Error('Not implemented'); },
  async enqueueSms() { throw new Error('Not implemented'); },
  async generateInvoice() { throw new Error('Not implemented'); },
  async processQueue() { throw new Error('Not implemented'); },
};