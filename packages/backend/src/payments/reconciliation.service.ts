// @shopscale/backend/payments/reconciliation.service - Payment outcome reconciliation service (T052).
// Invariants:
// 1. Scans orders/payment attempts in PENDING status older than a threshold (default: 10 minutes).
// 2. Queries payment provider by effectKey to determine canonical gateway status.
// 3. CAPTURED / SUCCEEDED: completes order via OrderCompletionService and marks attempt PAID.
// 4. NOT_FOUND / FAILED: cancels order via OrderCompletionService and marks attempt FAILED.
// 5. Network errors: preserves state and allows subsequent scheduled runs to retry.

import type { Sql } from 'postgres';
import { getDb } from '../db/client.js';
import { orderCompletionService, type OrderCompletionService } from '../commerce/order-completion.js';

export interface ReconcileOptions {
  batchSize?: number;
  olderThanMs?: number; // default: 10 minutes (600_000ms)
}

export interface ReconcileResult {
  scannedCount: number;
  resolvedPaid: number;
  resolvedCancelled: number;
  errorsCount: number;
}

export interface PaymentReconciliationServiceOptions {
  mockPaymentsUrl?: string;
  fetchFn?: typeof fetch;
  orderCompletion?: OrderCompletionService;
  logger?: {
    info(msg: string, ...args: unknown[]): void;
    warn(msg: string, ...args: unknown[]): void;
    error(msg: string, ...args: unknown[]): void;
  };
}

interface StaleAttemptDbRow {
  id: string;
  order_id: string;
  effect_key: string;
  amount_cents: number;
  currency: string;
  status: string;
}

export class PaymentReconciliationService {
  private readonly mockPaymentsUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly orderCompletion: OrderCompletionService;
  private readonly logger: NonNullable<PaymentReconciliationServiceOptions['logger']>;

  constructor(
    private readonly explicitSql?: Sql,
    options?: PaymentReconciliationServiceOptions,
  ) {
    this.mockPaymentsUrl =
      options?.mockPaymentsUrl ??
      process.env['MOCK_PAYMENTS_BASE_URL'] ??
      'http://localhost:3005';
    this.fetchFn = options?.fetchFn ?? globalThis.fetch;
    this.orderCompletion = options?.orderCompletion ?? orderCompletionService;
    this.logger = options?.logger ?? {
      info: () => {},
      warn: () => {},
      error: () => {},
    };
  }

  private getSql(): Sql {
    return this.explicitSql ?? getDb();
  }

  async reconcileStalePaymentAttempts(options?: ReconcileOptions): Promise<ReconcileResult> {
    const sql = this.getSql();
    const batchSize = options?.batchSize ?? 50;
    const olderThanMs = options?.olderThanMs ?? 600_000; // 10 minutes default

    const attempts = (await sql`
      SELECT
        pa.id,
        pa.order_id,
        pa.effect_key,
        pa.amount_cents,
        pa.currency,
        pa.status
      FROM payment_attempts pa
      JOIN orders o ON o.id = pa.order_id
      WHERE pa.status = 'PENDING'
        AND o.payment_status = 'PENDING'
        AND pa.created_at <= NOW() - (${olderThanMs} || ' milliseconds')::interval
      ORDER BY pa.created_at ASC
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    `) as unknown as StaleAttemptDbRow[];

    if (attempts.length === 0) {
      return {
        scannedCount: 0,
        resolvedPaid: 0,
        resolvedCancelled: 0,
        errorsCount: 0,
      };
    }

    this.logger.info(`Reconciling ${attempts.length} stale pending payment attempts...`);

    let resolvedPaid = 0;
    let resolvedCancelled = 0;
    let errorsCount = 0;

    for (const attempt of attempts) {
      const targetUrl = `${this.mockPaymentsUrl}/mock-payments/charges/${encodeURIComponent(attempt.effect_key)}`;

      try {
        const res = await this.fetchFn(targetUrl, {
          method: 'GET',
          headers: {
            accept: 'application/json',
          },
        });

        if (res.status === 200) {
          const data = (await res.json()) as {
            status: 'SUCCEEDED' | 'FAILED' | 'PENDING';
            providerRef?: string;
            amountCents?: string;
          };

          if (data.status === 'SUCCEEDED') {
            await this.orderCompletion.handlePaymentObserved({
              aggregateId: attempt.order_id,
              payload: {
                status: 'PAID',
                type: 'payment.succeeded',
                effectKey: attempt.effect_key,
                providerRef: data.providerRef ?? 'reconciled-charge',
                amountCents: data.amountCents ?? String(attempt.amount_cents),
              },
              correlationId: attempt.effect_key,
            });

            await sql`
              UPDATE payment_attempts
              SET status = 'PAID',
                  provider_ref = COALESCE(${data.providerRef ?? null}, provider_ref),
                  updated_at = NOW()
              WHERE id = ${attempt.id}
            `;
            resolvedPaid += 1;
          } else if (data.status === 'FAILED') {
            await this.orderCompletion.handlePaymentObserved({
              aggregateId: attempt.order_id,
              payload: {
                status: 'FAILED',
                type: 'payment.failed',
                effectKey: attempt.effect_key,
              },
              correlationId: attempt.effect_key,
            });

            await sql`
              UPDATE payment_attempts
              SET status = 'FAILED',
                  updated_at = NOW()
              WHERE id = ${attempt.id}
            `;
            resolvedCancelled += 1;
          }
        } else if (res.status === 404) {
          // Attempt not found in payment provider ledger: mark abandoned and cancel order
          await this.orderCompletion.handlePaymentObserved({
            aggregateId: attempt.order_id,
            payload: {
              status: 'FAILED',
              type: 'payment.failed',
              effectKey: attempt.effect_key,
            },
            correlationId: attempt.effect_key,
          });

          await sql`
            UPDATE payment_attempts
            SET status = 'FAILED',
                updated_at = NOW()
            WHERE id = ${attempt.id}
          `;
          resolvedCancelled += 1;
        } else {
          this.logger.warn(`Provider returned HTTP ${res.status} for effectKey ${attempt.effect_key}`);
          errorsCount += 1;
        }
      } catch (err) {
        this.logger.error(`Error querying provider for effectKey ${attempt.effect_key}:`, err);
        errorsCount += 1;
      }
    }

    return {
      scannedCount: attempts.length,
      resolvedPaid,
      resolvedCancelled,
      errorsCount,
    };
  }
}

export const paymentReconciliationService = new PaymentReconciliationService();
