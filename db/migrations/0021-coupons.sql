-- 0021-coupons.sql
-- Scoped coupon definitions, limits, holds, and atomic redemptions (OR-9 / T063).

CREATE TABLE IF NOT EXISTS "coupons" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "store_id" UUID REFERENCES "stores"("id") ON DELETE CASCADE,
  "code" VARCHAR(64) NOT NULL,
  "kind" VARCHAR(16) NOT NULL CHECK ("kind" IN ('PERCENT', 'FIXED')),
  "value" INTEGER NOT NULL CHECK ("value" > 0),
  "starts_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "ends_at" TIMESTAMPTZ NOT NULL,
  "global_limit" INTEGER NOT NULL DEFAULT 0 CHECK ("global_limit" >= 0),
  "per_user_limit" INTEGER NOT NULL DEFAULT 1 CHECK ("per_user_limit" > 0),
  "held_count" INTEGER NOT NULL DEFAULT 0 CHECK ("held_count" >= 0),
  "redeemed_count" INTEGER NOT NULL DEFAULT 0 CHECK ("redeemed_count" >= 0),
  "status" VARCHAR(16) NOT NULL DEFAULT 'active' CHECK ("status" IN ('active', 'disabled')),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "ck_coupons_percent_cap" CHECK ("kind" != 'PERCENT' OR "value" <= 100),
  CONSTRAINT "ck_coupons_validity_window" CHECK ("ends_at" >= "starts_at")
);

-- Normalized uppercase unique codes per scope
CREATE UNIQUE INDEX IF NOT EXISTS "idx_coupons_store_code"
  ON "coupons" ("store_id", UPPER("code"))
  WHERE "store_id" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "idx_coupons_global_code"
  ON "coupons" (UPPER("code"))
  WHERE "store_id" IS NULL;

CREATE INDEX IF NOT EXISTS "idx_coupons_status_ends_at"
  ON "coupons" ("status", "ends_at");

-- Composite PK per-user counters to prevent concurrent oversubscription
CREATE TABLE IF NOT EXISTS "coupon_user_counters" (
  "coupon_id" UUID NOT NULL REFERENCES "coupons"("id") ON DELETE CASCADE,
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "held_count" INTEGER NOT NULL DEFAULT 0 CHECK ("held_count" >= 0),
  "redeemed_count" INTEGER NOT NULL DEFAULT 0 CHECK ("redeemed_count" >= 0),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("coupon_id", "user_id")
);

-- Hold and redemption lifecycle per order
CREATE TABLE IF NOT EXISTS "coupon_uses" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "coupon_id" UUID NOT NULL REFERENCES "coupons"("id") ON DELETE CASCADE,
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "order_id" UUID NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
  "status" VARCHAR(16) NOT NULL DEFAULT 'HELD' CHECK ("status" IN ('HELD', 'REDEEMED', 'RELEASED')),
  "discount_cents" INTEGER NOT NULL DEFAULT 0 CHECK ("discount_cents" >= 0),
  "expires_at" TIMESTAMPTZ NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "uq_coupon_order" UNIQUE ("coupon_id", "order_id")
);

CREATE INDEX IF NOT EXISTS "idx_coupon_uses_user" ON "coupon_uses" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_coupon_uses_order" ON "coupon_uses" ("order_id");
CREATE INDEX IF NOT EXISTS "idx_coupon_uses_status_expires" ON "coupon_uses" ("status", "expires_at");
