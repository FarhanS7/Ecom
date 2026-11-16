-- 0010-inventory.sql - Stock invariants, reservations, and append-only movement ledger (T037).
-- Invariants:
-- 1. on_hand >= 0 (no negative physical stock).
-- 2. reserved >= 0 AND reserved <= on_hand (cannot reserve more than on-hand stock).
-- 3. available is dynamically derived: on_hand - reserved.
-- 4. stock_movements is append-only with idempotent deduplication via (operation_key, variant_id, reason).
-- 5. stock_reservations tracks cart / checkout locks with expiration time.

CREATE TABLE IF NOT EXISTS "inventory" (
  "variant_id" uuid PRIMARY KEY REFERENCES "product_variants"("id") ON DELETE CASCADE,
  "store_id" uuid NOT NULL REFERENCES "stores"("id") ON DELETE CASCADE,
  "on_hand" integer NOT NULL DEFAULT 0,
  "reserved" integer NOT NULL DEFAULT 0,
  "version" integer NOT NULL DEFAULT 1 CHECK ("version" >= 1),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "inventory_on_hand_non_negative" CHECK ("on_hand" >= 0),
  CONSTRAINT "inventory_reserved_non_negative" CHECK ("reserved" >= 0),
  CONSTRAINT "inventory_reserved_lte_on_hand" CHECK ("reserved" <= "on_hand")
);

CREATE INDEX IF NOT EXISTS "inventory_store_idx" ON "inventory" ("store_id");

CREATE TABLE IF NOT EXISTS "stock_reservations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "cart_id" uuid NOT NULL,
  "variant_id" uuid NOT NULL REFERENCES "product_variants"("id") ON DELETE CASCADE,
  "store_id" uuid NOT NULL REFERENCES "stores"("id") ON DELETE CASCADE,
  "quantity" integer NOT NULL CHECK ("quantity" > 0),
  "expires_at" timestamptz NOT NULL,
  "status" text NOT NULL DEFAULT 'active'
    CHECK ("status" IN ('active', 'released', 'consumed')),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "stock_reservations_cart_idx" ON "stock_reservations" ("cart_id");
CREATE INDEX IF NOT EXISTS "stock_reservations_status_expires_idx" ON "stock_reservations" ("status", "expires_at");
CREATE UNIQUE INDEX IF NOT EXISTS "stock_reservations_cart_variant_active_uniq"
  ON "stock_reservations" ("cart_id", "variant_id")
  WHERE "status" = 'active';

CREATE TABLE IF NOT EXISTS "stock_movements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "store_id" uuid NOT NULL REFERENCES "stores"("id") ON DELETE CASCADE,
  "variant_id" uuid NOT NULL REFERENCES "product_variants"("id") ON DELETE CASCADE,
  "delta_on_hand" integer NOT NULL DEFAULT 0,
  "delta_reserved" integer NOT NULL DEFAULT 0,
  "reason" text NOT NULL
    CHECK ("reason" IN ('initial_stock', 'manual_adjustment', 'reservation_created', 'reservation_released', 'order_fulfillment', 'return_restock')),
  "operation_key" text NOT NULL,
  "ref_id" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "stock_movements_dedup_uniq" UNIQUE ("operation_key", "variant_id", "reason")
);

CREATE INDEX IF NOT EXISTS "stock_movements_variant_idx" ON "stock_movements" ("variant_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "stock_movements_store_idx" ON "stock_movements" ("store_id", "created_at" DESC);
