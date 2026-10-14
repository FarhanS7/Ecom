-- T019 catalog migration: categories, products, variants, publications.
-- Reviewed SQL. Numbering: T019's task file names `0004-catalog.sql`, but
-- 0004 (themes) and 0005 (addresses) were taken first; actual ordering wins.
--
-- Core invariants (docs/modules/catalog.md):
--   * store scope on every nested row: product_variants carries store_id and
--     a COMPOSITE FK (store_id, product_id) -> products(store_id, id), so a
--     variant can never point at another store's product (DB boundary).
--   * slugs and SKUs are unique WITHIN a store, not globally.
--   * min_price_cents is derived from active variants by service code; the
--     column exists for sort indexes and is not a second editable price.
--   * category cycles are rejected by the T019b service under an advisory
--     lock; the self-loop case (parent = own id) is rejected HERE by CHECK.

CREATE TABLE IF NOT EXISTS "categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "parent_id" uuid REFERENCES "categories"("id") ON DELETE RESTRICT,
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "path" text NOT NULL DEFAULT '/',
  CONSTRAINT "categories_slug_uniq" UNIQUE ("slug"),
  CONSTRAINT "categories_no_self_parent" CHECK ("parent_id" IS NULL OR "parent_id" <> "id")
);
CREATE INDEX IF NOT EXISTS "categories_parent_id_idx" ON "categories" ("parent_id");
CREATE INDEX IF NOT EXISTS "categories_path_idx" ON "categories" ("path");

CREATE TABLE IF NOT EXISTS "products" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "store_id" uuid NOT NULL REFERENCES "stores"("id") ON DELETE RESTRICT,
  "category_id" uuid REFERENCES "categories"("id") ON DELETE RESTRICT,
  "slug" text NOT NULL,
  "title" text NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "brand" text,
  "status" text NOT NULL DEFAULT 'draft'
    CHECK ("status" IN ('draft','active','archived')),
  "attributes" jsonb NOT NULL DEFAULT '{}',
  "min_price_cents" bigint NOT NULL DEFAULT 0
    CHECK ("min_price_cents" >= 0),
  "currency" text NOT NULL DEFAULT 'usd'
    CHECK (char_length("currency") = 3),
  "rating_sum" integer NOT NULL DEFAULT 0
    CHECK ("rating_sum" >= 0),
  "rating_count" integer NOT NULL DEFAULT 0
    CHECK ("rating_count" >= 0),
  "sales_count" integer NOT NULL DEFAULT 0
    CHECK ("sales_count" >= 0),
  "version" integer NOT NULL DEFAULT 1
    CHECK ("version" >= 1),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  -- Scoped-unique pair: lets variants FK (store_id, product_id) and keeps
  -- per-store slug isolation (same slug may exist in another store).
  CONSTRAINT "products_store_id_id_uniq" UNIQUE ("store_id","id"),
  CONSTRAINT "products_store_slug_uniq" UNIQUE ("store_id","slug")
);

-- Index plan (data-model "Index and migration plan"): store newest-first
-- listing, category price band, and category popularity (active rows only).
CREATE INDEX IF NOT EXISTS "products_store_created_idx"
  ON "products" ("store_id","created_at" DESC,"id" DESC);
CREATE INDEX IF NOT EXISTS "products_category_price_idx"
  ON "products" ("category_id","min_price_cents","id");
CREATE INDEX IF NOT EXISTS "products_category_sales_idx"
  ON "products" ("category_id","sales_count" DESC,"id" DESC)
  WHERE "status" = 'active';

CREATE TABLE IF NOT EXISTS "product_variants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "product_id" uuid NOT NULL,
  "store_id" uuid NOT NULL,
  "sku" text NOT NULL,
  "price_cents" bigint NOT NULL
    CHECK ("price_cents" >= 0),
  "attributes" jsonb NOT NULL DEFAULT '{}',
  "status" text NOT NULL DEFAULT 'active'
    CHECK ("status" IN ('active','inactive')),
  -- The composite FK is the cross-store rejection boundary.
  CONSTRAINT "product_variants_product_fk"
    FOREIGN KEY ("store_id","product_id")
    REFERENCES "products"("store_id","id") ON DELETE RESTRICT,
  CONSTRAINT "product_variants_store_id_id_uniq" UNIQUE ("store_id","id"),
  CONSTRAINT "product_variants_store_sku_uniq" UNIQUE ("store_id","sku")
);
CREATE INDEX IF NOT EXISTS "product_variants_product_id_idx" ON "product_variants" ("product_id");

-- Publication flags are INDEPENDENT (module spec): unlisting from the
-- marketplace keeps store visibility when store_enabled stays true.
CREATE TABLE IF NOT EXISTS "product_publications" (
  "product_id" uuid PRIMARY KEY REFERENCES "products"("id") ON DELETE CASCADE,
  "marketplace_enabled" boolean NOT NULL DEFAULT false,
  "store_enabled" boolean NOT NULL DEFAULT false,
  "published_at" timestamptz
);

COMMENT ON TABLE "products" IS 'T019 scoped catalog; min_price_cents derived from active variants, never a second editable price';
COMMENT ON TABLE "product_variants" IS 'T019 composite FK (store_id,product_id) rejects cross-store variants at the DB boundary';
COMMENT ON TABLE "product_publications" IS 'T019 marketplace and store visibility are independent flags';
