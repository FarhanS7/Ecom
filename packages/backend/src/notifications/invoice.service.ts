// @shopscale/backend/notifications/invoice.service - Invoice metadata & presigned URL retrieval (T061).
// Invariants:
// 1. Scoped to verified order owner or privileged staff; foreign order queries reject with 404 (no oracle).
// 2. Presigned GET URLs expire in 15 minutes (900s).
// 3. Invoices are generated deterministically per order.

import type { Sql } from 'postgres';
import { getDb } from '../db/client.js';
import { storageService, type StoragePort } from '../platform/storage.service.js';
import { InvoiceNotFoundError } from './errors.js';

export interface InvoiceRow {
  id: string;
  order_id: string;
  user_id: string;
  invoice_number: string;
  storage_key: string;
  total_cents: number;
  currency: string;
  status: 'PENDING' | 'GENERATED' | 'FAILED';
  created_at: Date;
  updated_at: Date;
}

export interface InvoiceItemPayload {
  id: string;
  title: string;
  sku: string;
  storeName?: string | undefined;
  qty: number;
  unitPriceCents: number;
  totalCents: number;
}

export interface OrderInvoiceData {
  orderId: string;
  userId: string;
  invoiceNumber: string;
  createdAt: Date;
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
  items: InvoiceItemPayload[];
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  discountCents: number;
  totalCents: number;
  currency: string;
}

export class InvoiceService {
  constructor(
    private readonly db?: Sql,
    private readonly storage: StoragePort = storageService,
  ) {}

  private get sql(): Sql {
    return this.db ?? getDb();
  }

  async getOrderInvoiceData(orderId: string): Promise<OrderInvoiceData | null> {
    const orders = (await this.sql`
      SELECT 
        o.id,
        o.user_id,
        o.payment_status,
        o.subtotal_cents,
        o.shipping_cents,
        o.discount_cents,
        o.total_cents,
        o.currency,
        o.address_snapshot,
        o.created_at,
        u.email_normalized as customer_email
      FROM orders o
      JOIN users u ON u.id = o.user_id
      WHERE o.id = ${orderId}
      LIMIT 1
    `) as unknown as Array<{
      id: string;
      user_id: string;
      payment_status: string;
      subtotal_cents: number;
      shipping_cents: number;
      discount_cents: number;
      total_cents: number;
      currency: string;
      address_snapshot: {
        fullName?: string;
        line1?: string;
        line2?: string | null;
        city?: string;
        state?: string;
        postalCode?: string;
        country?: string;
      } | null;
      created_at: Date;
      customer_email: string;
    }>;

    const order = orders[0];
    if (!order) {
      return null;
    }

    const items = (await this.sql`
      SELECT 
        oi.id,
        oi.title_snapshot as title,
        oi.sku_snapshot as sku,
        oi.qty,
        oi.unit_price_cents,
        oi.total_cents,
        s.name as store_name
      FROM order_items oi
      LEFT JOIN stores s ON s.id = oi.store_id
      WHERE oi.order_id = ${orderId}
      ORDER BY oi.id ASC
    `) as unknown as Array<{
      id: string;
      title: string;
      sku: string;
      qty: number;
      unit_price_cents: number;
      total_cents: number;
      store_name: string | null;
    }>;

    const shortId = order.id.slice(0, 8).toUpperCase();
    const invoiceNumber = `INV-${new Date(order.created_at).getFullYear()}-${shortId}`;

    return {
      orderId: order.id,
      userId: order.user_id,
      invoiceNumber,
      createdAt: order.created_at,
      customer: {
        id: order.user_id,
        email: order.customer_email,
        name: order.address_snapshot?.fullName || undefined,
      },
      shippingAddress: order.address_snapshot
        ? {
            fullName: order.address_snapshot.fullName || '',
            line1: order.address_snapshot.line1 || '',
            line2: order.address_snapshot.line2 || null,
            city: order.address_snapshot.city || '',
            state: order.address_snapshot.state || '',
            postalCode: order.address_snapshot.postalCode || '',
            country: order.address_snapshot.country || '',
          }
        : null,
      items: items.map((it) => ({
        id: it.id,
        title: it.title,
        sku: it.sku,
        storeName: it.store_name ?? undefined,
        qty: it.qty,
        unitPriceCents: it.unit_price_cents,
        totalCents: it.total_cents,
      })),
      subtotalCents: order.subtotal_cents,
      shippingCents: order.shipping_cents,
      taxCents: 0,
      discountCents: order.discount_cents,
      totalCents: order.total_cents,
      currency: order.currency || 'USD',
    };
  }

  async recordGeneratedInvoice(
    data: {
      orderId: string;
      userId: string;
      invoiceNumber: string;
      storageKey: string;
      totalCents: number;
      currency?: string;
      status?: 'PENDING' | 'GENERATED' | 'FAILED';
    },
    sqlTx?: Sql,
  ): Promise<InvoiceRow> {
    const client = sqlTx ?? this.sql;
    const currency = data.currency ?? 'USD';
    const status = data.status ?? 'GENERATED';

    const inserted = (await client`
      INSERT INTO invoices (
        order_id,
        user_id,
        invoice_number,
        storage_key,
        total_cents,
        currency,
        status
      ) VALUES (
        ${data.orderId},
        ${data.userId},
        ${data.invoiceNumber},
        ${data.storageKey},
        ${data.totalCents},
        ${currency},
        ${status}
      )
      ON CONFLICT (order_id) DO UPDATE
      SET storage_key = EXCLUDED.storage_key,
          total_cents = EXCLUDED.total_cents,
          currency = EXCLUDED.currency,
          status = EXCLUDED.status,
          updated_at = now()
      RETURNING id, order_id, user_id, invoice_number, storage_key, total_cents, currency, status, created_at, updated_at
    `) as unknown as InvoiceRow[];

    const row = inserted[0];
    if (!row) {
      throw new Error(`Failed to insert or update invoice for order ${data.orderId}`);
    }
    return row;
  }

  async getInvoiceForOrder(params: {
    userId: string;
    orderId: string;
    isPrivileged?: boolean;
  }): Promise<{ invoice: InvoiceRow; downloadUrl: string }> {
    const invoices = (await this.sql`
      SELECT id, order_id, user_id, invoice_number, storage_key, total_cents, currency, status, created_at, updated_at
      FROM invoices
      WHERE order_id = ${params.orderId}
      LIMIT 1
    `) as unknown as InvoiceRow[];

    const invoice = invoices[0];
    if (!invoice) {
      throw new InvoiceNotFoundError(`Invoice not found for order ${params.orderId}`);
    }

    // Scoped authorization
    if (!params.isPrivileged && invoice.user_id !== params.userId) {
      // Return NotFoundError to avoid user-oracle information leakage
      throw new InvoiceNotFoundError(`Invoice not found for order ${params.orderId}`);
    }

    const downloadUrl = await this.storage.getPresignedGetUrl(invoice.storage_key, 900);

    return {
      invoice,
      downloadUrl,
    };
  }
}

export const invoiceService = new InvoiceService();
