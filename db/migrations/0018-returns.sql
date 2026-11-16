-- db/migrations/0018-returns.sql - Return requests and physical inspection schema (T058).
-- Reviewed SQL.
--
-- Invariants:
-- 1. Returns are tracked per order item with explicit return quantity and reason.
-- 2. Physical inspection statuses: 'PENDING_INSPECTION', 'APPROVED', 'REJECTED'.
-- 3. Composite foreign key preserves store scoping: (store_id, seller_order_id) references seller_orders(store_id, id).
-- 4. Audit traceability: records customer, store, and inspecting staff.

CREATE TABLE IF NOT EXISTS "return_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "order_id" uuid NOT NULL REFERENCES "orders"("id") ON DELETE RESTRICT,
  "seller_order_id" uuid NOT NULL,
  "store_id" uuid NOT NULL REFERENCES "stores"("id") ON DELETE RESTRICT,
  "order_item_id" uuid NOT NULL REFERENCES "order_items"("id") ON DELETE RESTRICT,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "qty" integer NOT NULL
    CHECK ("qty" > 0),
  "reason" text NOT NULL,
  "customer_notes" text,
  "status" text NOT NULL DEFAULT 'PENDING_INSPECTION'
    CHECK ("status" IN ('PENDING_INSPECTION', 'APPROVED', 'REJECTED')),
  "inspection_notes" text,
  "inspected_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "inspected_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "return_requests_seller_order_fk"
    FOREIGN KEY ("store_id", "seller_order_id")
    REFERENCES "seller_orders"("store_id", "id") ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS "return_requests_order_id_idx"
  ON "return_requests" ("order_id");

CREATE INDEX IF NOT EXISTS "return_requests_order_item_id_idx"
  ON "return_requests" ("order_item_id");

CREATE INDEX IF NOT EXISTS "return_requests_store_created_at_idx"
  ON "return_requests" ("store_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "return_requests_user_created_at_idx"
  ON "return_requests" ("user_id", "created_at" DESC);

COMMENT ON TABLE "return_requests" IS 'T058 customer return requests and vendor physical inspection states';
