-- 0022-reviews.sql
-- Verified purchaser reviews with unique constraints and rating rollups (RV-1, RV-2 / T064).

CREATE TABLE IF NOT EXISTS "reviews" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "product_id" UUID NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "order_item_id" UUID REFERENCES "order_items"("id") ON DELETE SET NULL,
  "rating" INTEGER NOT NULL CHECK ("rating" >= 1 AND "rating" <= 5),
  "body" TEXT NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'published' CHECK ("status" IN ('published', 'hidden', 'flagged')),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "uq_reviews_product_user" UNIQUE ("product_id", "user_id")
);

CREATE INDEX IF NOT EXISTS "idx_reviews_product_created"
  ON "reviews" ("product_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_reviews_user"
  ON "reviews" ("user_id");
