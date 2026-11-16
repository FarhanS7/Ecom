// @shopscale/backend/commerce/returns.service - Order cancellation and return request management (T058).
// Invariants:
// 1. Only unshipped orders/suborders can be cancelled. Shipped/delivered items reject cancellation with AlreadyShippedError.
// 2. Cancellation of a paid order automatically initiates refund and restocks inventory.
// 3. Return requests are permitted only on DELIVERED orders.
// 4. Cumulative returned quantity cannot exceed purchased quantity minus already-returned quantity.
// 5. Customer ownership is enforced: foreign orders return OrderNotFoundError (no oracle).
// 6. Domain events emitted to transactional outbox: order.cancelled, order.refund_requested, return.requested.

import type { Sql } from 'postgres';
import type {
  CancelOrderResponseDto,
  InspectReturnRequestDto,
  ReturnRequestDto,
  SellerReturnRequestDto,
} from '@shopscale/contracts';
import { getDb } from '../db/client.js';
import { inventoryService } from '../inventory/inventory.service.js';
import { writeOutboxEvent } from '../platform/outbox.service.js';
import {
  AlreadyShippedError,
  OrderAlreadyCancelledError,
  OrderItemNotFoundError,
  OrderNotDeliveredError,
  OrderNotFoundError,
  OrderNotPaidError,
  ReturnAlreadyInspectedError,
  ReturnQuantityExceededError,
  ReturnRequestNotFoundError,
} from './errors.js';

interface OrderDbRow {
  id: string;
  user_id: string;
  payment_status: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
  fulfillment_status:
    | 'PENDING'
    | 'PACKED'
    | 'PARTIALLY_SHIPPED'
    | 'SHIPPED'
    | 'PARTIALLY_DELIVERED'
    | 'DELIVERED'
    | 'CANCELLED';
  total_cents: number;
}

interface OrderItemDbRow {
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
}

interface SellerOrderDbRow {
  id: string;
  store_id: string;
  fulfillment_status: string;
}

interface ReturnRequestDbRow {
  id: string;
  order_id: string;
  seller_order_id: string;
  store_id: string;
  order_item_id: string;
  user_id: string;
  qty: number;
  reason: string;
  customer_notes: string | null;
  status: 'PENDING_INSPECTION' | 'APPROVED' | 'REJECTED';
  inspection_notes: string | null;
  created_at: Date;
}

export class ReturnsService {
  constructor(private readonly explicitSql?: Sql) {}

  private getSql(): Sql {
    return this.explicitSql ?? getDb();
  }

  /**
   * Cancels an unshipped order. If paid, triggers refund compensation and restocks inventory.
   */
  async cancelOrder(
    userId: string,
    orderId: string,
    reason?: string,
  ): Promise<CancelOrderResponseDto> {
    const sql = this.getSql();

    return await sql.begin(async (tx) => {
      // 1. Lock and load parent order
      const orderRows = (await tx`
        SELECT id, user_id, payment_status, fulfillment_status, total_cents
        FROM orders
        WHERE id = ${orderId}
        FOR UPDATE
      `) as unknown as OrderDbRow[];

      if (orderRows.length === 0 || orderRows[0]!.user_id !== userId) {
        throw new OrderNotFoundError(`Order '${orderId}' not found.`);
      }

      const order = orderRows[0]!;

      // 2. Validate current state
      if (order.fulfillment_status === 'CANCELLED') {
        throw new OrderAlreadyCancelledError(`Order '${orderId}' is already cancelled.`);
      }

      const isShippedOrDelivered =
        order.fulfillment_status === 'SHIPPED' ||
        order.fulfillment_status === 'PARTIALLY_SHIPPED' ||
        order.fulfillment_status === 'PARTIALLY_DELIVERED' ||
        order.fulfillment_status === 'DELIVERED';

      if (isShippedOrDelivered) {
        throw new AlreadyShippedError(
          `Cannot cancel order in '${order.fulfillment_status}' fulfillment status.`,
        );
      }

      // 3. Inspect child suborders: ensure none have been shipped
      const suborders = (await tx`
        SELECT id, store_id, fulfillment_status
        FROM seller_orders
        WHERE order_id = ${orderId}
        FOR UPDATE
      `) as unknown as SellerOrderDbRow[];

      const hasShippedSuborder = suborders.some(
        (so) => so.fulfillment_status === 'SHIPPED' || so.fulfillment_status === 'DELIVERED',
      );

      if (hasShippedSuborder) {
        throw new AlreadyShippedError('Cannot cancel order because one or more packages have already shipped.');
      }

      const isPaid = order.payment_status === 'PAID';
      const newPaymentStatus = isPaid ? 'REFUNDED' : order.payment_status;

      // 4. Update parent order and seller suborders
      await tx`
        UPDATE orders
        SET
          fulfillment_status = 'CANCELLED',
          payment_status = ${newPaymentStatus},
          updated_at = NOW()
        WHERE id = ${orderId}
      `;

      await tx`
        UPDATE seller_orders
        SET
          fulfillment_status = 'CANCELLED',
          updated_at = NOW()
        WHERE order_id = ${orderId}
      `;

      // 5. Inventory reconciliation
      if (isPaid) {
        // Items were consumed into order: restock to inventory.on_hand
        const items = (await tx`
          SELECT id, order_id, seller_order_id, store_id, variant_id, qty
          FROM order_items
          WHERE order_id = ${orderId}
        `) as unknown as Array<{
          id: string;
          order_id: string;
          seller_order_id: string;
          store_id: string;
          variant_id: string;
          qty: number;
        }>;

        for (const item of items) {
          await inventoryService.adjustStock(tx, {
            storeId: item.store_id,
            variantId: item.variant_id,
            deltaOnHand: item.qty,
            reason: 'return_restock',
            operationKey: `cancel:${orderId}:${item.id}`,
            refId: orderId,
          });
        }

        // Emit refund request outbox event
        await writeOutboxEvent(tx, {
          aggregateType: 'order',
          aggregateId: orderId,
          type: 'order.refund_requested',
          payload: {
            orderId,
            userId,
            amountCents: order.total_cents,
            reason: reason ?? 'CUSTOMER_CANCELLED',
          },
          correlationId: orderId,
          causationId: orderId,
        });
      } else {
        // Order was pending: release active inventory reservations
        await inventoryService.releaseReservation(tx, orderId, 'CUSTOMER_CANCELLED');
      }

      // 6. Emit order.cancelled domain event
      await writeOutboxEvent(tx, {
        aggregateType: 'order',
        aggregateId: orderId,
        type: 'order.cancelled',
        payload: {
          orderId,
          userId,
          reason: reason ?? 'CUSTOMER_CANCELLED',
        },
        correlationId: orderId,
        causationId: orderId,
      });

      return {
        success: true,
        orderId,
        fulfillmentStatus: 'CANCELLED',
        paymentStatus: newPaymentStatus,
        refundInitiated: isPaid,
      };
    });
  }

  /**
   * Submits a customer return request for a delivered order item.
   */
  async createReturnRequest(
    userId: string,
    input: {
      orderId: string;
      orderItemId: string;
      qty: number;
      reason: string;
      customerNotes?: string | undefined;
    },
  ): Promise<ReturnRequestDto> {
    const sql = this.getSql();
    const { orderId, orderItemId, qty, reason, customerNotes } = input;

    return await sql.begin(async (tx) => {
      // 1. Lock and load parent order
      const orderRows = (await tx`
        SELECT id, user_id, payment_status, fulfillment_status
        FROM orders
        WHERE id = ${orderId}
        FOR UPDATE
      `) as unknown as OrderDbRow[];

      if (orderRows.length === 0 || orderRows[0]!.user_id !== userId) {
        throw new OrderNotFoundError(`Order '${orderId}' not found.`);
      }

      const order = orderRows[0]!;

      // 2. Validate order is paid and delivered
      if (order.payment_status !== 'PAID') {
        throw new OrderNotPaidError(order.payment_status);
      }

      // Must be delivered
      if (order.fulfillment_status !== 'DELIVERED') {
        throw new OrderNotDeliveredError(
          `Cannot return items for order with fulfillment status '${order.fulfillment_status}'. Order must be DELIVERED.`,
        );
      }

      // 3. Find order item
      const itemRows = (await tx`
        SELECT id, order_id, seller_order_id, store_id, variant_id, qty
        FROM order_items
        WHERE id = ${orderItemId} AND order_id = ${orderId}
        FOR UPDATE
      `) as unknown as OrderItemDbRow[];

      if (itemRows.length === 0) {
        throw new OrderItemNotFoundError(orderItemId);
      }

      const item = itemRows[0]!;

      // 4. Enforce cumulative return quantity: sum of active/approved returns + new return <= purchased qty
      const returnSumRows = (await tx`
        SELECT COALESCE(SUM(qty), 0)::int as total_returned
        FROM return_requests
        WHERE order_item_id = ${orderItemId}
          AND status IN ('PENDING_INSPECTION', 'APPROVED')
      `) as unknown as Array<{ total_returned: number }>;

      const alreadyReturned = returnSumRows[0]?.total_returned ?? 0;
      const maxReturnable = item.qty - alreadyReturned;

      if (qty > maxReturnable) {
        throw new ReturnQuantityExceededError(qty, maxReturnable);
      }

      // 5. Insert return_requests row
      const inserted = (await tx`
        INSERT INTO return_requests (
          order_id,
          seller_order_id,
          store_id,
          order_item_id,
          user_id,
          qty,
          reason,
          customer_notes,
          status
        ) VALUES (
          ${orderId},
          ${item.seller_order_id},
          ${item.store_id},
          ${orderItemId},
          ${userId},
          ${qty},
          ${reason.trim()},
          ${customerNotes?.trim() ?? null},
          'PENDING_INSPECTION'
        )
        RETURNING
          id,
          order_id,
          seller_order_id,
          store_id,
          order_item_id,
          user_id,
          qty,
          reason,
          customer_notes,
          status,
          inspection_notes,
          created_at
      `) as unknown as ReturnRequestDbRow[];

      const row = inserted[0]!;

      // 6. Write return.requested event to outbox
      await writeOutboxEvent(tx, {
        aggregateType: 'return_request',
        aggregateId: row.id,
        type: 'return.requested',
        payload: {
          returnRequestId: row.id,
          orderId,
          sellerOrderId: row.seller_order_id,
          storeId: row.store_id,
          orderItemId,
          userId,
          qty,
          reason: row.reason,
        },
        correlationId: orderId,
        causationId: row.id,
      });

      return {
        id: row.id,
        orderId: row.order_id,
        sellerOrderId: row.seller_order_id,
        storeId: row.store_id,
        orderItemId: row.order_item_id,
        userId: row.user_id,
        qty: row.qty,
        reason: row.reason,
        customerNotes: row.customer_notes,
        status: row.status,
        inspectionNotes: row.inspection_notes,
        createdAt: row.created_at.toISOString(),
      };
    });
  }

  /**
   * Lists customer return requests, optionally filtered by orderId.
   */
  async listReturnRequests(
    userId: string,
    orderId?: string,
  ): Promise<ReturnRequestDto[]> {
    const sql = this.getSql();

    let rows: ReturnRequestDbRow[];
    if (orderId) {
      rows = (await sql`
        SELECT
          id,
          order_id,
          seller_order_id,
          store_id,
          order_item_id,
          user_id,
          qty,
          reason,
          customer_notes,
          status,
          inspection_notes,
          created_at
        FROM return_requests
        WHERE user_id = ${userId} AND order_id = ${orderId}
        ORDER BY created_at DESC
      `) as unknown as ReturnRequestDbRow[];
    } else {
      rows = (await sql`
        SELECT
          id,
          order_id,
          seller_order_id,
          store_id,
          order_item_id,
          user_id,
          qty,
          reason,
          customer_notes,
          status,
          inspection_notes,
          created_at
        FROM return_requests
        WHERE user_id = ${userId}
        ORDER BY created_at DESC
      `) as unknown as ReturnRequestDbRow[];
    }

    return rows.map((r) => ({
      id: r.id,
      orderId: r.order_id,
      sellerOrderId: r.seller_order_id,
      storeId: r.store_id,
      orderItemId: r.order_item_id,
      userId: r.user_id,
      qty: r.qty,
      reason: r.reason,
      customerNotes: r.customer_notes,
      status: r.status,
      inspectionNotes: r.inspection_notes,
      createdAt: r.created_at.toISOString(),
    }));
  }

  /**
   * Lists return requests for a specific store (vendor return queue).
   */
  async listSellerReturnRequests(
    storeId: string,
    status?: 'PENDING_INSPECTION' | 'APPROVED' | 'REJECTED',
  ): Promise<SellerReturnRequestDto[]> {
    const sql = this.getSql();

    const rows = (await sql`
      SELECT
        rr.id,
        rr.order_id,
        rr.seller_order_id,
        rr.store_id,
        rr.order_item_id,
        rr.user_id,
        rr.qty,
        rr.reason,
        rr.customer_notes,
        rr.status,
        rr.inspection_notes,
        rr.created_at,
        oi.title_snapshot,
        oi.sku_snapshot,
        oi.unit_price_cents
      FROM return_requests rr
      JOIN order_items oi ON rr.order_item_id = oi.id
      WHERE rr.store_id = ${storeId}
        ${status ? sql`AND rr.status = ${status}` : sql``}
      ORDER BY rr.created_at DESC
    `) as unknown as Array<
      ReturnRequestDbRow & {
        title_snapshot: string;
        sku_snapshot: string;
        unit_price_cents: number;
      }
    >;

    return rows.map((r) => ({
      id: r.id,
      orderId: r.order_id,
      sellerOrderId: r.seller_order_id,
      storeId: r.store_id,
      orderItemId: r.order_item_id,
      userId: r.user_id,
      qty: r.qty,
      reason: r.reason,
      customerNotes: r.customer_notes,
      status: r.status,
      inspectionNotes: r.inspection_notes,
      createdAt: r.created_at.toISOString(),
      itemTitle: r.title_snapshot,
      itemSku: r.sku_snapshot,
      itemUnitPriceCents: r.unit_price_cents,
    }));
  }

  /**
   * Processes vendor physical inspection decision on a return request.
   * If approved with restock=true, adjusts inventory on_hand and records movement ledger.
   */
  async inspectReturnRequest(
    storeId: string,
    returnId: string,
    input: InspectReturnRequestDto,
  ): Promise<SellerReturnRequestDto> {
    const sql = this.getSql();

    return await sql.begin(async (tx) => {
      // 1. Lock and fetch return request
      const rows = (await tx`
        SELECT
          rr.id,
          rr.order_id,
          rr.seller_order_id,
          rr.store_id,
          rr.order_item_id,
          rr.user_id,
          rr.qty,
          rr.reason,
          rr.customer_notes,
          rr.status,
          rr.inspection_notes,
          rr.created_at,
          oi.variant_id,
          oi.title_snapshot,
          oi.sku_snapshot,
          oi.unit_price_cents
        FROM return_requests rr
        JOIN order_items oi ON rr.order_item_id = oi.id
        WHERE rr.id = ${returnId}
        FOR UPDATE
      `) as unknown as Array<
        ReturnRequestDbRow & {
          variant_id: string;
          title_snapshot: string;
          sku_snapshot: string;
          unit_price_cents: number;
        }
      >;

      if (rows.length === 0 || rows[0]!.store_id !== storeId) {
        throw new ReturnRequestNotFoundError(returnId);
      }

      const returnReq = rows[0]!;
      if (returnReq.status !== 'PENDING_INSPECTION') {
        throw new ReturnAlreadyInspectedError(returnId, returnReq.status);
      }

      // 2. Update status and inspection notes
      const notes = input.inspectionNotes ?? null;
      await tx`
        UPDATE return_requests
        SET
          status = ${input.decision},
          inspection_notes = ${notes}
        WHERE id = ${returnId}
      `;

      // 3. If approved and restock requested, return to inventory
      if (input.decision === 'APPROVED' && input.restock) {
        await inventoryService.adjustStock(tx, {
          storeId,
          variantId: returnReq.variant_id,
          deltaOnHand: returnReq.qty,
          reason: 'return_restock',
          operationKey: `return:${returnId}:${returnReq.variant_id}`,
          refId: returnId,
        });
      }

      // 4. Transactional outbox event
      await writeOutboxEvent(tx, {
        aggregateType: 'return_request',
        aggregateId: returnId,
        type: 'return.inspected',
        payload: {
          returnRequestId: returnId,
          orderId: returnReq.order_id,
          sellerOrderId: returnReq.seller_order_id,
          storeId,
          decision: input.decision,
          restock: !!input.restock,
          inspectionNotes: notes,
        },
      });

      return {
        id: returnReq.id,
        orderId: returnReq.order_id,
        sellerOrderId: returnReq.seller_order_id,
        storeId: returnReq.store_id,
        orderItemId: returnReq.order_item_id,
        userId: returnReq.user_id,
        qty: returnReq.qty,
        reason: returnReq.reason,
        customerNotes: returnReq.customer_notes,
        status: input.decision,
        inspectionNotes: notes,
        createdAt: returnReq.created_at.toISOString(),
        itemTitle: returnReq.title_snapshot,
        itemSku: returnReq.sku_snapshot,
        itemUnitPriceCents: returnReq.unit_price_cents,
      };
    });
  }
}

export const returnsService = new ReturnsService();
