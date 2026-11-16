-- T046: Orders, seller suborders, order items, and payment attempts migration.
-- Reviewed SQL.
--
-- Core invariants:
-- 1. Unified customer checkout: parent order references user and captures immutable address snapshot.
-- 2. Immediate vendor splitting (DEC-011): child seller_orders created atomically per vendor.
-- 3. Composite foreign key: order_items strictly bound to (store_id, seller_order_id).
-- 4. ON DELETE RESTRICT on all financial and fulfillment tables preserves audit trail.
-- 5. Integer cents arithmetic and non-negative constraints on all monetary columns.

CREATE TABLE IF NOT EXISTS "orders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "channel_key" text NOT NULL,
  "store_id" uuid REFERENCES "stores"("id") ON DELETE RESTRICT,
  "payment_status" text NOT NULL DEFAULT 'PENDING'
    CHECK ("payment_status" IN ('PENDING', 'PAID', 'FAILED', 'REFUNDED')),
  "fulfillment_status" text NOT NULL DEFAULT 'PENDING'
    CHECK ("fulfillment_status" IN ('PENDING', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED')),
  "subtotal_cents" integer NOT NULL
    CHECK ("subtotal_cents" >= 0),
  "shipping_cents" integer NOT NULL
    CHECK ("shipping_cents" >= 0),
  "discount_cents" integer NOT NULL DEFAULT 0
    CHECK ("discount_cents" >= 0),
  "total_cents" integer NOT NULL
    CHECK ("total_cents" >= 0),
  "currency" text NOT NULL DEFAULT 'USD',
  "address_snapshot" jsonb NOT NULL,
  "coupon_code" text,
  "expires_at" timestamptz,
  "version" integer NOT NULL DEFAULT 1
    CHECK ("version" >= 1),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "orders_user_created_at_idx"
  ON "orders" ("user_id", "created_at" DESC, "id" DESC);

CREATE INDEX IF NOT EXISTS "orders_store_created_at_idx"
  ON "orders" ("store_id", "created_at" DESC, "id" DESC)
  WHERE "store_id" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "seller_orders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "order_id" uuid NOT NULL REFERENCES "orders"("id") ON DELETE RESTRICT,
  "store_id" uuid NOT NULL REFERENCES "stores"("id") ON DELETE RESTRICT,
  "fulfillment_status" text NOT NULL DEFAULT 'PENDING'
    CHECK ("fulfillment_status" IN ('PENDING', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED')),
  "subtotal_cents" integer NOT NULL
    CHECK ("subtotal_cents" >= 0),
  "shipping_cents" integer NOT NULL
    CHECK ("shipping_cents" >= 0),
  "discount_cents" integer NOT NULL DEFAULT 0
    CHECK ("discount_cents" >= 0),
  "total_cents" integer NOT NULL
    CHECK ("total_cents" >= 0),
  "commission_bps_snapshot" integer NOT NULL DEFAULT 1000
    CHECK ("commission_bps_snapshot" >= 0),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "seller_orders_order_store_uniq" UNIQUE ("order_id", "store_id"),
  CONSTRAINT "seller_orders_store_id_uniq" UNIQUE ("store_id", "id")
);

CREATE INDEX IF NOT EXISTS "seller_orders_store_created_at_idx"
  ON "seller_orders" ("store_id", "created_at" DESC, "id" DESC);

CREATE INDEX IF NOT EXISTS "seller_orders_order_id_idx"
  ON "seller_orders" ("order_id");

CREATE TABLE IF NOT EXISTS "order_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "order_id" uuid NOT NULL REFERENCES "orders"("id") ON DELETE RESTRICT,
  "seller_order_id" uuid NOT NULL,
  "store_id" uuid NOT NULL,
  "variant_id" uuid NOT NULL REFERENCES "product_variants"("id") ON DELETE RESTRICT,
  "title_snapshot" text NOT NULL,
  "sku_snapshot" text NOT NULL,
  "qty" integer NOT NULL
    CHECK ("qty" > 0),
  "unit_price_cents" integer NOT NULL
    CHECK ("unit_price_cents" >= 0),
  "total_cents" integer NOT NULL
    CHECK ("total_cents" >= 0),
  "discount_cents" integer NOT NULL DEFAULT 0
    CHECK ("discount_cents" >= 0),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "order_items_seller_order_fk"
    FOREIGN KEY ("store_id", "seller_order_id")
    REFERENCES "seller_orders"("store_id", "id") ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS "order_items_store_created_at_idx"
  ON "order_items" ("store_id", "created_at" DESC, "id" DESC);

CREATE INDEX IF NOT EXISTS "order_items_order_id_idx"
  ON "order_items" ("order_id");

CREATE INDEX IF NOT EXISTS "order_items_seller_order_id_idx"
  ON "order_items" ("seller_order_id");

CREATE INDEX IF NOT EXISTS "order_items_variant_id_idx"
  ON "order_items" ("variant_id");

CREATE TABLE IF NOT EXISTS "payment_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "order_id" uuid NOT NULL REFERENCES "orders"("id") ON DELETE RESTRICT,
  "provider" text NOT NULL DEFAULT 'mock',
  "effect_key" text NOT NULL,
  "provider_ref" text,
  "amount_cents" integer NOT NULL
    CHECK ("amount_cents" >= 0),
  "currency" text NOT NULL DEFAULT 'USD',
  "status" text NOT NULL DEFAULT 'PENDING'
    CHECK ("status" IN ('PENDING', 'PAID', 'FAILED', 'REFUNDED')),
  "error_code" text,
  "error_message" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "payment_attempts_provider_effect_key_uniq" UNIQUE ("provider", "effect_key")
);

CREATE UNIQUE INDEX IF NOT EXISTS "payment_attempts_provider_ref_uniq"
  ON "payment_attempts" ("provider", "provider_ref")
  WHERE "provider_ref" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "payment_attempts_order_id_idx"
  ON "payment_attempts" ("order_id");

COMMENT ON TABLE "orders" IS 'T046 parent customer order with channel, payment and fulfillment states';
COMMENT ON TABLE "seller_orders" IS 'T046 child suborders partitioned per seller vendor for independent fulfillment';
COMMENT ON TABLE "order_items" IS 'T046 immutable historical snapshots of purchased line items';
COMMENT ON TABLE "payment_attempts" IS 'T046 payment attempts with idempotency effect keys and gateway status';
