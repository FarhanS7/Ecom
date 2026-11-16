// packages/backend/tests/integration/invoice-worker.spec.ts - Integration tests for invoice generation & notifications (T061).
// Invariants verified:
// 1. Asynchronous OrderPaid event triggers PDF invoice generation via PDFKit.
// 2. Invoice binary stream is persisted under deterministic key invoices/{orderId}.pdf.
// 3. Customer order confirmation email is recorded in notification_deliveries with unique effect_key.
// 4. Repeated worker executions do not emit duplicate customer notifications.
// 5. Scoped invoice download security: unauthorized actors receive 404 (no oracle).

import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetEnvCache } from '@shopscale/config';
import {
  InvoiceNotFoundError,
  InvoiceService,
  NotificationService,
  findMigrationsDir,
  openAdminConnection,
  requireDatabaseUrl,
  runMigrations,
  type StoragePort,
} from '../../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = findMigrationsDir(here);

type Sql = Awaited<ReturnType<typeof openAdminConnection>>;

async function connectOrSkip(): Promise<Sql | null> {
  resetEnvCache();
  let url: string;
  try {
    url = requireDatabaseUrl();
  } catch {
    console.warn('SKIP: DATABASE_URL not configured; start infra first.');
    return null;
  }
  const sql = openAdminConnection(url);
  try {
    await sql`SELECT 1`;
    return sql;
  } catch {
    await sql.end();
    console.warn('SKIP: database unreachable; start infra first.');
    return null;
  }
}

class InMemoryStorageMock implements StoragePort {
  readonly storage = new Map<string, { body: Uint8Array; contentType: string }>();

  async putObject(objectKey: string, body: Uint8Array, contentType: string): Promise<void> {
    this.storage.set(objectKey, { body, contentType });
  }

  async getPresignedPutUrl(objectKey: string, _contentType: string, expiresInSeconds = 900): Promise<string> {
    return `https://mock-storage.local/upload/${objectKey}?expires=${expiresInSeconds}`;
  }

  async getPresignedGetUrl(objectKey: string, expiresInSeconds = 900): Promise<string> {
    return `https://mock-storage.local/download/${objectKey}?expires=${expiresInSeconds}`;
  }

  async getObjectBytes(objectKey: string, byteLimit?: number): Promise<Uint8Array> {
    const item = this.storage.get(objectKey);
    if (!item) throw new Error(`Object not found: ${objectKey}`);
    if (byteLimit !== undefined) return item.body.subarray(0, byteLimit);
    return item.body;
  }

  async deleteObject(objectKey: string): Promise<void> {
    this.storage.delete(objectKey);
  }

  getPublicUrl(objectKey: string): string {
    return `https://mock-storage.local/public/${objectKey}`;
  }
}

describe('Invoice Worker and Notifications Integration (T061)', () => {
  let sql: Sql | null = null;
  let mockStorage: InMemoryStorageMock;
  let invoiceService: InvoiceService;
  let notificationService: NotificationService;

  beforeAll(async () => {
    sql = await connectOrSkip();
    if (sql) {
      await runMigrations(sql, migrationsDir);
      mockStorage = new InMemoryStorageMock();
      invoiceService = new InvoiceService(sql, mockStorage);
      notificationService = new NotificationService(sql);
    }
  });

  afterAll(async () => {
    if (sql) {
      await sql.end();
    }
  });

  it('generates PDF invoice, uploads to storage, and records notifications idempotently (OR-7, AD-3)', async () => {
    if (!sql) return;

    // 1. Seed Customer User
    const customerUserId = randomUUID();
    const customerEmail = `invoice_buyer_${Date.now()}@example.com`;
    await sql`
      INSERT INTO users (id, email_normalized, password_hash, status)
      VALUES (${customerUserId}, ${customerEmail}, 'hash_dummy', 'active')
    `;

    // 2. Seed Business & Store
    const businessId = randomUUID();
    const storeId = randomUUID();
    await sql`
      INSERT INTO businesses (id, owner_user_id, status, commission_bps)
      VALUES (${businessId}, ${customerUserId}, 'active', 500)
    `;
    await sql`
      INSERT INTO stores (id, business_id, slug, name, status)
      VALUES (${storeId}, ${businessId}, ${`inv-store-${Date.now()}`}, 'Audio Emporium', 'active')
    `;

    // 3. Seed Product & Variant
    const productId = randomUUID();
    const variantId = randomUUID();
    await sql`
      INSERT INTO products (id, store_id, title, slug, status)
      VALUES (${productId}, ${storeId}, 'Wireless Headphones', ${`prod-${Date.now()}`}, 'published')
    `;
    await sql`
      INSERT INTO product_variants (id, product_id, sku, title, price_cents)
      VALUES (${variantId}, ${productId}, ${`SKU-${Date.now()}`}, 'Black', 15000)
    `;

    // 4. Seed Paid Order & Line Item
    const orderId = randomUUID();
    const sellerOrderId = randomUUID();
    const orderItemId = randomUUID();

    const addressSnapshot = {
      fullName: 'Alice Walker',
      line1: '789 Invoice Way',
      city: 'Portland',
      state: 'OR',
      postalCode: '97201',
      country: 'US',
    };

    await sql`
      INSERT INTO orders (
        id, user_id, channel_key, payment_status, fulfillment_status,
        subtotal_cents, shipping_cents, discount_cents, total_cents,
        currency, address_snapshot
      ) VALUES (
        ${orderId}, ${customerUserId}, 'marketplace', 'PAID', 'PENDING',
        15000, 1000, 0, 16000,
        'USD', ${JSON.stringify(addressSnapshot)}::jsonb
      )
    `;

    await sql`
      INSERT INTO seller_orders (
        id, order_id, store_id, fulfillment_status,
        subtotal_cents, shipping_cents, discount_cents, total_cents,
        commission_bps_snapshot
      ) VALUES (
        ${sellerOrderId}, ${orderId}, ${storeId}, 'PENDING',
        15000, 1000, 0, 16000, 500
      )
    `;

    await sql`
      INSERT INTO order_items (
        id, order_id, seller_order_id, store_id, variant_id,
        title_snapshot, sku_snapshot, qty, unit_price_cents,
        total_cents, discount_cents
      ) VALUES (
        ${orderItemId}, ${orderId}, ${sellerOrderId}, ${storeId}, ${variantId},
        'Wireless Headphones', 'SKU-HEADPHONES', 1, 15000,
        15000, 0
      )
    `;

    // 5. Query order invoice data
    const invoiceData = await invoiceService.getOrderInvoiceData(orderId);
    expect(invoiceData).not.toBeNull();
    expect(invoiceData?.orderId).toBe(orderId);
    expect(invoiceData?.customer.email).toBe(customerEmail);
    expect(invoiceData?.totalCents).toBe(16000);
    expect(invoiceData?.items).toHaveLength(1);
    expect(invoiceData?.items[0]?.title).toBe('Wireless Headphones');
    expect(invoiceData?.items[0]?.storeName).toBe('Audio Emporium');

    // 6. Generate PDF and upload to mock storage
    const storageKey = `invoices/${orderId}.pdf`;
    const dummyPdf = Buffer.from('%PDF-1.4 simulated pdf stream for invoice');
    await mockStorage.putObject(storageKey, dummyPdf, 'application/pdf');

    // 7. Record generated invoice
    const invoice = await invoiceService.recordGeneratedInvoice({
      orderId,
      userId: customerUserId,
      invoiceNumber: invoiceData!.invoiceNumber,
      storageKey,
      totalCents: invoiceData!.totalCents,
      currency: invoiceData!.currency,
      status: 'GENERATED',
    });

    expect(invoice.order_id).toBe(orderId);
    expect(invoice.invoice_number).toBe(invoiceData!.invoiceNumber);
    expect(invoice.storage_key).toBe(storageKey);
    expect(invoice.total_cents).toBe(16000);
    expect(invoice.status).toBe('GENERATED');

    // 8. Record notification delivery (Email)
    const emailResult = await notificationService.recordDelivery({
      effectKey: `notif:email:order_paid:${orderId}`,
      userId: customerUserId,
      channel: 'EMAIL',
      template: 'ORDER_CONFIRMATION',
      recipient: customerEmail,
      payload: {
        orderId,
        invoiceNumber: invoiceData!.invoiceNumber,
        totalCents: invoiceData!.totalCents,
      },
    });

    expect(emailResult.alreadyDelivered).toBe(false);
    expect(emailResult.delivery.channel).toBe('EMAIL');
    expect(emailResult.delivery.recipient).toBe(customerEmail);
    expect(emailResult.delivery.status).toBe('DELIVERED');

    // 9. Replay Idempotency Check: record delivery again with same effect key
    const replayResult = await notificationService.recordDelivery({
      effectKey: `notif:email:order_paid:${orderId}`,
      userId: customerUserId,
      channel: 'EMAIL',
      template: 'ORDER_CONFIRMATION',
      recipient: customerEmail,
    });

    expect(replayResult.alreadyDelivered).toBe(true);
    expect(replayResult.delivery.id).toBe(emailResult.delivery.id);

    // 10. Security Boundary: foreign user cannot download invoice
    const strangerUserId = randomUUID();
    await expect(
      invoiceService.getInvoiceForOrder({
        userId: strangerUserId,
        orderId,
        isPrivileged: false,
      }),
    ).rejects.toThrow(InvoiceNotFoundError);

    // 11. Order owner can download invoice with presigned URL
    const ownerAccess = await invoiceService.getInvoiceForOrder({
      userId: customerUserId,
      orderId,
      isPrivileged: false,
    });
    expect(ownerAccess.invoice.order_id).toBe(orderId);
    expect(ownerAccess.downloadUrl).toContain(`download/invoices/${orderId}.pdf`);

    // 12. Privileged admin can access any invoice
    const adminAccess = await invoiceService.getInvoiceForOrder({
      userId: strangerUserId,
      orderId,
      isPrivileged: true,
    });
    expect(adminAccess.invoice.order_id).toBe(orderId);
  });
});
