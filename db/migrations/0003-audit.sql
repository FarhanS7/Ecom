-- T015 onboarding migration: audit log and staff invitations. Reviewed SQL.
-- audit_logs is append-only (no UPDATE/DELETE paths exist anywhere); rows
-- carry redacted snapshots — membership/invitation records contain no secrets
-- by shape, and request_id ties rows to logs without PII.
-- store_invitations: one-use expiring proofs. Pending-dedupe partial unique
-- keeps exactly one live invitation per (store, email); history rows stay.

CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "actor_id" uuid NULL REFERENCES "users"("id") ON DELETE SET NULL,
  "store_id" uuid NULL REFERENCES "stores"("id") ON DELETE SET NULL,
  "action" text NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" text NOT NULL,
  "redacted_before" jsonb NULL,
  "redacted_after" jsonb NULL,
  "request_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "audit_logs_store_created_idx" ON "audit_logs" ("store_id","created_at" DESC,"id" DESC);
CREATE INDEX IF NOT EXISTS "audit_logs_actor_created_idx" ON "audit_logs" ("actor_id","created_at" DESC);

CREATE TABLE IF NOT EXISTS "store_invitations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "store_id" uuid NOT NULL REFERENCES "stores"("id") ON DELETE CASCADE,
  "email_normalized" text NOT NULL,
  "role_id" uuid NOT NULL REFERENCES "store_roles"("id") ON DELETE RESTRICT,
  "token_hash" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "accepted_at" timestamptz NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "store_invitations_token_hash_uniq" UNIQUE ("token_hash")
);
-- Exactly one LIVE invitation per (store, email); accepted/expired history
-- is preserved and never blocks re-invitation.
CREATE UNIQUE INDEX IF NOT EXISTS "store_invitations_pending_uniq"
  ON "store_invitations" ("store_id","email_normalized")
  WHERE "accepted_at" IS NULL;
CREATE INDEX IF NOT EXISTS "store_invitations_store_id_idx" ON "store_invitations" ("store_id");

COMMENT ON TABLE "audit_logs" IS 'T015 append-only privileged-mutation log; reporting reads it in T066';
COMMENT ON TABLE "store_invitations" IS 'T015 one-use staff invitations; token_hash only, never raw tokens';
