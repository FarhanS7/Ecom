-- T030: Search projection and consumer deduplication tables.
-- Reviewed SQL.
-- consumer_receipts prevents duplicate side effects from replayed BullMQ events.
-- search_documents provides high-throughput FTS and facet querying without hitting products table.

CREATE EXTENSION IF NOT EXISTS "pg_trgm";

CREATE TABLE IF NOT EXISTS "consumer_receipts" (
  "consumer_name" text NOT NULL,
  "event_id" uuid NOT NULL,
  "processed_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("consumer_name", "event_id")
);

CREATE INDEX IF NOT EXISTS "consumer_receipts_processed_at_idx"
  ON "consumer_receipts" ("processed_at");

CREATE TABLE IF NOT EXISTS "search_documents" (
  "product_id" uuid PRIMARY KEY REFERENCES "products"("id") ON DELETE CASCADE,
  "store_id" uuid NOT NULL REFERENCES "stores"("id") ON DELETE CASCADE,
  "source_version" integer NOT NULL DEFAULT 1
    CHECK ("source_version" >= 1),
  "title" text NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "brand" text,
  "category_id" uuid REFERENCES "categories"("id") ON DELETE SET NULL,
  "category_path" text NOT NULL DEFAULT '/',
  "attributes" jsonb NOT NULL DEFAULT '{}',
  "min_price_cents" bigint NOT NULL DEFAULT 0
    CHECK ("min_price_cents" >= 0),
  "currency" text NOT NULL DEFAULT 'usd'
    CHECK (char_length("currency") = 3),
  "marketplace_enabled" boolean NOT NULL DEFAULT false,
  "store_enabled" boolean NOT NULL DEFAULT false,
  "visibility" boolean NOT NULL DEFAULT false,
  "available" boolean NOT NULL DEFAULT true,
  "rating_avg" numeric(3,2) NOT NULL DEFAULT 0.00
    CHECK ("rating_avg" >= 0.00 AND "rating_avg" <= 5.00),
  "rating_count" integer NOT NULL DEFAULT 0
    CHECK ("rating_count" >= 0),
  "sales_count" integer NOT NULL DEFAULT 0
    CHECK ("sales_count" >= 0),
  "tsv" tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("brand", '')), 'B') ||
    setweight(to_tsvector('english', coalesce("description", '')), 'C')
  ) STORED,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- Full-text search GIN index on generated English tsvector
CREATE INDEX IF NOT EXISTS "search_documents_tsv_idx"
  ON "search_documents" USING GIN ("tsv");

-- Trigram index for fuzzy typo tolerance and autocomplete substring matching
CREATE INDEX IF NOT EXISTS "search_documents_title_trgm_idx"
  ON "search_documents" USING GIN ("title" gin_trgm_ops);

-- Channel visibility filtered indexes for marketplace and store browse paths
CREATE INDEX IF NOT EXISTS "search_documents_mkt_vis_idx"
  ON "search_documents" ("min_price_cents", "product_id")
  WHERE "visibility" = true AND "marketplace_enabled" = true;

CREATE INDEX IF NOT EXISTS "search_documents_store_vis_idx"
  ON "search_documents" ("store_id", "min_price_cents", "product_id")
  WHERE "visibility" = true AND "store_enabled" = true;

CREATE INDEX IF NOT EXISTS "search_documents_category_path_idx"
  ON "search_documents" ("category_path" text_pattern_ops);

COMMENT ON TABLE "consumer_receipts" IS 'T030 Deduplication ledger for BullMQ consumers; enforces at-most-once domain mutations';
COMMENT ON TABLE "search_documents" IS 'T030 Materialized search projection with FTS tsvector and trigram typo matching';
