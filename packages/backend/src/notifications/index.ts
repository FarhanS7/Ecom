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
  enqueueEmail() { return Promise.reject(new Error('Not implemented')); },
  enqueueSms() { return Promise.reject(new Error('Not implemented')); },
  generateInvoice() { return Promise.reject(new Error('Not implemented')); },
  processQueue() { return Promise.reject(new Error('Not implemented')); },
};