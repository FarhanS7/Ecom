// @shopscale/backend/commerce/fulfillment.service - Seller fulfillment workflow service (T056).
// Invariants:
// 1. Unpaid orders cannot be fulfilled (payment_status must be 'PAID').
// 2. Strict sequential transitions: PENDING -> PACKED -> SHIPPED -> DELIVERED.
// 3. Jumps and backward transitions throw IllegalFulfillmentTransitionError.
// 4. Transitioning to SHIPPED requires non-empty trackingRef.
// 5. Parent order fulfillment status is dynamically derived from all child suborders.
// 6. SuborderTransitioned event emitted to transactional outbox.
// 7. Atomic transaction updates seller_orders, fulfillment_events, orders, and outbox together.

import type { Sql } from 'postgres';
import type { SellerSuborderDto } from '@shopscale/contracts';
import { getDb } from '../db/client.js';
import { writeOutboxEvent } from '../platform/outbox.service.js';
import {
  deriveParentFulfillmentStatus,
  validateFulfillmentTransition,
  type SuborderFulfillmentStatus,
  type TargetSuborderStatus,
} from './fulfillment-fsm.js';
import {
  FulfillmentStoreMismatchError,
  FulfillmentSuborderNotFoundError,
  OrderNotFoundError,
} from './errors.js';
import { maskAddressSnapshot } from './pii-masker.js';
import type { AddressSnapshot, OrderFulfillmentStatus } from './schema.js';
import { auditService } from '../platform/audit.service.js';

interface SellerOrderDbRow {
  id: string;
  order_id: string;
  store_id: string;
  fulfillment_status: string;
  subtotal_cents: number;
  shipping_cents: number;
  discount_cents: number;
  total_cents: number;
  commission_bps_snapshot: number;
  tracking_ref: string | null;
  carrier: string | null;
  shipped_at: Date | null;
  delivered_at: Date | null;
  created_at: Date;
}

interface OrderDbRow {
  id: string;
  payment_status: string;
  fulfillment_status: OrderFulfillmentStatus;
  address_snapshot: AddressSnapshot;
}

export interface TransitionSuborderInput {
  storeId: string;
  suborderId: string;
  toStatus: TargetSuborderStatus;
  trackingRef?: string | undefined;
  carrier?: string | undefined;
  actorId?: string | undefined;
}

export interface TransitionSuborderResult {
  success: boolean;
  suborder: SellerSuborderDto;
  parentFulfillmentStatus: OrderFulfillmentStatus;
  isNoop: boolean;
}

function mapToSellerSuborderDto(
  row: SellerOrderDbRow,
  isPaid: boolean,
  addressSnapshot?: AddressSnapshot,
): SellerSuborderDto {
  const maskedAddress = addressSnapshot
    ? maskAddressSnapshot(addressSnapshot, isPaid)
    : undefined;

  return {
    id: row.id,
    orderId: row.order_id,
    storeId: row.store_id,
    fulfillmentStatus: row.fulfillment_status as 'PENDING' | 'PACKED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED',
    subtotalCents: row.subtotal_cents,
    shippingCents: row.shipping_cents,
    discountCents: row.discount_cents,
    totalCents: row.total_cents,
    commissionBpsSnapshot: row.commission_bps_snapshot,
    trackingRef: row.tracking_ref ?? undefined,
    carrier: row.carrier ?? undefined,
    shippedAt: row.shipped_at ? row.shipped_at.toISOString() : undefined,
    deliveredAt: row.delivered_at ? row.delivered_at.toISOString() : undefined,
    createdAt: row.created_at.toISOString(),
    shippingAddress: maskedAddress,
  };
}

export class FulfillmentService {
  constructor(private readonly explicitSql?: Sql) {}

  private getSql(): Sql {
    return this.explicitSql ?? getDb();
  }

  async transitionSuborder(input: TransitionSuborderInput): Promise<TransitionSuborderResult> {
    const sql = this.getSql();
    const { storeId, suborderId, toStatus, trackingRef, carrier, actorId } = input;

    return await sql.begin(async (tx) => {
      // 1. Lock and load suborder
      const suborderRows = (await tx`
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
          tracking_ref,
          carrier,
          shipped_at,
          delivered_at,
          created_at
        FROM seller_orders
        WHERE id = ${suborderId}
        FOR UPDATE
      `) as unknown as SellerOrderDbRow[];

      if (suborderRows.length === 0) {
        throw new FulfillmentSuborderNotFoundError(suborderId);
      }

      const suborder = suborderRows[0]!;
      if (suborder.store_id !== storeId) {
        throw new FulfillmentStoreMismatchError(storeId, suborderId);
      }

      // 2. Lock and load parent order
      const orderRows = (await tx`
        SELECT id, payment_status, fulfillment_status, address_snapshot
        FROM orders
        WHERE id = ${suborder.order_id}
        FOR UPDATE
      `) as unknown as OrderDbRow[];

      if (orderRows.length === 0) {
        throw new OrderNotFoundError(`Parent order '${suborder.order_id}' not found.`);
      }

      const order = orderRows[0]!;

      // 3. Validate transition with FSM rules
      const validation = validateFulfillmentTransition({
        currentStatus: suborder.fulfillment_status as SuborderFulfillmentStatus,
        toStatus,
        orderPaymentStatus: order.payment_status,
        trackingRef,
        carrier,
      });

      if (validation.isNoop) {
        return {
          success: true,
          isNoop: true,
          suborder: mapToSellerSuborderDto(suborder, order.payment_status === 'PAID', order.address_snapshot),
          parentFulfillmentStatus: order.fulfillment_status,
        };
      }

      // 4. Compute updated values
      const finalTrackingRef =
        toStatus === 'SHIPPED' ? (trackingRef?.trim() ?? null) : (suborder.tracking_ref ?? null);
      const finalCarrier =
        toStatus === 'SHIPPED' ? (carrier?.trim() ?? null) : (suborder.carrier ?? null);
      const shippedAtSql =
        toStatus === 'SHIPPED'
          ? tx`NOW()`
          : suborder.shipped_at
            ? tx`${suborder.shipped_at}`
            : null;
      const deliveredAtSql =
        toStatus === 'DELIVERED'
          ? tx`NOW()`
          : suborder.delivered_at
            ? tx`${suborder.delivered_at}`
            : null;

      // 5. Update seller_orders
      const updatedSuborders = (await tx`
        UPDATE seller_orders
        SET
          fulfillment_status = ${toStatus},
          tracking_ref = ${finalTrackingRef},
          carrier = ${finalCarrier},
          shipped_at = ${shippedAtSql},
          delivered_at = ${deliveredAtSql},
          updated_at = NOW()
        WHERE id = ${suborderId} AND store_id = ${storeId}
        RETURNING
          id,
          order_id,
          store_id,
          fulfillment_status,
          subtotal_cents,
          shipping_cents,
          discount_cents,
          total_cents,
          commission_bps_snapshot,
          tracking_ref,
          carrier,
          shipped_at,
          delivered_at,
          created_at
      `) as unknown as SellerOrderDbRow[];

      const updatedSuborder = updatedSuborders[0]!;

      // 6. Record in fulfillment_events audit ledger
      const metadataJson = JSON.stringify({ actorId: actorId ?? null, timestamp: Date.now() });
      const eventRows = (await tx`
        INSERT INTO fulfillment_events (
          order_id,
          seller_order_id,
          store_id,
          from_status,
          to_status,
          tracking_ref,
          carrier,
          actor_id,
          metadata
        ) VALUES (
          ${order.id},
          ${suborderId},
          ${storeId},
          ${suborder.fulfillment_status},
          ${toStatus},
          ${finalTrackingRef},
          ${finalCarrier},
          ${actorId ?? null},
          ${metadataJson}::jsonb
        )
        RETURNING id
      `) as unknown as Array<{ id: string }>;

      const fulfillmentEventId = eventRows[0]!.id;

      // 7. Re-evaluate parent order fulfillment status
      const siblingSuborders = (await tx`
        SELECT fulfillment_status
        FROM seller_orders
        WHERE order_id = ${order.id}
      `) as unknown as Array<{ fulfillment_status: string }>;

      const newParentStatus = deriveParentFulfillmentStatus(
        siblingSuborders.map((s) => s.fulfillment_status as SuborderFulfillmentStatus),
      );

      if (newParentStatus !== order.fulfillment_status) {
        await tx`
          UPDATE orders
          SET fulfillment_status = ${newParentStatus}, updated_at = NOW()
          WHERE id = ${order.id}
        `;
      }

      // 8. Write SuborderTransitioned domain event to transactional outbox
      await writeOutboxEvent(tx, {
        aggregateType: 'order',
        aggregateId: order.id,
        type: 'order.suborder_transitioned',
        payload: {
          orderId: order.id,
          suborderId,
          storeId,
          fromStatus: suborder.fulfillment_status,
          toStatus,
          trackingRef: finalTrackingRef,
          carrier: finalCarrier,
          parentFulfillmentStatus: newParentStatus,
          fulfillmentEventId,
        },
        correlationId: order.id,
        causationId: fulfillmentEventId,
      });

      // 9. Audit privileged fulfillment transition
      await auditService.recordMutation(
        {
          actorId: actorId ?? null,
          storeId,
          action: 'fulfillment.suborder_transitioned',
          entityType: 'seller_order',
          entityId: suborderId,
          before: { fulfillmentStatus: suborder.fulfillment_status },
          after: {
            fulfillmentStatus: toStatus,
            trackingRef: finalTrackingRef,
            carrier: finalCarrier,
            parentFulfillmentStatus: newParentStatus,
          },
        },
        tx,
      );

      return {
        success: true,
        isNoop: false,
        suborder: mapToSellerSuborderDto(updatedSuborder, true, order.address_snapshot),
        parentFulfillmentStatus: newParentStatus,
      };
    });
  }
}

export const fulfillmentService = new FulfillmentService();
