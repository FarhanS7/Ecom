// @shopscale/backend/payments/refund.service - Double-entry refund engine with cumulative cap protection (T060, DEC-012).
// Invariants:
// 1. Row-level locks (SELECT ... FOR UPDATE) on payment_attempts prevent concurrent double-refunds (G3).
// 2. Cumulative refunds cannot exceed captured payment amount: sum(prior_refunds) + refund <= captured.
// 3. Balanced double-entry financial entries recorded atomically with refund.
// 4. Optional restock adjusts inventory on_hand with 'return_restock' movement audit ledger.
// 5. Support policy cap enforced (default $200.00 / 20000 cents) unless escalated.
// 6. Outbox event order.refund_completed emitted within the same ACID transaction.

import type { Sql } from 'postgres';
import { getDb } from '../db/client.js';
import { inventoryService } from '../inventory/inventory.service.js';
import { writeOutboxEvent } from '../platform/outbox.service.js';
import { financialLedgerService } from './financial-ledger.service.js';
import type { FinancialEntryInput } from './financial-ledger.service.js';
import { auditService } from '../platform/audit.service.js';
import {
  InvalidRefundAmountError,
  NoPaidPaymentError,
  RefundExceedsPaymentError,
  RefundPolicyCapExceededError,
} from './errors.js';

export interface RefundItemInput {
  orderItemId: string;
  qty: number;
  amountCents?: number | undefined;
  restock?: boolean | undefined;
}

export interface ProcessRefundInput {
  orderId: string;
  amountCents?: number | undefined;
  reason: string;
  items?: RefundItemInput[] | undefined;
  actorId?: string | undefined;
  isSupportAgent?: boolean | undefined;
  policyCapCents?: number | undefined;
}

export interface RefundResult {
  refundId: string;
  orderId: string;
  amountCents: number;
  remainingCents: number;
  isFullyRefunded: boolean;
  status: 'COMPLETED';
}

interface PaymentAttemptDbRow {
  id: string;
  order_id: string;
  amount_cents: number;
  status: string;
}

interface OrderItemDbRow {
  id: string;
  order_id: string;
  store_id: string;
  variant_id: string;
  qty: number;
  unit_price_cents: number;
  total_cents: number;
}

export class RefundService {
  constructor(private readonly explicitSql?: Sql) {}

  private getSql(): Sql {
    return this.explicitSql ?? getDb();
  }

  /**
   * Processes a full or partial refund with strict row-locking, cumulative cap checks,
   * balanced double-entry accounting ledgering, and optional restocking.
   */
  async processRefund(input: ProcessRefundInput): Promise<RefundResult> {
    const sql = this.getSql();

    return await sql.begin(async (tx) => {
      // 1. Lock payment attempt for update to serialize concurrent refund requests
      const paymentAttempts = (await tx`
        SELECT id, order_id, amount_cents, status
        FROM payment_attempts
        WHERE order_id = ${input.orderId}
          AND status IN ('PAID', 'REFUNDED')
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE;
      `) as unknown as PaymentAttemptDbRow[];

      if (paymentAttempts.length === 0) {
        throw new NoPaidPaymentError(input.orderId);
      }

      const paymentAttempt = paymentAttempts[0]!;

      // 2. Query prior completed refunds for this order
      const [priorSummary] = (await tx`
        SELECT COALESCE(SUM(amount_cents), 0)::int AS total_refunded
        FROM refunds
        WHERE order_id = ${input.orderId}
          AND status = 'COMPLETED';
      `) as unknown as Array<{ total_refunded: number }>;

      const priorRefundedCents = priorSummary?.total_refunded ?? 0;
      const remainingCents = paymentAttempt.amount_cents - priorRefundedCents;

      if (remainingCents <= 0) {
        throw new RefundExceedsPaymentError(0, 0);
      }

      // 3. Determine target refund amount
      const targetRefundCents = input.amountCents ?? remainingCents;

      if (targetRefundCents <= 0) {
        throw new InvalidRefundAmountError(targetRefundCents);
      }

      if (targetRefundCents > remainingCents) {
        throw new RefundExceedsPaymentError(targetRefundCents, remainingCents);
      }

      // 4. Enforce support policy cap if applicable (default 20000 cents / $200.00)
      // Cumulative check: single refund or prior refunds + new refund cannot exceed policy cap
      if (input.isSupportAgent) {
        const policyCap = input.policyCapCents ?? 20000;
        if (targetRefundCents > policyCap || priorRefundedCents + targetRefundCents > policyCap) {
          throw new RefundPolicyCapExceededError(
            targetRefundCents > policyCap ? targetRefundCents : priorRefundedCents + targetRefundCents,
            policyCap,
          );
        }
      }

      // 5. Insert refund record
      const [refundRow] = (await tx`
        INSERT INTO "refunds" (
          "order_id",
          "payment_attempt_id",
          "amount_cents",
          "currency",
          "reason",
          "status",
          "created_by"
        ) VALUES (
          ${input.orderId},
          ${paymentAttempt.id},
          ${targetRefundCents},
          'USD',
          ${input.reason},
          'COMPLETED',
          ${input.actorId ?? null}
        )
        RETURNING id;
      `) as unknown as Array<{ id: string }>;

      const refundId = refundRow!.id;

      // 6. Handle item allocations and restocking if items are specified
      if (input.items && input.items.length > 0) {
        for (const item of input.items) {
          const [orderItem] = (await tx`
            SELECT id, order_id, store_id, variant_id, qty, unit_price_cents, total_cents
            FROM order_items
            WHERE id = ${item.orderItemId} AND order_id = ${input.orderId};
          `) as unknown as OrderItemDbRow[];

          if (!orderItem) continue;

          const itemRefundCents = item.amountCents ?? orderItem.unit_price_cents * item.qty;

          await tx`
            INSERT INTO "refund_items" (
              "refund_id",
              "order_item_id",
              "qty",
              "amount_cents",
              "restock"
            ) VALUES (
              ${refundId},
              ${item.orderItemId},
              ${item.qty},
              ${itemRefundCents},
              ${!!item.restock}
            );
          `;

          if (item.restock) {
            await inventoryService.adjustStock(tx, {
              storeId: orderItem.store_id,
              variantId: orderItem.variant_id,
              deltaOnHand: item.qty,
              reason: 'return_restock',
              operationKey: `refund:${refundId}:${orderItem.id}`,
              refId: refundId,
            });
          }
        }
      }

      // 7. Write balanced double-entry financial ledger entries
      // Operation: refund:${refundId}
      // Debit: seller_payable (reduces liability to seller)
      // Credit: payment_gateway_clearing (reduces cash captured from gateway)
      const ledgerEntries: FinancialEntryInput[] = [
        {
          operationKey: `refund:${refundId}`,
          orderId: input.orderId,
          refundId,
          account: 'seller_payable',
          debitCents: targetRefundCents,
          creditCents: 0,
        },
        {
          operationKey: `refund:${refundId}`,
          orderId: input.orderId,
          refundId,
          account: 'payment_gateway_clearing',
          debitCents: 0,
          creditCents: targetRefundCents,
        },
      ];

      await financialLedgerService.recordEntries(tx, ledgerEntries);

      // 8. Update payment status if fully refunded
      const isFullyRefunded = priorRefundedCents + targetRefundCents >= paymentAttempt.amount_cents;

      if (isFullyRefunded) {
        await tx`
          UPDATE "orders"
          SET
            "payment_status" = 'REFUNDED',
            "updated_at" = NOW()
          WHERE "id" = ${input.orderId};
        `;

        await tx`
          UPDATE "payment_attempts"
          SET
            "status" = 'REFUNDED',
            "updated_at" = NOW()
          WHERE "id" = ${paymentAttempt.id};
        `;
      }

      // 9. Transactional outbox event
      await writeOutboxEvent(tx, {
        aggregateType: 'order',
        aggregateId: input.orderId,
        type: 'order.refund_completed',
        payload: {
          orderId: input.orderId,
          refundId,
          amountCents: targetRefundCents,
          priorRefundedCents,
          remainingCents: remainingCents - targetRefundCents,
          isFullyRefunded,
          reason: input.reason,
          actorId: input.actorId,
        },
      });

      // 10. Audit privileged refund mutation
      await auditService.recordMutation(
        {
          actorId: input.actorId ?? null,
          action: 'refund.issued',
          entityType: 'refund',
          entityId: refundId,
          before: {
            orderId: input.orderId,
            priorRefundedCents,
            remainingCents,
          },
          after: {
            orderId: input.orderId,
            refundId,
            amountCents: targetRefundCents,
            isFullyRefunded,
            reason: input.reason,
          },
        },
        tx,
      );

      return {
        refundId,
        orderId: input.orderId,
        amountCents: targetRefundCents,
        remainingCents: remainingCents - targetRefundCents,
        isFullyRefunded,
        status: 'COMPLETED',
      };
    });
  }
}

export const refundService = new RefundService();
