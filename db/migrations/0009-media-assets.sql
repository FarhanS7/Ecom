-- 0009-media-assets.sql - Media assets and product images (T035).
-- Invariants:
-- 1. All assets are owned by a store (store_id) and initially quarantined.
-- 2. Once verified by magic bytes, an asset transitions to 'ready'.
-- 3. If validation fails or malicious payload detected, status becomes 'rejected'.
-- 4. product_images links products to ready assets with ordering and primary flag.

CREATE TABLE IF NOT EXISTS "media_assets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "store_id" uuid NOT NULL REFERENCES "stores"("id") ON DELETE CASCADE,
  "object_key" text NOT NULL,
  "filename" text NOT NULL,
  "declared_mime_type" text NOT NULL,
  "detected_mime_type" text,
  "bytes" bigint NOT NULL,
  "status" text NOT NULL DEFAULT 'quarantined'
    CHECK ("status" IN ('quarantined', 'ready', 'rejected')),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "media_assets_object_key_uniq" UNIQUE ("object_key")
);

CREATE INDEX IF NOT EXISTS "media_assets_store_idx" ON "media_assets" ("store_id");
CREATE INDEX IF NOT EXISTS "media_assets_status_idx" ON "media_assets" ("status");

CREATE TABLE IF NOT EXISTS "product_images" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "asset_id" uuid NOT NULL REFERENCES "media_assets"("id") ON DELETE CASCADE,
  "display_order" integer NOT NULL DEFAULT 0,
  "is_primary" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "product_images_product_asset_uniq" UNIQUE ("product_id", "asset_id")
);

CREATE INDEX IF NOT EXISTS "product_images_product_order_idx" ON "product_images" ("product_id", "display_order");
