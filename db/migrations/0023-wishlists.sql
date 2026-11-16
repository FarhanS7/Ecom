-- 0023-wishlists.sql
-- Customer wishlists with foreign keys and compound primary key (REQ-ENG-001 / T065).

CREATE TABLE IF NOT EXISTS "wishlists" (
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "product_id" UUID NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("user_id", "product_id")
);

CREATE INDEX IF NOT EXISTS "idx_wishlists_user_created"
  ON "wishlists" ("user_id", "created_at" DESC);
