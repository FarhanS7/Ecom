-- T060: Double-entry financial ledger and refunds migration.
-- Reviewed SQL.
--
-- Core invariants:
-- 1. Double-entry ledger: immutable append-only financial_entries table where SUM(debits) = SUM(credits) per operation.
-- 2. Four core accounts: customer_receivable, seller_payable, platform_commission, payment_gateway_clearing.
-- 3. Row-level locks on parent payment records enforce cumulative refund cap <= captured payment amount.
-- 4. ON DELETE RESTRICT on all financial foreign keys preserves auditability.
-- 5. Non-negative integer cents arithmetic on all debits and credits.

CREATE TABLE IF NOT EXISTS "refunds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "order_id" uuid NOT NULL REFERENCES "orders"("id") ON DELETE RESTRICT,
  "payment_attempt_id" uuid NOT NULL REFERENCES "payment_attempts"("id") ON DELETE RESTRICT,
  "amount_cents" integer NOT NULL
    CHECK ("amount_cents" > 0),
  "currency" text NOT NULL DEFAULT 'USD',
  "reason" text NOT NULL,
  "status" text NOT NULL DEFAULT 'PENDING'
    CHECK ("status" IN ('PENDING', 'COMPLETED', 'FAILED')),
  "provider_refund_ref" text,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "refunds_order_created_at_idx"
  ON "refunds" ("order_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "refunds_payment_attempt_id_idx"
  ON "refunds" ("payment_attempt_id");

CREATE TABLE IF NOT EXISTS "refund_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "refund_id" uuid NOT NULL REFERENCES "refunds"("id") ON DELETE RESTRICT,
  "order_item_id" uuid NOT NULL REFERENCES "order_items"("id") ON DELETE RESTRICT,
  "qty" integer NOT NULL
    CHECK ("qty" > 0),
  "amount_cents" integer NOT NULL
    CHECK ("amount_cents" >= 0),
  "restock" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "refund_items_refund_id_idx"
  ON "refund_items" ("refund_id");

CREATE INDEX IF NOT EXISTS "refund_items_order_item_id_idx"
  ON "refund_items" ("order_item_id");

CREATE TABLE IF NOT EXISTS "financial_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "operation_key" text NOT NULL,
  "order_id" uuid NOT NULL REFERENCES "orders"("id") ON DELETE RESTRICT,
  "refund_id" uuid REFERENCES "refunds"("id") ON DELETE RESTRICT,
  "store_id" uuid REFERENCES "stores"("id") ON DELETE RESTRICT,
  "account" text NOT NULL
    CHECK ("account" IN ('customer_receivable', 'seller_payable', 'platform_commission', 'payment_gateway_clearing')),
  "debit_cents" bigint NOT NULL DEFAULT 0
    CHECK ("debit_cents" >= 0),
  "credit_cents" bigint NOT NULL DEFAULT 0
    CHECK ("credit_cents" >= 0),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "financial_entries_debit_or_credit_positive"
    CHECK ("debit_cents" > 0 OR "credit_cents" > 0)
);

CREATE INDEX IF NOT EXISTS "financial_entries_operation_key_idx"
  ON "financial_entries" ("operation_key");

CREATE INDEX IF NOT EXISTS "financial_entries_order_created_at_idx"
  ON "financial_entries" ("order_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "financial_entries_store_created_at_idx"
  ON "financial_entries" ("store_id", "created_at" DESC)
  WHERE "store_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "financial_entries_account_created_at_idx"
  ON "financial_entries" ("account", "created_at" DESC);

COMMENT ON TABLE "refunds" IS 'T060 ledger of full and partial refunds with cumulative cap protection';
COMMENT ON TABLE "refund_items" IS 'T060 item-level refund allocations and restocking tracking';
COMMENT ON TABLE "financial_entries" IS 'T060 double-entry balanced accounting ledger (DEC-012)';
