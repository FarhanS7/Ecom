// @shopscale/worker/consumers/order-paid.consumer.test - Unit tests for OrderPaidConsumer (T061).
import { describe, it, expect, vi } from 'vitest';
import { OrderPaidConsumer } from './order-paid.consumer.js';
import type { OutboxRecord, StoragePort, InvoiceService, NotificationService, OrderInvoiceData } from '@shopscale/backend';
import type { PDFInvoiceGenerator } from '../documents/invoice.generator.js';

describe('OrderPaidConsumer', () => {
  const mockOrderInvoiceData: OrderInvoiceData = {
    orderId: '00000000-0000-0000-0000-000000000001',
    userId: '11111111-1111-1111-1111-111111111111',
    invoiceNumber: 'INV-2026-00000001',
    createdAt: new Date('2026-11-16T12:00:00Z'),
    customer: {
      id: '11111111-1111-1111-1111-111111111111',
      email: 'buyer@example.com',
      name: 'Bob Buyer',
    },
    shippingAddress: {
      fullName: 'Bob Buyer',
      line1: '456 Market St',
      line2: null,
      city: 'Seattle',
      state: 'WA',
      postalCode: '98101',
      country: 'US',
    },
    items: [
      {
        id: 'item-1',
        title: 'Mechanical Keyboard',
        sku: 'KB-001',
        storeName: 'Keyboards Inc',
        qty: 1,
        unitPriceCents: 12000,
        totalCents: 12000,
      },
    ],
    subtotalCents: 12000,
    discountCents: 0,
    shippingCents: 800,
    taxCents: 0,
    totalCents: 12800,
    currency: 'USD',
  };

  it('generates PDF, uploads to MinIO, records invoice, and dispatches notifications on order.paid', async () => {
    const mockPdfBuffer = Buffer.from('%PDF-1.4 test invoice content');
    const mockGenerator: Partial<PDFInvoiceGenerator> = {
      generate: vi.fn().mockResolvedValue(mockPdfBuffer),
    };

    const uploadedObjects: Array<{ key: string; body: Uint8Array; contentType: string }> = [];
    const mockStorage: Partial<StoragePort> = {
      putObject: vi.fn().mockImplementation(async (key, body, contentType) => {
        uploadedObjects.push({ key, body, contentType });
      }),
    };

    const recordedInvoices: unknown[] = [];
    const mockInvoiceService: Partial<InvoiceService> = {
      getOrderInvoiceData: vi.fn().mockResolvedValue(mockOrderInvoiceData),
      recordGeneratedInvoice: vi.fn().mockImplementation(async (input) => {
        recordedInvoices.push(input);
        return {
          id: 'inv-uuid-1',
          order_id: input.orderId,
          user_id: input.userId,
          invoice_number: input.invoiceNumber,
          storage_key: input.storageKey,
          total_cents: input.totalCents,
          currency: input.currency ?? 'USD',
          status: 'GENERATED',
          created_at: new Date(),
          updated_at: new Date(),
        };
      }),
    };

    const recordedDeliveries: unknown[] = [];
    const mockNotificationService: Partial<NotificationService> = {
      recordDelivery: vi.fn().mockImplementation(async (input) => {
        recordedDeliveries.push(input);
        return {
          delivery: {
            id: `notif-${recordedDeliveries.length}`,
            effect_key: input.effectKey,
            user_id: input.userId ?? null,
            channel: input.channel,
            template: input.template,
            recipient: input.recipient,
            status: 'DELIVERED',
            attempts: 1,
            provider_ref: 'demo_123',
            payload: input.payload ?? null,
            created_at: new Date(),
            updated_at: new Date(),
          },
          alreadyDelivered: false,
        };
      }),
    };

    const consumer = new OrderPaidConsumer({
      invoiceGenerator: mockGenerator as PDFInvoiceGenerator,
      storage: mockStorage as StoragePort,
      invoiceService: mockInvoiceService as InvoiceService,
      notificationService: mockNotificationService as NotificationService,
    });

    const event: OutboxRecord = {
      id: 'event-uuid-1',
      aggregateType: 'order',
      aggregateId: '00000000-0000-0000-0000-000000000001',
      aggregateVersion: 1,
      eventType: 'order.paid',
      schemaVersion: 1,
      payload: {
        orderId: '00000000-0000-0000-0000-000000000001',
        totalCents: 12800,
        currency: 'USD',
      },
      createdAt: new Date(),
    };

    const result = await consumer.processEvent(event);

    expect(result).not.toBeNull();
    expect(result?.orderId).toBe('00000000-0000-0000-0000-000000000001');
    expect(result?.invoiceId).toBe('inv-uuid-1');
    expect(result?.storageKey).toBe('invoices/00000000-0000-0000-0000-000000000001.pdf');

    // Assert PDF generator was called
    expect(mockGenerator.generate).toHaveBeenCalledWith(mockOrderInvoiceData);

    // Assert upload occurred
    expect(uploadedObjects).toHaveLength(1);
    expect(uploadedObjects[0]?.key).toBe('invoices/00000000-0000-0000-0000-000000000001.pdf');
    expect(uploadedObjects[0]?.contentType).toBe('application/pdf');

    // Assert DB record created
    expect(recordedInvoices).toHaveLength(1);

    // Assert notifications dispatched (Email + SMS)
    expect(recordedDeliveries).toHaveLength(2);
    expect(mockNotificationService.recordDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        effectKey: 'notif:email:order_paid:00000000-0000-0000-0000-000000000001',
        channel: 'EMAIL',
        recipient: 'buyer@example.com',
      }),
    );
  });

  it('ignores unrelated event types gracefully', async () => {
    const consumer = new OrderPaidConsumer();
    const event: OutboxRecord = {
      id: 'event-uuid-2',
      aggregateType: 'order',
      aggregateId: 'order-123',
      aggregateVersion: 1,
      eventType: 'order.refund_completed',
      schemaVersion: 1,
      payload: {},
      createdAt: new Date(),
    };

    const result = await consumer.processEvent(event);
    expect(result).toBeNull();
  });
});
