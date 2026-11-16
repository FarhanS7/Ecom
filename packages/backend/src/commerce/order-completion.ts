// @shopscale/backend/commerce/order-completion - Order settlement & saga compensation handler (T051).
// Invariants:
// 1. On payment.succeeded: updates orders.payment_status = 'PAID', confirms inventory (on_hand -= qty, reserved -= qty),
//    and emits OrderPaid event with seller suborder IDs into transactional outbox.
// 2. On payment.failed: updates orders.payment_status = 'FAILED' & orders.fulfillment_status = 'CANCELLED',
//    seller_orders.fulfillment_status = 'CANCELLED', releases inventory (reserved -= qty),
//    and emits OrderCancelled event into transactional outbox.
// 3. Complete idempotency: duplicate events for already-paid or already-cancelled orders produce zero side effects.
// 4. All writes occur inside a single atomic ACID transaction.

import type { Sql } from 'postgres';
import { getDb } from '../db/client.js';
import { inventoryService } from '../inventory/inventory.service.js';
import { writeOutboxEvent } from '../platform/outbox.service.js';
import { couponService } from '../promotions/coupon.service.js';

export interface PaymentObservedPayload {
  eventId?: string;
  type?: 'payment.succeeded' | 'payment.failed';
  effectKey?: string;
  amountCents?: string | number;
  providerRef?: string;
  status?: 'PAID' | 'FAILED';
  timestamp?: number;
  orderId?: string;
}

export interface PaymentObservedEvent {
  aggregateId: string;
  payload: unknown;
  causationId?: string | undefined;
  correlationId?: string | undefined;
}

export interface OrderCompletionResult {
  status: 'confirmed' | 'compensated' | 'noop';
  orderId: string;
}

interface OrderDbRow {
  id: string;
  payment_status: string;
  fulfillment_status: string;
  total_cents: number;
  currency: string;
}

interface SellerOrderDbRow {
  id: string;
}

interface PaymentAttemptDbRow {
  order_id: string;
}

export class OrderCompletionService {
  constructor(private readonly explicitSql?: Sql) {}

  private getSql(): Sql {
    return this.explicitSql ?? getDb();
  }

  async handlePaymentObserved(event: PaymentObservedEvent): Promise<OrderCompletionResult> {
    const sql = this.getSql();
    const payload = (event.payload ?? {}) as PaymentObservedPayload;

    return await sql.begin(async (tx) => {
      // 1. Resolve orderId: from aggregateId, payload.orderId, or effectKey via payment_attempts
      let orderId = event.aggregateId;

      const orderRows = (await tx`
        SELECT id, payment_status, fulfillment_status, total_cents, currency
        FROM orders
        WHERE id = ${orderId}
        FOR UPDATE
      `) as unknown as OrderDbRow[];

      let order: OrderDbRow | undefined = orderRows[0];

      if (!order && payload.effectKey) {
        const attemptRows = (await tx`
          SELECT order_id
          FROM payment_attempts
          WHERE effect_key = ${payload.effectKey}
        `) as unknown as PaymentAttemptDbRow[];

        if (attemptRows.length > 0) {
          orderId = attemptRows[0]!.order_id;
          const retryOrderRows = (await tx`
            SELECT id, payment_status, fulfillment_status, total_cents, currency
            FROM orders
            WHERE id = ${orderId}
            FOR UPDATE
          `) as unknown as OrderDbRow[];
          order = retryOrderRows[0];
        }
      }

      if (!order) {
        return { status: 'noop', orderId };
      }

      const isPaymentSuccess =
        payload.status === 'PAID' || payload.type === 'payment.succeeded';

      // 2. SUCCESS PATH: Confirm order & settle inventory
      if (isPaymentSuccess) {
        if (order.payment_status === 'PAID') {
          // Idempotent: already marked PAID
          return { status: 'noop', orderId };
        }

        // Attempt confirming active inventory reservation (on_hand -= qty, reserved -= qty)
        const confirmResult = await inventoryService.confirmReservation(tx, orderId);

        // Check if reservations were already expired (T053 Late payment after expiry race)
        if (confirmResult.confirmedCount === 0) {
          const expiredReservations = (await tx`
            SELECT id FROM stock_reservations
            WHERE cart_id = ${orderId} AND status = 'expired'
          `) as unknown as Array<{ id: string }>;

          if (expiredReservations.length > 0 || order.fulfillment_status === 'CANCELLED') {
            // LATE PAYMENT RACE DETECTED: Reservation expired before payment completed!
            // Do NOT confirm order. Initiate automated refund compensation.
            await tx`
              UPDATE orders
              SET payment_status = 'REFUNDED',
                  fulfillment_status = 'CANCELLED',
                  updated_at = NOW()
              WHERE id = ${orderId}
            `;

            await tx`
              UPDATE seller_orders
              SET fulfillment_status = 'CANCELLED'
              WHERE order_id = ${orderId}
            `;

            await writeOutboxEvent(tx, {
              aggregateType: 'order',
              aggregateId: orderId,
              type: 'order.refund_requested',
              payload: {
                orderId,
                amountCents: order.total_cents,
                reason: 'RESERVATION_EXPIRED',
                effectKey: payload.effectKey,
                providerRef: payload.providerRef,
              },
              correlationId: event.correlationId ?? payload.effectKey ?? orderId,
              causationId: event.causationId ?? payload.eventId ?? orderId,
            });

            return { status: 'compensated', orderId };
          }
        }

        // Update parent order payment status
        await tx`
          UPDATE orders
          SET payment_status = 'PAID',
              updated_at = NOW()
          WHERE id = ${orderId}
        `;

        // Redeem held coupon if applicable
        await couponService.redeemCoupon(tx, orderId);

        // Fetch seller suborder IDs for downstream fanout
        const sellerOrders = (await tx`
          SELECT id FROM seller_orders
          WHERE order_id = ${orderId}
        `) as unknown as SellerOrderDbRow[];

        const sellerOrderIds = sellerOrders.map((s) => s.id);

        // Emit OrderPaid domain event into transactional outbox
        await writeOutboxEvent(tx, {
          aggregateType: 'order',
          aggregateId: orderId,
          type: 'order.paid',
          payload: {
            orderId,
            sellerOrderIds,
            totalCents: order.total_cents,
            currency: order.currency ?? 'USD',
          },
          correlationId: event.correlationId ?? payload.effectKey ?? orderId,
          causationId: event.causationId ?? payload.eventId ?? orderId,
        });

        return { status: 'confirmed', orderId };
      }

      // 3. FAILURE / COMPENSATION PATH: Cancel order & release reserved stock
      if (order.payment_status === 'PAID') {
        // Guard: Do not cancel an already paid order
        return { status: 'noop', orderId };
      }

      if (order.payment_status === 'FAILED' && order.fulfillment_status === 'CANCELLED') {
        // Idempotent: already cancelled
        return { status: 'noop', orderId };
      }

      // Transition order and seller suborders to CANCELLED
      await tx`
        UPDATE orders
        SET payment_status = 'FAILED',
            fulfillment_status = 'CANCELLED',
            updated_at = NOW()
        WHERE id = ${orderId}
      `;

      await tx`
        UPDATE seller_orders
        SET fulfillment_status = 'CANCELLED'
        WHERE order_id = ${orderId}
      `;

      // Release inventory reservation (reserved -= qty, on_hand untouched)
      await inventoryService.releaseReservation(tx, orderId, 'PAYMENT_FAILED');

      // Release held coupon if applicable
      await couponService.releaseCoupon(tx, orderId);

      // Emit OrderCancelled domain event into transactional outbox
      await writeOutboxEvent(tx, {
        aggregateType: 'order',
        aggregateId: orderId,
        type: 'order.cancelled',
        payload: {
          orderId,
          reason: 'PAYMENT_FAILED',
        },
        correlationId: event.correlationId ?? payload.effectKey ?? orderId,
        causationId: event.causationId ?? payload.eventId ?? orderId,
      });

      return { status: 'compensated', orderId };
    });
  }
}

export const orderCompletionService = new OrderCompletionService();
