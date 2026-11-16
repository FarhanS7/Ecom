// @shopscale/backend/platform/consumer - Consumer deduplication receipt ledger (T030).
// Invariant: Receipts are recorded atomically with consumer side effects in the SAME database transaction.

import type { Queryable } from '../identity/auth.service.js';

export interface ConsumerReceiptPort {
  recordReceipt(tx: Queryable, consumerName: string, eventId: string): Promise<boolean>;
  isProcessed(tx: Queryable, consumerName: string, eventId: string): Promise<boolean>;
}

/**
 * Record a consumer receipt using INSERT ... ON CONFLICT DO NOTHING.
 * Returns true if newly recorded, false if already processed.
 */
export async function recordConsumerReceipt(
  tx: Queryable,
  consumerName: string,
  eventId: string,
): Promise<boolean> {
  const rows = (await tx.unsafe(
    `INSERT INTO "consumer_receipts" ("consumer_name", "event_id")
     VALUES ($1, $2::uuid)
     ON CONFLICT ("consumer_name", "event_id") DO NOTHING
     RETURNING "event_id";`,
    [consumerName, eventId],
  )) as unknown as Array<{ event_id: string }>;

  return rows.length > 0;
}

/**
 * Check whether a receipt already exists.
 */
export async function isConsumerReceiptProcessed(
  tx: Queryable,
  consumerName: string,
  eventId: string,
): Promise<boolean> {
  const rows = (await tx.unsafe(
    `SELECT 1 FROM "consumer_receipts"
     WHERE "consumer_name" = $1 AND "event_id" = $2::uuid
     LIMIT 1;`,
    [consumerName, eventId],
  )) as unknown as unknown[];

  return rows.length > 0;
}

export const consumerReceiptPort: ConsumerReceiptPort = {
  recordReceipt: recordConsumerReceipt,
  isProcessed: isConsumerReceiptProcessed,
};
