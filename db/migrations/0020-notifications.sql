-- T061: Invoices and notification deliveries migration.
-- Reviewed SQL.
--
-- Invariants:
-- 1. invoices records immutable metadata for generated PDF documents stored in MinIO/S3.
-- 2. notification_deliveries records simulated customer communications (email/SMS/in-app) with UNIQUE effect_key ensuring idempotent delivery.
-- 3. Invoices are strictly scoped to user_id (and order_id).
-- 4. Retries do not duplicate records or external side effects.

CREATE TABLE IF NOT EXISTS "invoices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "order_id" uuid NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "invoice_number" text NOT NULL UNIQUE,
  "storage_key" text NOT NULL,
  "total_cents" bigint NOT NULL CHECK ("total_cents" >= 0),
  "currency" text NOT NULL DEFAULT 'USD',
  "status" text NOT NULL DEFAULT 'GENERATED'
    CHECK ("status" IN ('PENDING', 'GENERATED', 'FAILED')),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "invoices_order_unique" UNIQUE ("order_id")
);

CREATE INDEX IF NOT EXISTS "invoices_order_id_idx"
  ON "invoices" ("order_id");

CREATE INDEX IF NOT EXISTS "invoices_user_id_idx"
  ON "invoices" ("user_id", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "notification_deliveries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "effect_key" text NOT NULL UNIQUE,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "channel" text NOT NULL
    CHECK ("channel" IN ('EMAIL', 'SMS', 'IN_APP')),
  "template" text NOT NULL,
  "recipient" text NOT NULL,
  "status" text NOT NULL DEFAULT 'DELIVERED'
    CHECK ("status" IN ('PENDING', 'DELIVERED', 'FAILED')),
  "attempts" integer NOT NULL DEFAULT 1 CHECK ("attempts" >= 1),
  "provider_ref" text,
  "payload" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "notification_deliveries_user_id_idx"
  ON "notification_deliveries" ("user_id", "created_at" DESC)
  WHERE "user_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "notification_deliveries_effect_key_idx"
  ON "notification_deliveries" ("effect_key");

COMMENT ON TABLE "invoices" IS 'T061 customer invoices generated from paid orders and stored in MinIO';
COMMENT ON TABLE "notification_deliveries" IS 'T061 delivery sink ledger with idempotent effect keys';
