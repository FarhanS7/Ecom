-- T003 bootstrap migration: migration harness probe.
-- Reviewed SQL. Conventions per docs/architecture/data-model.md:
-- UUID PK (pgcrypto gen_random_uuid), timestamptz UTC, additive-only.
--
-- Why this table: proves empty-DB migrate, twice-safe re-run, and
-- upgrade-from-previous-schema paths without pre-creating later-module
-- tables (users/stores/catalog/...) before their owning tasks exist.
-- Later migrations add domain tables; this sentinel row stays.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS "migration_probe" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "note" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- Sentinel row: exactly one row proves bootstrap ran. Insert is idempotent
-- so re-running this migration file never duplicates it.
INSERT INTO "migration_probe" ("id", "note")
VALUES ('00000000-0000-0000-0000-000000000001', 'bootstrap')
ON CONFLICT ("id") DO NOTHING;

COMMENT ON TABLE "migration_probe" IS 'T003 harness sentinel; later tasks add domain tables additively';
