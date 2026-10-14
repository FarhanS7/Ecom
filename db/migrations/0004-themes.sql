-- T016 themes migration: storefront themes and content. Reviewed SQL.
-- store_themes carries APPROVED tokens only (validated JSONB, never raw CSS);
-- logo assets arrive with media work (T035 adds the asset FK then).
-- store_content holds homepage data (featured product IDs validated against
-- the store at write time by catalog work; T016 seeds none).

CREATE TABLE IF NOT EXISTS "store_themes" (
  "store_id" uuid PRIMARY KEY REFERENCES "stores"("id") ON DELETE CASCADE,
  "version" integer NOT NULL DEFAULT 1,
  "approved_tokens" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "store_content" (
  "store_id" uuid PRIMARY KEY REFERENCES "stores"("id") ON DELETE CASCADE,
  "version" integer NOT NULL DEFAULT 1,
  "featured_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "headline" text NULL,
  "socials" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "swatches" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE "store_themes" IS 'T016 validated theme tokens; writes validated in app (T068 UI), reads fall back to defaults';
COMMENT ON TABLE "store_content" IS 'T016 storefront homepage content; product validation at write time';
