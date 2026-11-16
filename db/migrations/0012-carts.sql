-- T041 durable channel carts migration: carts and cart_items.
-- Reviewed SQL.
--
-- Core invariants:
-- 1. Exactly one owner type: user_id OR guest_id.
-- 2. channel_key = 'marketplace' OR store UUID matching store_id.
-- 3. Carts are channel-isolated: unique (channel_key, user_id) and unique (channel_key, guest_id).
-- 4. Quantity bounded between 1 and 99 per item.
-- 5. Exactly one row per (cart_id, variant_id).

CREATE TABLE IF NOT EXISTS "carts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "channel_key" text NOT NULL,
  "store_id" uuid REFERENCES "stores"("id") ON DELETE CASCADE,
  "user_id" uuid REFERENCES "users"("id") ON DELETE CASCADE,
  "guest_id" text,
  "currency" text NOT NULL DEFAULT 'usd'
    CHECK (char_length("currency") = 3),
  "version" integer NOT NULL DEFAULT 1
    CHECK ("version" >= 1),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "carts_owner_check"
    CHECK (("user_id" IS NOT NULL AND "guest_id" IS NULL) OR ("user_id" IS NULL AND "guest_id" IS NOT NULL)),
  CONSTRAINT "carts_channel_check"
    CHECK (("channel_key" = 'marketplace' AND "store_id" IS NULL) OR ("store_id" IS NOT NULL AND "channel_key" = "store_id"::text))
);

CREATE UNIQUE INDEX IF NOT EXISTS "carts_channel_user_uniq"
  ON "carts" ("channel_key", "user_id")
  WHERE "user_id" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "carts_channel_guest_uniq"
  ON "carts" ("channel_key", "guest_id")
  WHERE "guest_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "carts_store_id_idx" ON "carts" ("store_id");
CREATE INDEX IF NOT EXISTS "carts_user_id_idx" ON "carts" ("user_id");

CREATE TABLE IF NOT EXISTS "cart_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "cart_id" uuid NOT NULL REFERENCES "carts"("id") ON DELETE CASCADE,
  "variant_id" uuid NOT NULL REFERENCES "product_variants"("id") ON DELETE RESTRICT,
  "quantity" integer NOT NULL
    CHECK ("quantity" > 0 AND "quantity" <= 99),
  "unit_price_cents" bigint NOT NULL
    CHECK ("unit_price_cents" >= 0),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "cart_items_cart_variant_uniq" UNIQUE ("cart_id", "variant_id")
);

CREATE INDEX IF NOT EXISTS "cart_items_cart_id_idx" ON "cart_items" ("cart_id");
CREATE INDEX IF NOT EXISTS "cart_items_variant_id_idx" ON "cart_items" ("variant_id");

COMMENT ON TABLE "carts" IS 'T041 channel-scoped carts with strict user or guest ownership and optimistic versioning';
COMMENT ON TABLE "cart_items" IS 'T041 cart line items with unique variant constraints and quantity ceiling (99)';
