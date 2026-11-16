// @shopscale/worker/documents/invoice.generator - PDF invoice document generator (T061).
// Invariants:
// 1. Escapes and sanitizes untrusted input text; never embeds untrusted remote URLs.
// 2. Supports multi-page tables cleanly without text clipping across seller line items.
// 3. Strictly displays non-negative integer cents formatted as standard currency ($XX.XX).
// 4. Returns deterministic binary PDF buffer.

import PDFDocument from 'pdfkit';

export interface InvoiceItemData {
  id: string;
  title: string;
  sku: string;
  storeName?: string | undefined;
  qty: number;
  unitPriceCents: number;
  totalCents: number;
}

export interface InvoiceData {
  orderId: string;
  invoiceNumber: string;
  createdAt: Date | string;
  customer: {
    id: string;
    email: string;
    name?: string | undefined;
  };
  shippingAddress?: {
    fullName: string;
    line1: string;
    line2?: string | null | undefined;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  } | null | undefined;
  items: InvoiceItemData[];
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  discountCents: number;
  totalCents: number;
  currency: string;
}

function formatCents(cents: number, currency = 'USD'): string {
  const dollars = (cents / 100).toFixed(2);
  return `${currency} $${dollars}`;
}

function sanitizeText(val?: string | null): string {
  if (!val) return '';
  let res = '';
  for (let i = 0; i < val.length; i++) {
    const code = val.charCodeAt(i);
    // Allow newline (10), carriage return (13), and printable characters (>= 32, != 127)
    if (code === 10 || code === 13 || (code >= 32 && code !== 127)) {
      const char = val[i];
      if (char !== undefined) {
        res += char;
      }
    }
  }
  return res.trim();
}

export class PDFInvoiceGenerator {
  /**
   * Generates an invoice PDF as a Node Buffer.
   */
  async generate(data: InvoiceData): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        margin: 50,
        size: 'A4',
        info: {
          Title: `Invoice ${data.invoiceNumber}`,
          Author: 'ShopScale Marketplace',
          Subject: `Order Invoice for Order ${data.orderId}`,
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err: unknown) => {
        reject(err instanceof Error ? err : new Error(String(err)));
      });

      try {
        this.renderDocument(doc, data);
        doc.end();
      } catch (err: unknown) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  private renderDocument(doc: PDFKit.PDFDocument, data: InvoiceData): void {
    const primaryColor = '#1e293b';
    const secondaryColor = '#64748b';
    const borderColor = '#e2e8f0';

    // 1. Header
    doc
      .fillColor(primaryColor)
      .fontSize(22)
      .font('Helvetica-Bold')
      .text('SHOPSCALEMARKETPLACE', 50, 50);

    doc
      .fillColor(secondaryColor)
      .fontSize(9)
      .font('Helvetica')
      .text('Multi-Vendor E-Commerce Platform', 50, 75);

    // Invoice badge / details (Right aligned)
    doc
      .fillColor(primaryColor)
      .fontSize(16)
      .font('Helvetica-Bold')
      .text('INVOICE', 350, 50, { align: 'right' });

    doc
      .fillColor(secondaryColor)
      .fontSize(9)
      .font('Helvetica')
      .text(`Invoice Number: ${sanitizeText(data.invoiceNumber)}`, 300, 72, { align: 'right' })
      .text(`Order ID: ${sanitizeText(data.orderId)}`, 300, 85, { align: 'right' })
      .text(`Date: ${new Date(data.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}`, 300, 98, { align: 'right' });

    doc.moveTo(50, 120).lineTo(545, 120).strokeColor(borderColor).stroke();

    // 2. Customer & Shipping Info
    const infoY = 135;
    doc
      .fillColor(primaryColor)
      .fontSize(10)
      .font('Helvetica-Bold')
      .text('BILL TO:', 50, infoY);

    doc
      .fillColor(secondaryColor)
      .fontSize(9)
      .font('Helvetica')
      .text(sanitizeText(data.customer.name || 'Customer'), 50, infoY + 15)
      .text(sanitizeText(data.customer.email), 50, infoY + 28);

    if (data.shippingAddress) {
      doc
        .fillColor(primaryColor)
        .fontSize(10)
        .font('Helvetica-Bold')
        .text('SHIP TO:', 320, infoY);

      let shipY = infoY + 15;
      doc
        .fillColor(secondaryColor)
        .fontSize(9)
        .font('Helvetica')
        .text(sanitizeText(data.shippingAddress.fullName), 320, shipY);

      shipY += 13;
      doc.text(sanitizeText(data.shippingAddress.line1), 320, shipY);

      if (data.shippingAddress.line2) {
        shipY += 13;
        doc.text(sanitizeText(data.shippingAddress.line2), 320, shipY);
      }

      shipY += 13;
      const cityStateZip = `${sanitizeText(data.shippingAddress.city)}, ${sanitizeText(data.shippingAddress.state)} ${sanitizeText(data.shippingAddress.postalCode)}`;
      doc.text(cityStateZip, 320, shipY);

      shipY += 13;
      doc.text(sanitizeText(data.shippingAddress.country), 320, shipY);
    }

    // 3. Table of Line Items
    let currentY = 225;

    const renderTableHeader = (y: number) => {
      doc.rect(50, y, 495, 20).fill('#f8fafc');
      doc
        .fillColor(primaryColor)
        .fontSize(8)
        .font('Helvetica-Bold')
        .text('ITEM & STORE', 55, y + 6)
        .text('SKU', 260, y + 6)
        .text('QTY', 340, y + 6, { width: 30, align: 'right' })
        .text('UNIT PRICE', 380, y + 6, { width: 70, align: 'right' })
        .text('TOTAL', 465, y + 6, { width: 75, align: 'right' });
      return y + 24;
    };

    currentY = renderTableHeader(currentY);

    for (const item of data.items) {
      // Check if page overflow
      if (currentY > doc.page.height - 120) {
        doc.addPage();
        currentY = 50;
        currentY = renderTableHeader(currentY);
      }

      const itemTitle = sanitizeText(item.title);
      const storeName = sanitizeText(item.storeName ? `Sold by: ${item.storeName}` : '');
      const sku = sanitizeText(item.sku);

      doc
        .fillColor(primaryColor)
        .fontSize(9)
        .font('Helvetica')
        .text(itemTitle, 55, currentY, { width: 195, lineBreak: true });

      const titleHeight = Math.max(14, doc.heightOfString(itemTitle, { width: 195 }));

      if (storeName) {
        doc
          .fillColor(secondaryColor)
          .fontSize(7)
          .font('Helvetica')
          .text(storeName, 55, currentY + titleHeight, { width: 195 });
      }

      const rowHeight = Math.max(26, titleHeight + (storeName ? 12 : 2));

      doc
        .fillColor(secondaryColor)
        .fontSize(8)
        .font('Helvetica')
        .text(sku, 260, currentY, { width: 75 });

      doc
        .fillColor(primaryColor)
        .fontSize(9)
        .font('Helvetica')
        .text(item.qty.toString(), 340, currentY, { width: 30, align: 'right' });

      doc
        .fillColor(primaryColor)
        .fontSize(9)
        .font('Helvetica')
        .text(formatCents(item.unitPriceCents, data.currency), 380, currentY, { width: 70, align: 'right' });

      doc
        .fillColor(primaryColor)
        .fontSize(9)
        .font('Helvetica-Bold')
        .text(formatCents(item.totalCents, data.currency), 465, currentY, { width: 75, align: 'right' });

      currentY += rowHeight;
      doc.moveTo(50, currentY).lineTo(545, currentY).strokeColor(borderColor).stroke();
      currentY += 6;
    }

    // 4. Financial Summary
    if (currentY > doc.page.height - 140) {
      doc.addPage();
      currentY = 50;
    }

    currentY += 10;
    const summaryX = 350;
    const summaryValX = 465;

    doc
      .fillColor(secondaryColor)
      .fontSize(9)
      .font('Helvetica')
      .text('Subtotal:', summaryX, currentY, { width: 110, align: 'right' })
      .text(formatCents(data.subtotalCents, data.currency), summaryValX, currentY, { width: 75, align: 'right' });

    if (data.discountCents > 0) {
      currentY += 15;
      doc
        .text('Discounts:', summaryX, currentY, { width: 110, align: 'right' })
        .text(`-${formatCents(data.discountCents, data.currency)}`, summaryValX, currentY, { width: 75, align: 'right' });
    }

    if (data.shippingCents > 0) {
      currentY += 15;
      doc
        .text('Shipping & Handling:', summaryX, currentY, { width: 110, align: 'right' })
        .text(formatCents(data.shippingCents, data.currency), summaryValX, currentY, { width: 75, align: 'right' });
    }

    if (data.taxCents > 0) {
      currentY += 15;
      doc
        .text('Tax:', summaryX, currentY, { width: 110, align: 'right' })
        .text(formatCents(data.taxCents, data.currency), summaryValX, currentY, { width: 75, align: 'right' });
    }

    currentY += 20;
    doc.moveTo(summaryX, currentY).lineTo(545, currentY).strokeColor(borderColor).stroke();
    currentY += 8;

    doc
      .fillColor(primaryColor)
      .fontSize(12)
      .font('Helvetica-Bold')
      .text('Total Paid:', summaryX, currentY, { width: 110, align: 'right' })
      .text(formatCents(data.totalCents, data.currency), summaryValX, currentY, { width: 75, align: 'right' });

    // 5. Footer
    currentY += 40;
    doc
      .fillColor(secondaryColor)
      .fontSize(8)
      .font('Helvetica')
      .text(
        'Thank you for your purchase. For inquiries or customer support, please visit your account order portal.',
        50,
        currentY,
        { align: 'center', width: 495 },
      );
  }
}

export const invoiceGenerator = new PDFInvoiceGenerator();
