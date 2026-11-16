-- T029: Transactional Outbox pattern and relay storage.
-- Reviewed SQL.
-- Every domain mutation writes to this table in the same transaction as its business data.
-- Background relay worker claims unpublished rows with SELECT ... FOR UPDATE SKIP LOCKED.

CREATE TABLE IF NOT EXISTS "outbox" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "aggregate_type" text NOT NULL,
  "aggregate_id" uuid NOT NULL,
  "aggregate_version" integer NOT NULL DEFAULT 1
    CHECK ("aggregate_version" >= 1),
  "event_type" text NOT NULL,
  "schema_version" integer NOT NULL DEFAULT 1
    CHECK ("schema_version" >= 1),
  "payload" jsonb NOT NULL,
  "correlation_id" text,
  "causation_id" text,
  "store_id" uuid REFERENCES "stores"("id") ON DELETE SET NULL,
  "occurred_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "published_at" timestamptz,
  "lease_until" timestamptz,
  "attempts" integer NOT NULL DEFAULT 0
    CHECK ("attempts" >= 0)
);

-- Partial index for high-throughput polling of unpublished events.
-- The partial filter (WHERE published_at IS NULL) ensures index size stays small
-- even when outbox accumulates millions of historic published events.
CREATE INDEX IF NOT EXISTS "outbox_unpublished_idx"
  ON "outbox" ("created_at" ASC, "id" ASC)
  WHERE "published_at" IS NULL;

-- Index for aggregate version ordering and projection debugging.
CREATE INDEX IF NOT EXISTS "outbox_aggregate_idx"
  ON "outbox" ("aggregate_type", "aggregate_id", "aggregate_version");

COMMENT ON TABLE "outbox" IS 'T029 Transactional Outbox: atomic event publication with SKIP LOCKED relay';
