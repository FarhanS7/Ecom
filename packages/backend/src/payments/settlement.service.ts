// @shopscale/backend/payments/settlement.service - Simulated seller settlement & commission accounting (T070, DEC-012).
// Invariants:
// 1. Commission deduction: Net = Subtotal - Refunds - (NetSales * CommissionRate).
// 2. Exact balance enforcement: SUM(debits) === SUM(credits) on every recorded payout operation.
// 3. Strict idempotency: effect_key prevents duplicate payouts for the same store and period.
// 4. Negative balance carry-forward: If refunds exceed sales, net payout is 0 and deficit carried forward.
// 5. Append-only ledger: seller_payouts and financial_entries are immutable.

import type { Sql } from 'postgres';
import { getDb } from '../db/client.js';
import { financialLedgerService } from './financial-ledger.service.js';
import type { FinancialEntryInput } from './financial-ledger.service.js';
import type { SellerPayoutRow, SellerPayoutStatus } from './schema.js';

export interface CalculationInput {
  grossSalesCents: number;
  refundCents: number;
  priorCarriedForwardCents: number;
  commissionBps: number;
}

export interface SettlementCalculation {
  grossSalesCents: number;
  refundDeductionsCents: number;
  netSalesCents: number;
  commissionBps: number;
  commissionCents: number;
  amountCents: number;
  carriedForwardCents: number;
  status: SellerPayoutStatus;
}

export interface SettleStorePeriodInput {
  storeId: string;
  periodStart: Date;
  periodEnd: Date;
  effectKey?: string | undefined;
}

export interface SettleAllStoresPeriodInput {
  periodStart: Date;
  periodEnd: Date;
}

export interface SettlementResult {
  payoutId: string;
  storeId: string;
  periodStart: Date;
  periodEnd: Date;
  grossSalesCents: number;
  refundDeductionsCents: number;
  netSalesCents: number;
  commissionBps: number;
  commissionCents: number;
  amountCents: number;
  carriedForwardCents: number;
  status: SellerPayoutStatus;
  effectKey: string;
  isExisting?: boolean | undefined;
}

/**
 * Calculates net sales, commission, net payout, and carried forward amounts.
 */
export function calculateCommissionAndPayout(input: CalculationInput): SettlementCalculation {
  const { grossSalesCents, refundCents, priorCarriedForwardCents, commissionBps } = input;
  const totalDeductions = refundCents + priorCarriedForwardCents;
  const netSalesCents = grossSalesCents - totalDeductions;

  if (netSalesCents <= 0) {
    const deficit = Math.abs(netSalesCents);
    return {
      grossSalesCents,
      refundDeductionsCents: totalDeductions,
      netSalesCents,
      commissionBps,
      commissionCents: 0,
      amountCents: 0,
      carriedForwardCents: deficit,
      status: deficit > 0 ? 'CARRIED_FORWARD' : 'COMPLETED',
    };
  }

  const commissionCents = Math.round((netSalesCents * commissionBps) / 10000);
  const amountCents = netSalesCents - commissionCents;

  return {
    grossSalesCents,
    refundDeductionsCents: totalDeductions,
    netSalesCents,
    commissionBps,
    commissionCents,
    amountCents,
    carriedForwardCents: 0,
    status: 'COMPLETED',
  };
}

/**
 * Generates a deterministic effect key for a store settlement period.
 */
export function generateSettlementEffectKey(
  storeId: string,
  periodStart: Date,
  periodEnd: Date,
): string {
  return `settlement:${storeId}:${periodStart.toISOString()}:${periodEnd.toISOString()}`;
}

export class SettlementService {
  constructor(private readonly explicitSql?: Sql) {}

  private getSql(): Sql {
    return this.explicitSql ?? getDb();
  }

  /**
   * Generates double-entry ledger entries for a completed settlement.
   * Debits seller_payable for full netSalesCents.
   * Credits platform_commission for commissionCents.
   * Credits payment_gateway_clearing for net payout amountCents.
   * Sum(debits) = Sum(credits) === netSalesCents.
   */
  static buildLedgerEntries(input: {
    operationKey: string;
    storeId: string;
    payoutId: string;
    calculation: SettlementCalculation;
  }): FinancialEntryInput[] {
    const { operationKey, storeId, payoutId, calculation } = input;

    if (calculation.status === 'CARRIED_FORWARD' || calculation.netSalesCents <= 0) {
      return [];
    }

    return [
      {
        operationKey,
        payoutId,
        storeId,
        account: 'seller_payable',
        debitCents: calculation.netSalesCents,
        creditCents: 0,
      },
      {
        operationKey,
        payoutId,
        storeId,
        account: 'platform_commission',
        debitCents: 0,
        creditCents: calculation.commissionCents,
      },
      {
        operationKey,
        payoutId,
        storeId,
        account: 'payment_gateway_clearing',
        debitCents: 0,
        creditCents: calculation.amountCents,
      },
    ];
  }

  /**
   * Settles earnings and deductions for a single store over a time period.
   * Idempotent by effectKey.
   */
  async settleStorePeriod(input: SettleStorePeriodInput): Promise<SettlementResult> {
    const sql = this.getSql();
    const effectKey = input.effectKey ?? generateSettlementEffectKey(input.storeId, input.periodStart, input.periodEnd);

    // 1. Idempotency check: return existing payout if already settled
    const [existing] = (await sql`
      SELECT
        id,
        store_id,
        period_start,
        period_end,
        gross_sales_cents,
        refund_deductions_cents,
        net_sales_cents,
        commission_bps,
        commission_cents,
        amount_cents,
        carried_forward_cents,
        status,
        effect_key
      FROM seller_payouts
      WHERE effect_key = ${effectKey};
    `) as unknown as Array<{
      id: string;
      store_id: string;
      period_start: string;
      period_end: string;
      gross_sales_cents: string;
      refund_deductions_cents: string;
      net_sales_cents: string;
      commission_bps: number;
      commission_cents: string;
      amount_cents: string;
      carried_forward_cents: string;
      status: SellerPayoutStatus;
      effect_key: string;
    }>;

    if (existing) {
      return {
        payoutId: existing.id,
        storeId: existing.store_id,
        periodStart: new Date(existing.period_start),
        periodEnd: new Date(existing.period_end),
        grossSalesCents: parseInt(existing.gross_sales_cents, 10),
        refundDeductionsCents: parseInt(existing.refund_deductions_cents, 10),
        netSalesCents: parseInt(existing.net_sales_cents, 10),
        commissionBps: existing.commission_bps,
        commissionCents: parseInt(existing.commission_cents, 10),
        amountCents: parseInt(existing.amount_cents, 10),
        carriedForwardCents: parseInt(existing.carried_forward_cents, 10),
        status: existing.status,
        effectKey: existing.effect_key,
        isExisting: true,
      };
    }

    // 2. Perform settlement within atomic transaction
    return await sql.begin(async (tx) => {
      // Query store & business commission_bps
      const [storeRow] = (await tx`
        SELECT s.id, b.commission_bps
        FROM stores s
        JOIN businesses b ON s.business_id = b.id
        WHERE s.id = ${input.storeId};
      `) as unknown as Array<{ id: string; commission_bps: number }>;

      const commissionBps = storeRow?.commission_bps ?? 1000;

      // Query delivered seller orders in window
      const [salesRow] = (await tx`
        SELECT COALESCE(SUM(subtotal_cents), 0)::text AS gross_sales_cents
        FROM seller_orders
        WHERE store_id = ${input.storeId}
          AND fulfillment_status = 'DELIVERED'
          AND delivered_at >= ${input.periodStart}
          AND delivered_at < ${input.periodEnd};
      `) as unknown as Array<{ gross_sales_cents: string }>;

      const grossSalesCents = parseInt(salesRow?.gross_sales_cents ?? '0', 10);

      // Query completed refunds for items belonging to this store in window
      const [refundsRow] = (await tx`
        SELECT COALESCE(SUM(ri.amount_cents), 0)::text AS refund_cents
        FROM refund_items ri
        JOIN order_items oi ON ri.order_item_id = oi.id
        JOIN refunds r ON ri.refund_id = r.id
        WHERE oi.store_id = ${input.storeId}
          AND r.status = 'COMPLETED'
          AND r.created_at >= ${input.periodStart}
          AND r.created_at < ${input.periodEnd};
      `) as unknown as Array<{ refund_cents: string }>;

      const refundCents = parseInt(refundsRow?.refund_cents ?? '0', 10);

      // Query prior carried forward negative balance
      const [priorCarriedRow] = (await tx`
        SELECT carried_forward_cents
        FROM seller_payouts
        WHERE store_id = ${input.storeId}
          AND status = 'CARRIED_FORWARD'
          AND period_end <= ${input.periodStart}
        ORDER BY period_end DESC
        LIMIT 1;
      `) as unknown as Array<{ carried_forward_cents: string }>;

      const priorCarriedForwardCents = parseInt(priorCarriedRow?.carried_forward_cents ?? '0', 10);

      // Compute calculation
      const calculation = calculateCommissionAndPayout({
        grossSalesCents,
        refundCents,
        priorCarriedForwardCents,
        commissionBps,
      });

      // Insert into seller_payouts
      const [payout] = (await tx`
        INSERT INTO "seller_payouts" (
          "store_id",
          "period_start",
          "period_end",
          "gross_sales_cents",
          "refund_deductions_cents",
          "net_sales_cents",
          "commission_bps",
          "commission_cents",
          "amount_cents",
          "carried_forward_cents",
          "status",
          "effect_key"
        ) VALUES (
          ${input.storeId},
          ${input.periodStart},
          ${input.periodEnd},
          ${calculation.grossSalesCents},
          ${calculation.refundDeductionsCents},
          ${calculation.netSalesCents},
          ${calculation.commissionBps},
          ${calculation.commissionCents},
          ${calculation.amountCents},
          ${calculation.carriedForwardCents},
          ${calculation.status},
          ${effectKey}
        )
        RETURNING
          id,
          store_id,
          period_start,
          period_end,
          gross_sales_cents,
          refund_deductions_cents,
          net_sales_cents,
          commission_bps,
          commission_cents,
          amount_cents,
          carried_forward_cents,
          status,
          effect_key;
      `) as unknown as SellerPayoutRow[];

      if (!payout) {
        throw new Error('Failed to create seller payout record.');
      }

      // Record balanced financial ledger entries
      const ledgerEntries = SettlementService.buildLedgerEntries({
        operationKey: effectKey,
        storeId: input.storeId,
        payoutId: payout.id,
        calculation,
      });

      if (ledgerEntries.length > 0) {
        await financialLedgerService.recordEntries(tx, ledgerEntries);
      }

      return {
        payoutId: payout.id,
        storeId: payout.storeId,
        periodStart: payout.periodStart,
        periodEnd: payout.periodEnd,
        grossSalesCents: payout.grossSalesCents,
        refundDeductionsCents: payout.refundDeductionsCents,
        netSalesCents: payout.netSalesCents,
        commissionBps: payout.commissionBps,
        commissionCents: payout.commissionCents,
        amountCents: payout.amountCents,
        carriedForwardCents: payout.carriedForwardCents,
        status: payout.status as SellerPayoutStatus,
        effectKey: payout.effectKey,
      };
    });
  }

  /**
   * Settles all active stores for a given period.
   */
  async settleAllStoresPeriod(input: SettleAllStoresPeriodInput): Promise<SettlementResult[]> {
    const sql = this.getSql();

    const activeStores = (await sql`
      SELECT id FROM stores WHERE status = 'active';
    `) as unknown as Array<{ id: string }>;

    const results: SettlementResult[] = [];
    for (const store of activeStores) {
      const result = await this.settleStorePeriod({
        storeId: store.id,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
      });
      results.push(result);
    }

    return results;
  }
}

export const settlementService = new SettlementService();
