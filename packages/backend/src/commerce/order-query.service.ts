// @shopscale/backend/commerce/order-query.service - Scoped order queries and history (T055).
// Invariants:
// 1. Customer queries are strictly filtered by user_id. Foreign orders return generic 404 (no oracle).
// 2. Seller queries are strictly filtered by store_id. Foreign suborders return generic 404.
// 3. Customer shipping address PII is masked for unpaid orders (payment_status !== 'PAID').
// 4. Stable keyset cursor pagination on (created_at DESC, id DESC).

import type { Sql } from 'postgres';
import { getDb } from '../db/client.js';
import { maskAddressSnapshot } from './pii-masker.js';
import type { AddressSnapshot } from './schema.js';
import type {
  CustomerOrderDetailDto,
  CustomerOrderDto,
  PaginatedOrdersResponseDto,
  PaginatedSellerSubordersResponseDto,
  SellerSuborderDto,
} from '@shopscale/contracts';

export interface OrderCursorPayload {
  createdAt: string;
  id: string;
}

export function encodeOrderCursor(payload: OrderCursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeOrderCursor(cursor?: string | null): OrderCursorPayload | null {
  if (!cursor || typeof cursor !== 'string') return null;
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw) as Partial<OrderCursorPayload>;
    if (typeof parsed.createdAt === 'string' && typeof parsed.id === 'string') {
      return { createdAt: parsed.createdAt, id: parsed.id };
    }
    return null;
  } catch {
    return null;
  }
}

import { OrderNotFoundError, SuborderNotFoundError } from './errors.js';
export { OrderNotFoundError, SuborderNotFoundError };

interface OrderRow {
  id: string;
  user_id: string;
  channel_key: string;
  store_id: string | null;
  payment_status: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
  fulfillment_status: 'PENDING' | 'PACKED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
  subtotal_cents: number;
  shipping_cents: number;
  discount_cents: number;
  total_cents: number;
  currency: 'USD';
  coupon_code: string | null;
  address_snapshot: AddressSnapshot;
  created_at: Date;
  items_count?: number;
}

interface SellerOrderRow {
  id: string;
  order_id: string;
  store_id: string;
  fulfillment_status: 'PENDING' | 'PACKED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
  subtotal_cents: number;
  shipping_cents: number;
  discount_cents: number;
  total_cents: number;
  commission_bps_snapshot: number;
  created_at: Date;
  payment_status?: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
  address_snapshot?: AddressSnapshot;
}

interface OrderItemRow {
  id: string;
  order_id: string;
  seller_order_id: string;
  store_id: string;
  variant_id: string;
  title_snapshot: string;
  sku_snapshot: string;
  qty: number;
  unit_price_cents: number;
  total_cents: number;
  discount_cents: number;
}

export class OrderQueryService {
  constructor(private readonly explicitSql?: Sql) {}

  private getSql(): Sql {
    return this.explicitSql ?? getDb();
  }

  async listCustomerOrders(
    userId: string,
    options?: { cursor?: string | undefined; limit?: number | undefined },
  ): Promise<PaginatedOrdersResponseDto> {
    const sql = this.getSql();
    const limit = Math.min(Math.max(1, options?.limit ?? 20), 100);
    const cursor = decodeOrderCursor(options?.cursor);

    let rows: OrderRow[];
    if (cursor) {
      rows = (await sql`
        SELECT
          o.id,
          o.user_id,
          o.channel_key,
          o.store_id,
          o.payment_status,
          o.fulfillment_status,
          o.subtotal_cents,
          o.shipping_cents,
          o.discount_cents,
          o.total_cents,
          o.currency,
          o.coupon_code,
          o.created_at,
          COUNT(oi.id)::int as items_count
        FROM orders o
        LEFT JOIN order_items oi ON oi.order_id = o.id
        WHERE o.user_id = ${userId}
          AND (o.created_at < ${cursor.createdAt}::timestamptz OR (o.created_at = ${cursor.createdAt}::timestamptz AND o.id < ${cursor.id}))
        GROUP BY o.id
        ORDER BY o.created_at DESC, o.id DESC
        LIMIT ${limit + 1}
      `) as unknown as OrderRow[];
    } else {
      rows = (await sql`
        SELECT
          o.id,
          o.user_id,
          o.channel_key,
          o.store_id,
          o.payment_status,
          o.fulfillment_status,
          o.subtotal_cents,
          o.shipping_cents,
          o.discount_cents,
          o.total_cents,
          o.currency,
          o.coupon_code,
          o.created_at,
          COUNT(oi.id)::int as items_count
        FROM orders o
        LEFT JOIN order_items oi ON oi.order_id = o.id
        WHERE o.user_id = ${userId}
        GROUP BY o.id
        ORDER BY o.created_at DESC, o.id DESC
        LIMIT ${limit + 1}
      `) as unknown as OrderRow[];
    }

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    const nextCursor =
      hasMore && items.length > 0
        ? encodeOrderCursor({
            createdAt: items[items.length - 1]!.created_at.toISOString(),
            id: items[items.length - 1]!.id,
          })
        : null;

    return {
      items: items.map((r): CustomerOrderDto => ({
        id: r.id,
        channelKey: r.channel_key,
        storeId: r.store_id,
        paymentStatus: r.payment_status,
        fulfillmentStatus: r.fulfillment_status,
        subtotalCents: r.subtotal_cents,
        shippingCents: r.shipping_cents,
        discountCents: r.discount_cents,
        totalCents: r.total_cents,
        currency: 'USD',
        couponCode: r.coupon_code,
        createdAt: r.created_at.toISOString(),
        itemsCount: r.items_count,
      })),
      nextCursor,
    };
  }

  async getCustomerOrder(userId: string, orderId: string): Promise<CustomerOrderDetailDto> {
    const sql = this.getSql();

    const orderRows = (await sql`
      SELECT
        o.id,
        o.user_id,
        o.channel_key,
        o.store_id,
        o.payment_status,
        o.fulfillment_status,
        o.subtotal_cents,
        o.shipping_cents,
        o.discount_cents,
        o.total_cents,
        o.currency,
        o.coupon_code,
        o.address_snapshot,
        o.created_at
      FROM orders o
      WHERE o.id = ${orderId} AND o.user_id = ${userId}
    `) as unknown as OrderRow[];

    if (orderRows.length === 0) {
      throw new OrderNotFoundError();
    }

    const order = orderRows[0]!;

    const sellerOrders = (await sql`
      SELECT
        id,
        order_id,
        store_id,
        fulfillment_status,
        subtotal_cents,
        shipping_cents,
        discount_cents,
        total_cents,
        commission_bps_snapshot,
        created_at
      FROM seller_orders
      WHERE order_id = ${orderId}
      ORDER BY created_at ASC
    `) as unknown as SellerOrderRow[];

    const orderItems = (await sql`
      SELECT
        id,
        order_id,
        seller_order_id,
        store_id,
        variant_id,
        title_snapshot,
        sku_snapshot,
        qty,
        unit_price_cents,
        total_cents,
        discount_cents
      FROM order_items
      WHERE order_id = ${orderId}
      ORDER BY id ASC
    `) as unknown as OrderItemRow[];

    const suborders: SellerSuborderDto[] = sellerOrders.map((so) => ({
      id: so.id,
      orderId: so.order_id,
      storeId: so.store_id,
      fulfillmentStatus: so.fulfillment_status,
      subtotalCents: so.subtotal_cents,
      shippingCents: so.shipping_cents,
      discountCents: so.discount_cents,
      totalCents: so.total_cents,
      commissionBpsSnapshot: so.commission_bps_snapshot,
      createdAt: so.created_at.toISOString(),
    }));

    return {
      id: order.id,
      channelKey: order.channel_key,
      storeId: order.store_id,
      paymentStatus: order.payment_status,
      fulfillmentStatus: order.fulfillment_status,
      subtotalCents: order.subtotal_cents,
      shippingCents: order.shipping_cents,
      discountCents: order.discount_cents,
      totalCents: order.total_cents,
      currency: 'USD',
      couponCode: order.coupon_code,
      createdAt: order.created_at.toISOString(),
      address: order.address_snapshot,
      suborders,
      items: orderItems.map((it) => ({
        id: it.id,
        orderId: it.order_id,
        sellerOrderId: it.seller_order_id,
        storeId: it.store_id,
        variantId: it.variant_id,
        title: it.title_snapshot,
        sku: it.sku_snapshot,
        qty: it.qty,
        unitPriceCents: it.unit_price_cents,
        totalCents: it.total_cents,
        discountCents: it.discount_cents,
      })),
    };
  }

  async listSellerOrders(
    storeId: string,
    options?: { cursor?: string | undefined; limit?: number | undefined },
  ): Promise<PaginatedSellerSubordersResponseDto> {
    const sql = this.getSql();
    const limit = Math.min(Math.max(1, options?.limit ?? 20), 100);
    const cursor = decodeOrderCursor(options?.cursor);

    let rows: SellerOrderRow[];
    if (cursor) {
      rows = (await sql`
        SELECT
          so.id,
          so.order_id,
          so.store_id,
          so.fulfillment_status,
          so.subtotal_cents,
          so.shipping_cents,
          so.discount_cents,
          so.total_cents,
          so.commission_bps_snapshot,
          so.created_at,
          o.payment_status,
          o.address_snapshot
        FROM seller_orders so
        JOIN orders o ON o.id = so.order_id
        WHERE so.store_id = ${storeId}
          AND (so.created_at < ${cursor.createdAt}::timestamptz OR (so.created_at = ${cursor.createdAt}::timestamptz AND so.id < ${cursor.id}))
        ORDER BY so.created_at DESC, so.id DESC
        LIMIT ${limit + 1}
      `) as unknown as SellerOrderRow[];
    } else {
      rows = (await sql`
        SELECT
          so.id,
          so.order_id,
          so.store_id,
          so.fulfillment_status,
          so.subtotal_cents,
          so.shipping_cents,
          so.discount_cents,
          so.total_cents,
          so.commission_bps_snapshot,
          so.created_at,
          o.payment_status,
          o.address_snapshot
        FROM seller_orders so
        JOIN orders o ON o.id = so.order_id
        WHERE so.store_id = ${storeId}
        ORDER BY so.created_at DESC, so.id DESC
        LIMIT ${limit + 1}
      `) as unknown as SellerOrderRow[];
    }

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    const nextCursor =
      hasMore && items.length > 0
        ? encodeOrderCursor({
            createdAt: items[items.length - 1]!.created_at.toISOString(),
            id: items[items.length - 1]!.id,
          })
        : null;

    return {
      items: items.map((so): SellerSuborderDto => {
        const isPaid = so.payment_status === 'PAID';
        const maskedAddress = so.address_snapshot
          ? maskAddressSnapshot(so.address_snapshot, isPaid)
          : undefined;

        return {
          id: so.id,
          orderId: so.order_id,
          storeId: so.store_id,
          fulfillmentStatus: so.fulfillment_status,
          subtotalCents: so.subtotal_cents,
          shippingCents: so.shipping_cents,
          discountCents: so.discount_cents,
          totalCents: so.total_cents,
          commissionBpsSnapshot: so.commission_bps_snapshot,
          createdAt: so.created_at.toISOString(),
          shippingAddress: maskedAddress,
        };
      }),
      nextCursor,
    };
  }

  async getSellerOrder(storeId: string, suborderId: string): Promise<SellerSuborderDto> {
    const sql = this.getSql();

    const rows = (await sql`
      SELECT
        so.id,
        so.order_id,
        so.store_id,
        so.fulfillment_status,
        so.subtotal_cents,
        so.shipping_cents,
        so.discount_cents,
        so.total_cents,
        so.commission_bps_snapshot,
        so.created_at,
        o.payment_status,
        o.address_snapshot
      FROM seller_orders so
      JOIN orders o ON o.id = so.order_id
      WHERE so.id = ${suborderId} AND so.store_id = ${storeId}
    `) as unknown as SellerOrderRow[];

    if (rows.length === 0) {
      throw new SuborderNotFoundError();
    }

    const so = rows[0]!;

    const orderItems = (await sql`
      SELECT
        id,
        order_id,
        seller_order_id,
        store_id,
        variant_id,
        title_snapshot,
        sku_snapshot,
        qty,
        unit_price_cents,
        total_cents,
        discount_cents
      FROM order_items
      WHERE seller_order_id = ${suborderId} AND store_id = ${storeId}
      ORDER BY id ASC
    `) as unknown as OrderItemRow[];

    const isPaid = so.payment_status === 'PAID';
    const maskedAddress = so.address_snapshot
      ? maskAddressSnapshot(so.address_snapshot, isPaid)
      : undefined;

    return {
      id: so.id,
      orderId: so.order_id,
      storeId: so.store_id,
      fulfillmentStatus: so.fulfillment_status,
      subtotalCents: so.subtotal_cents,
      shippingCents: so.shipping_cents,
      discountCents: so.discount_cents,
      totalCents: so.total_cents,
      commissionBpsSnapshot: so.commission_bps_snapshot,
      createdAt: so.created_at.toISOString(),
      shippingAddress: maskedAddress,
      items: orderItems.map((it) => ({
        id: it.id,
        orderId: it.order_id,
        sellerOrderId: it.seller_order_id,
        storeId: it.store_id,
        variantId: it.variant_id,
        title: it.title_snapshot,
        sku: it.sku_snapshot,
        qty: it.qty,
        unitPriceCents: it.unit_price_cents,
        totalCents: it.total_cents,
        discountCents: it.discount_cents,
      })),
    };
  }
}

export const orderQueryService = new OrderQueryService();
