-- db/migrations/0017-fulfillment.sql - Seller fulfillment transitions and event ledger (T056).
-- Reviewed SQL.
--
-- Invariants:
-- 1. Orders fulfillment status supports partial transitions: 'PENDING', 'PACKED', 'PARTIALLY_SHIPPED', 'SHIPPED', 'PARTIALLY_DELIVERED', 'DELIVERED', 'CANCELLED'.
-- 2. Seller orders track carrier and tracking number upon dispatch.
-- 3. Fulfillment events ledger records every transition with actor, status, and metadata.
-- 4. Multi-tenancy integrity: fulfillment_events is strictly bound to (store_id, seller_order_id).

-- 1. Expand orders fulfillment_status check constraint to support PARTIALLY_SHIPPED and PARTIALLY_DELIVERED
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_fulfillment_status_check";
ALTER TABLE "orders" ADD CONSTRAINT "orders_fulfillment_status_check"
  CHECK ("fulfillment_status" IN ('PENDING', 'PACKED', 'PARTIALLY_SHIPPED', 'SHIPPED', 'PARTIALLY_DELIVERED', 'DELIVERED', 'CANCELLED'));

-- 2. Add tracking_ref, carrier, shipped_at, delivered_at to seller_orders
ALTER TABLE "seller_orders"
  ADD COLUMN IF NOT EXISTS "tracking_ref" text,
  ADD COLUMN IF NOT EXISTS "carrier" text,
  ADD COLUMN IF NOT EXISTS "shipped_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "delivered_at" timestamptz;

-- 3. Create fulfillment_events ledger table
CREATE TABLE IF NOT EXISTS "fulfillment_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "order_id" uuid NOT NULL REFERENCES "orders"("id") ON DELETE RESTRICT,
  "seller_order_id" uuid NOT NULL,
  "store_id" uuid NOT NULL REFERENCES "stores"("id") ON DELETE RESTRICT,
  "from_status" text NOT NULL,
  "to_status" text NOT NULL,
  "tracking_ref" text,
  "carrier" text,
  "actor_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "fulfillment_events_seller_order_fk"
    FOREIGN KEY ("store_id", "seller_order_id")
    REFERENCES "seller_orders"("store_id", "id") ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS "fulfillment_events_order_id_idx"
  ON "fulfillment_events" ("order_id");

CREATE INDEX IF NOT EXISTS "fulfillment_events_seller_order_id_idx"
  ON "fulfillment_events" ("seller_order_id");

CREATE INDEX IF NOT EXISTS "fulfillment_events_store_created_at_idx"
  ON "fulfillment_events" ("store_id", "created_at" DESC);

COMMENT ON TABLE "fulfillment_events" IS 'T056 immutable audit ledger of seller fulfillment state transitions';
