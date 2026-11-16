-- T047: Idempotency requests migration.
-- Reviewed SQL.
--
-- Core invariants:
-- 1. Scoped uniqueness: UNIQUE(user_id, operation, channel_key, key).
-- 2. Hash validation: request_hash (SHA-256) detects key reuse with modified payload (409 Conflict).
-- 3. Cached response replay: response_status and response_body JSONB replayed on duplicate requests.
-- 4. Linked order: order_id references parent order on successful checkout.

CREATE TABLE IF NOT EXISTS "idempotency_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "operation" text NOT NULL,
  "channel_key" text NOT NULL,
  "key" text NOT NULL,
  "request_hash" text NOT NULL,
  "status" text NOT NULL DEFAULT 'PROCESSING'
    CHECK ("status" IN ('PROCESSING', 'COMPLETED', 'FAILED')),
  "response_status" integer,
  "response_body" jsonb,
  "order_id" uuid REFERENCES "orders"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "idempotency_requests_user_op_channel_key_uniq"
    UNIQUE ("user_id", "operation", "channel_key", "key")
);

CREATE INDEX IF NOT EXISTS "idempotency_requests_order_id_idx"
  ON "idempotency_requests" ("order_id")
  WHERE "order_id" IS NOT NULL;

COMMENT ON TABLE "idempotency_requests" IS 'T047 idempotency tracking for transactional operations with cached response replay';
