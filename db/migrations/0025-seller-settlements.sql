-- T070: Periodic simulated seller payout settlements and commission accounting migration.
-- Reviewed SQL.
--
-- Core invariants:
-- 1. Immutable seller_payouts ledger tracking net payout calculations per store and period.
-- 2. Idempotency guaranteed by unique effect_key (settlement:{storeId}:{periodStart}:{periodEnd}).
-- 3. Double-entry financial entries link to payout_id with balanced zero-sum debit/credit entries:
--    Debit seller_payable = net_sales_cents
--    Credit platform_commission = commission_cents
--    Credit payment_gateway_clearing = amount_cents (net payout)
-- 4. Negative balances from excessive refunds are carried forward, preventing negative disbursements.

CREATE TABLE IF NOT EXISTS "seller_payouts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "store_id" uuid NOT NULL REFERENCES "stores"("id") ON DELETE RESTRICT,
  "period_start" timestamptz NOT NULL,
  "period_end" timestamptz NOT NULL,
  "gross_sales_cents" bigint NOT NULL DEFAULT 0,
  "refund_deductions_cents" bigint NOT NULL DEFAULT 0,
  "net_sales_cents" bigint NOT NULL DEFAULT 0,
  "commission_bps" integer NOT NULL DEFAULT 1000,
  "commission_cents" bigint NOT NULL DEFAULT 0,
  "amount_cents" bigint NOT NULL DEFAULT 0,
  "carried_forward_cents" bigint NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'COMPLETED'
    CHECK ("status" IN ('PENDING', 'COMPLETED', 'CARRIED_FORWARD', 'FAILED')),
  "effect_key" text NOT NULL UNIQUE,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "seller_payouts_store_created_at_idx"
  ON "seller_payouts" ("store_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "seller_payouts_period_idx"
  ON "seller_payouts" ("store_id", "period_start", "period_end");

-- Update financial_entries to support settlement payout operations
ALTER TABLE "financial_entries" ALTER COLUMN "order_id" DROP NOT NULL;

ALTER TABLE "financial_entries"
  ADD COLUMN IF NOT EXISTS "payout_id" uuid REFERENCES "seller_payouts"("id") ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS "financial_entries_payout_id_idx"
  ON "financial_entries" ("payout_id")
  WHERE "payout_id" IS NOT NULL;

COMMENT ON TABLE "seller_payouts" IS 'T070 periodic simulated seller payout settlements and commission deductions';
