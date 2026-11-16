-- db/migrations/0026-feature-flags.sql - Feature flags schema (TASK-076, PRD P2 AD-4).
-- Invariants:
-- 1. key is the unique primary identifier (e.g. 'checkout_v2', 'flash_deals').
-- 2. enabled is a global master toggle (defaults to false).
-- 3. store_allowlist is a JSONB array of UUID strings for tenant-scoped feature access.
-- 4. rollout_percentage is bounded between 0 and 100 for gradual percentage rollouts.

CREATE TABLE IF NOT EXISTS "feature_flags" (
  "key" text PRIMARY KEY,
  "description" text,
  "enabled" boolean NOT NULL DEFAULT false,
  "store_allowlist" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "rollout_percentage" integer NOT NULL DEFAULT 0 CHECK ("rollout_percentage" >= 0 AND "rollout_percentage" <= 100),
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "feature_flags_enabled_idx" ON "feature_flags" ("enabled");
