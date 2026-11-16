-- Migration 0027: Declarative Table Partitioning Experiment (TASK-082, PRD 8.2).
-- Demonstrates range partitioning by month on high-volume append-only audit_logs.
-- Invariant: PostgreSQL composite PK requires the partition key ("id", "created_at").

CREATE TABLE IF NOT EXISTS "audit_logs_partitioned" (
  "id" uuid DEFAULT gen_random_uuid(),
  "actor_id" uuid NULL,
  "store_id" uuid NULL,
  "action" text NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" text NOT NULL,
  "redacted_before" jsonb NULL,
  "redacted_after" jsonb NULL,
  "request_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("id", "created_at")
) PARTITION BY RANGE ("created_at");

CREATE INDEX IF NOT EXISTS "audit_logs_part_store_created_idx"
  ON "audit_logs_partitioned" ("store_id", "created_at" DESC);

-- Pre-created monthly partitions for 2026
CREATE TABLE IF NOT EXISTS "audit_logs_y2026m01" PARTITION OF "audit_logs_partitioned"
  FOR VALUES FROM ('2026-01-01 00:00:00+00') TO ('2026-02-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS "audit_logs_y2026m02" PARTITION OF "audit_logs_partitioned"
  FOR VALUES FROM ('2026-02-01 00:00:00+00') TO ('2026-03-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS "audit_logs_y2026m03" PARTITION OF "audit_logs_partitioned"
  FOR VALUES FROM ('2026-03-01 00:00:00+00') TO ('2026-04-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS "audit_logs_y2026m04" PARTITION OF "audit_logs_partitioned"
  FOR VALUES FROM ('2026-04-01 00:00:00+00') TO ('2026-05-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS "audit_logs_y2026m05" PARTITION OF "audit_logs_partitioned"
  FOR VALUES FROM ('2026-05-01 00:00:00+00') TO ('2026-06-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS "audit_logs_y2026m06" PARTITION OF "audit_logs_partitioned"
  FOR VALUES FROM ('2026-06-01 00:00:00+00') TO ('2026-07-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS "audit_logs_y2026m07" PARTITION OF "audit_logs_partitioned"
  FOR VALUES FROM ('2026-07-01 00:00:00+00') TO ('2026-08-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS "audit_logs_y2026m08" PARTITION OF "audit_logs_partitioned"
  FOR VALUES FROM ('2026-08-01 00:00:00+00') TO ('2026-09-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS "audit_logs_y2026m09" PARTITION OF "audit_logs_partitioned"
  FOR VALUES FROM ('2026-09-01 00:00:00+00') TO ('2026-10-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS "audit_logs_y2026m10" PARTITION OF "audit_logs_partitioned"
  FOR VALUES FROM ('2026-10-01 00:00:00+00') TO ('2026-11-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS "audit_logs_y2026m11" PARTITION OF "audit_logs_partitioned"
  FOR VALUES FROM ('2026-11-01 00:00:00+00') TO ('2026-12-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS "audit_logs_y2026m12" PARTITION OF "audit_logs_partitioned"
  FOR VALUES FROM ('2026-12-01 00:00:00+00') TO ('2027-01-01 00:00:00+00');

-- Catch-all default partition to safely accept out-of-range timestamps without crashing transactions
CREATE TABLE IF NOT EXISTS "audit_logs_default" PARTITION OF "audit_logs_partitioned" DEFAULT;

-- Partitioned stock movements table
CREATE TABLE IF NOT EXISTS "stock_movements_partitioned" (
  "id" uuid DEFAULT gen_random_uuid(),
  "variant_id" uuid NOT NULL,
  "store_id" uuid NOT NULL,
  "quantity_delta" integer NOT NULL,
  "reason" text NOT NULL,
  "reference_type" text NULL,
  "reference_id" text NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("id", "created_at")
) PARTITION BY RANGE ("created_at");

CREATE TABLE IF NOT EXISTS "stock_movements_default" PARTITION OF "stock_movements_partitioned" DEFAULT;

COMMENT ON TABLE "audit_logs_partitioned" IS 'TASK-082 declarative range partitioning by month';
