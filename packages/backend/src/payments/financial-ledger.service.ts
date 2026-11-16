// @shopscale/backend/payments/financial-ledger.service - Double-entry financial accounting ledger (T060, DEC-012).
// Invariants:
// 1. Immutable append-only ledger: financial_entries records are never updated or deleted.
// 2. Exact balance enforcement: SUM(debits) === SUM(credits) on every recorded operation.
// 3. Supported accounts: customer_receivable, seller_payable, platform_commission, payment_gateway_clearing.
// 4. Integer cents arithmetic prevents rounding drift or lost transactions.

import type { Sql, TransactionSql } from 'postgres';
import { getDb } from '../db/client.js';
import type { FinancialAccount, FinancialEntryRow } from './schema.js';
import { FINANCIAL_ACCOUNTS } from './schema.js';
import { UnbalancedLedgerError } from './errors.js';

export type SqlOrTx = Sql | TransactionSql;

export interface FinancialEntryInput {
  operationKey: string;
  orderId?: string | null | undefined;
  payoutId?: string | null | undefined;
  refundId?: string | null | undefined;
  storeId?: string | null | undefined;
  account: FinancialAccount;
  debitCents: number;
  creditCents: number;
}

export class FinancialLedgerService {
  constructor(private readonly explicitSql?: Sql) {}

  private getSql(): Sql {
    return this.explicitSql ?? getDb();
  }

  /**
   * Asserts that a batch of double-entry financial entries satisfies zero-sum ledger balance.
   * Throws UnbalancedLedgerError if SUM(debits) !== SUM(credits).
   */
  assertBalanced(entries: FinancialEntryInput[]): void {
    if (entries.length < 2) {
      throw new UnbalancedLedgerError(
        entries.reduce((s, e) => s + e.debitCents, 0),
        entries.reduce((s, e) => s + e.creditCents, 0),
      );
    }

    let totalDebits = 0;
    let totalCredits = 0;

    for (const entry of entries) {
      if (entry.debitCents < 0 || entry.creditCents < 0) {
        throw new Error('Debit and credit amounts must be non-negative integers.');
      }
      if (entry.debitCents === 0 && entry.creditCents === 0) {
        throw new Error('Every financial entry must have a strictly positive debit or credit amount.');
      }
      if (!FINANCIAL_ACCOUNTS.includes(entry.account)) {
        throw new Error(`Invalid financial account '${entry.account}'.`);
      }

      totalDebits += entry.debitCents;
      totalCredits += entry.creditCents;
    }

    if (totalDebits !== totalCredits) {
      throw new UnbalancedLedgerError(totalDebits, totalCredits);
    }
  }

  /**
   * Records a balanced set of double-entry financial entries into the append-only ledger.
   */
  async recordEntries(
    txOrSql: SqlOrTx | undefined,
    entries: FinancialEntryInput[],
  ): Promise<FinancialEntryRow[]> {
    this.assertBalanced(entries);

    const sql = txOrSql ?? this.getSql();

    const insertedRows: FinancialEntryRow[] = [];

    for (const entry of entries) {
      const [row] = (await sql`
        INSERT INTO "financial_entries" (
          "operation_key",
          "order_id",
          "payout_id",
          "refund_id",
          "store_id",
          "account",
          "debit_cents",
          "credit_cents"
        ) VALUES (
          ${entry.operationKey},
          ${entry.orderId ?? null},
          ${entry.payoutId ?? null},
          ${entry.refundId ?? null},
          ${entry.storeId ?? null},
          ${entry.account},
          ${entry.debitCents},
          ${entry.creditCents}
        )
        RETURNING
          id,
          operation_key,
          order_id,
          payout_id,
          refund_id,
          store_id,
          account,
          debit_cents,
          credit_cents,
          created_at;
      `) as unknown as FinancialEntryRow[];

      if (row) {
        insertedRows.push(row);
      }
    }

    return insertedRows;
  }

  /**
   * Queries the ledger balance for a given order, verifying that all historical entries balance.
   */
  async getOrderLedgerSummary(orderId: string): Promise<{
    totalDebits: number;
    totalCredits: number;
    isBalanced: boolean;
    entriesCount: number;
  }> {
    const sql = this.getSql();

    const [summary] = (await sql`
      SELECT
        COALESCE(SUM(debit_cents), 0)::text AS total_debits,
        COALESCE(SUM(credit_cents), 0)::text AS total_credits,
        COUNT(*)::int AS entries_count
      FROM "financial_entries"
      WHERE "order_id" = ${orderId};
    `) as unknown as Array<{
      total_debits: string;
      total_credits: string;
      entries_count: number;
    }>;

    const debits = parseInt(summary?.total_debits ?? '0', 10);
    const credits = parseInt(summary?.total_credits ?? '0', 10);

    return {
      totalDebits: debits,
      totalCredits: credits,
      isBalanced: debits === credits,
      entriesCount: summary?.entries_count ?? 0,
    };
  }

  /**
   * Aggregates total debits and credits for an account (and optional storeId).
   */
  async getAccountSummary(
    account: FinancialAccount,
    storeId?: string,
  ): Promise<{
    totalDebits: number;
    totalCredits: number;
    netBalance: number;
  }> {
    const sql = this.getSql();

    const [summary] = (await sql`
      SELECT
        COALESCE(SUM(debit_cents), 0)::text AS total_debits,
        COALESCE(SUM(credit_cents), 0)::text AS total_credits
      FROM "financial_entries"
      WHERE "account" = ${account}
        ${storeId ? sql`AND "store_id" = ${storeId}` : sql``};
    `) as unknown as Array<{
      total_debits: string;
      total_credits: string;
    }>;

    const debits = parseInt(summary?.total_debits ?? '0', 10);
    const credits = parseInt(summary?.total_credits ?? '0', 10);

    return {
      totalDebits: debits,
      totalCredits: credits,
      netBalance: debits - credits,
    };
  }
}

export const financialLedgerService = new FinancialLedgerService();
