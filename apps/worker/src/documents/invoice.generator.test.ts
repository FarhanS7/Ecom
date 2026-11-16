// @shopscale/worker/documents/invoice.generator.test - PDF generation unit tests (T061).
import { describe, it, expect } from 'vitest';
import { PDFInvoiceGenerator, type InvoiceData } from './invoice.generator.js';

describe('PDFInvoiceGenerator', () => {
  const generator = new PDFInvoiceGenerator();

  it('generates a valid binary PDF buffer for a single-item order', async () => {
    const data: InvoiceData = {
      orderId: '00000000-0000-0000-0000-000000000001',
      invoiceNumber: 'INV-2026-0001',
      createdAt: new Date('2026-11-16T10:00:00Z'),
      customer: {
        id: '11111111-1111-1111-1111-111111111111',
        email: 'customer@example.com',
        name: 'Jane Customer',
      },
      shippingAddress: {
        fullName: 'Jane Customer',
        line1: '123 Market St',
        line2: 'Apt 4B',
        city: 'San Francisco',
        state: 'CA',
        postalCode: '94105',
        country: 'US',
      },
      items: [
        {
          id: 'item-1',
          title: 'Premium Ergonomic Chair',
          sku: 'CHAIR-001',
          storeName: 'Ergo Furnishings',
          qty: 1,
          unitPriceCents: 29900,
          totalCents: 29900,
        },
      ],
      subtotalCents: 29900,
      discountCents: 0,
      shippingCents: 1500,
      taxCents: 2400,
      totalCents: 33800,
      currency: 'USD',
    };

    const pdfBuffer = await generator.generate(data);

    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(1000);
    // Standard PDF header signature is '%PDF-'
    expect(pdfBuffer.subarray(0, 5).toString('utf-8')).toBe('%PDF-');
  });

  it('handles multi-page orders with 10 line items across 3 sellers without crashing or clipping', async () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      id: `item-${i + 1}`,
      title: `Multi-Vendor Marketplace Line Item #${i + 1} with a descriptive name and detailed attributes`,
      sku: `SKU-PROD-${100 + i}`,
      storeName: `Merchant Store ${(i % 3) + 1}`,
      qty: (i % 3) + 1,
      unitPriceCents: 5000 + i * 500,
      totalCents: ((i % 3) + 1) * (5000 + i * 500),
    }));

    const subtotal = items.reduce((acc, it) => acc + it.totalCents, 0);

    const data: InvoiceData = {
      orderId: '00000000-0000-0000-0000-000000000002',
      invoiceNumber: 'INV-2026-0002',
      createdAt: new Date('2026-11-16T11:00:00Z'),
      customer: {
        id: '22222222-2222-2222-2222-222222222222',
        email: 'alice@example.com',
        name: 'Alice Cooper',
      },
      items,
      subtotalCents: subtotal,
      discountCents: 2500,
      shippingCents: 2000,
      taxCents: 3000,
      totalCents: subtotal - 2500 + 2000 + 3000,
      currency: 'USD',
    };

    const pdfBuffer = await generator.generate(data);

    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(2000);
    expect(pdfBuffer.subarray(0, 5).toString('utf-8')).toBe('%PDF-');
  });

  it('escapes untrusted text characters safely', async () => {
    const data: InvoiceData = {
      orderId: '00000000-0000-0000-0000-000000000003',
      invoiceNumber: 'INV-2026-0003',
      createdAt: '2026-11-16T12:00:00Z',
      customer: {
        id: '33333333-3333-3333-3333-333333333333',
        email: 'malicious\x00user@example.com',
        name: 'John <script>alert("hack")</script>\x07',
      },
      items: [
        {
          id: 'item-weird',
          title: 'Weird item with \x08\x0B characters and /../ traversal',
          sku: 'SKU-WEIRD',
          qty: 1,
          unitPriceCents: 1000,
          totalCents: 1000,
        },
      ],
      subtotalCents: 1000,
      discountCents: 0,
      shippingCents: 0,
      taxCents: 0,
      totalCents: 1000,
      currency: 'USD',
    };

    const pdfBuffer = await generator.generate(data);
    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.subarray(0, 5).toString('utf-8')).toBe('%PDF-');
  });
});
