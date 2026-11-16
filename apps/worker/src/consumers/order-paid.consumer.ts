// @shopscale/worker/consumers/order-paid.consumer - PDF invoice & notification dispatcher (T061).
// Invariants:
// 1. Consumes order.paid domain events from transactional outbox / BullMQ.
// 2. Generates immutable PDF invoice using PDFInvoiceGenerator.
// 3. Uploads PDF stream/buffer to MinIO under deterministic key invoices/{orderId}.pdf.
// 4. Records invoice metadata in invoices table.
// 5. Dispatches idempotent demo email & SMS notifications via notification_deliveries ledger.
// 6. Retries on transient MinIO/DB errors with exponential backoff; idempotent on retry.

import {
  invoiceService,
  notificationService,
  storageService,
  type InvoiceService,
  type NotificationService,
  type OutboxRecord,
  type StoragePort,
} from '@shopscale/backend';
import {
  PDFInvoiceGenerator,
  invoiceGenerator as defaultInvoiceGenerator,
} from '../documents/invoice.generator.js';

export interface OrderPaidConsumerOptions {
  invoiceGenerator?: PDFInvoiceGenerator;
  storage?: StoragePort;
  invoiceService?: InvoiceService;
  notificationService?: NotificationService;
  logger?: {
    info(msg: string, ...args: unknown[]): void;
    warn(msg: string, ...args: unknown[]): void;
    error(msg: string, ...args: unknown[]): void;
  };
}

export interface OrderPaidResult {
  orderId: string;
  invoiceId: string;
  storageKey: string;
  emailDeliveryId: string;
}

export class OrderPaidConsumer {
  private readonly invoiceGenerator: PDFInvoiceGenerator;
  private readonly storage: StoragePort;
  private readonly invoiceService: InvoiceService;
  private readonly notificationService: NotificationService;
  private readonly logger: NonNullable<OrderPaidConsumerOptions['logger']>;

  constructor(options?: OrderPaidConsumerOptions) {
    this.invoiceGenerator = options?.invoiceGenerator ?? defaultInvoiceGenerator;
    this.storage = options?.storage ?? storageService;
    this.invoiceService = options?.invoiceService ?? invoiceService;
    this.notificationService = options?.notificationService ?? notificationService;
    this.logger = options?.logger ?? {
      info: () => {},
      warn: () => {},
      error: () => {},
    };
  }

  async processEvent(event: OutboxRecord): Promise<OrderPaidResult | null> {
    if (event.eventType !== 'order.paid' && event.eventType !== 'OrderPaid') {
      return null;
    }

    const payload = (event.payload ?? {}) as { orderId?: string };
    const orderId = payload.orderId ?? event.aggregateId;

    this.logger.info(`Processing order.paid event for order ${orderId}`);

    // 1. Fetch order invoice data
    const invoiceData = await this.invoiceService.getOrderInvoiceData(orderId);
    if (!invoiceData) {
      this.logger.warn(`Order ${orderId} not found for invoice generation`);
      return null;
    }

    // 2. Generate PDF document buffer
    this.logger.info(`Generating PDF invoice for order ${orderId} (${invoiceData.invoiceNumber})`);
    const pdfBuffer = await this.invoiceGenerator.generate(invoiceData);

    // 3. Upload to MinIO under deterministic object key
    const storageKey = `invoices/${orderId}.pdf`;
    this.logger.info(`Uploading invoice to MinIO at key ${storageKey}`);
    await this.storage.putObject(storageKey, pdfBuffer, 'application/pdf');

    // 4. Record invoice in database
    const invoice = await this.invoiceService.recordGeneratedInvoice({
      orderId,
      userId: invoiceData.userId,
      invoiceNumber: invoiceData.invoiceNumber,
      storageKey,
      totalCents: invoiceData.totalCents,
      currency: invoiceData.currency,
      status: 'GENERATED',
    });

    // 5. Dispatch customer order confirmation email notification
    const emailEffectKey = `notif:email:order_paid:${orderId}`;
    const emailResult = await this.notificationService.recordDelivery({
      effectKey: emailEffectKey,
      userId: invoiceData.userId,
      channel: 'EMAIL',
      template: 'ORDER_CONFIRMATION',
      recipient: invoiceData.customer.email,
      payload: {
        orderId,
        invoiceNumber: invoiceData.invoiceNumber,
        totalCents: invoiceData.totalCents,
        currency: invoiceData.currency,
      },
    });

    this.logger.info(
      `Email notification recorded (alreadyDelivered: ${emailResult.alreadyDelivered}, deliveryId: ${emailResult.delivery.id})`,
    );

    // 6. Dispatch customer SMS notification (if address / contact available)
    if (invoiceData.shippingAddress) {
      const smsEffectKey = `notif:sms:order_paid:${orderId}`;
      await this.notificationService.recordDelivery({
        effectKey: smsEffectKey,
        userId: invoiceData.userId,
        channel: 'SMS',
        template: 'ORDER_CONFIRMATION_SMS',
        recipient: invoiceData.shippingAddress.fullName || invoiceData.customer.email,
        payload: {
          orderId,
          totalCents: invoiceData.totalCents,
        },
      });
    }

    return {
      orderId,
      invoiceId: invoice.id,
      storageKey,
      emailDeliveryId: emailResult.delivery.id,
    };
  }
}

export const orderPaidConsumer = new OrderPaidConsumer();
