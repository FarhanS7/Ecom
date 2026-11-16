-- T042 cart merges migration: cart_merges table.
-- Reviewed SQL.
--
-- Core invariants:
-- 1. UNIQUE(guest_cart_id) prevents duplicate/replay merges at the database boundary.
-- 2. Foreign keys to carts and users.
-- 3. Audit trail of guest-to-customer cart merge receipts.

CREATE TABLE IF NOT EXISTS "cart_merges" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "guest_cart_id" uuid NOT NULL UNIQUE REFERENCES "carts"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "user_cart_id" uuid NOT NULL REFERENCES "carts"("id") ON DELETE CASCADE,
  "channel_key" text NOT NULL,
  "items_merged_count" integer NOT NULL DEFAULT 0,
  "merged_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "cart_merges_user_id_idx" ON "cart_merges" ("user_id");
CREATE INDEX IF NOT EXISTS "cart_merges_guest_cart_id_idx" ON "cart_merges" ("guest_cart_id");

COMMENT ON TABLE "cart_merges" IS 'T042 audit receipts for guest cart consolidation into customer carts with UNIQUE(guest_cart_id) replay protection';
