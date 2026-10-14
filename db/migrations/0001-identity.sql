-- T009 identity migration: global accounts and session records.
-- Reviewed SQL. Conventions per docs/architecture/data-model.md: UUID PKs
-- (pgcrypto), timestamptz UTC, additive-only. Secrets policy: password_hash
-- (argon2id, T010) and token HASHES only — raw refresh/reset tokens never
-- appear here (proven by identity-schema tests).
--
-- Deletion policy: families use RESTRICT (session audit anchor; users with
-- history are disabled, never deleted — account deletion is out of demo
-- scope). Role-link tables and ephemeral tokens CASCADE. Refresh replacement
-- links SET NULL so consuming a rotation never orphans history.
--
-- Email is normalized ONCE by the application (lowercase+trim) before write;
-- the UNIQUE constraint on email_normalized is the concurrency guard that
-- makes duplicate registration collapse to exactly one account.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "email_normalized" text NOT NULL,
  "password_hash" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending_verification'
    CHECK ("status" IN ('active','suspended','pending_verification')),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "users_email_normalized_uniq" UNIQUE ("email_normalized")
);

CREATE TABLE IF NOT EXISTS "platform_roles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" text NOT NULL,
  CONSTRAINT "platform_roles_key_uniq" UNIQUE ("key")
);

CREATE TABLE IF NOT EXISTS "permissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" text NOT NULL,
  CONSTRAINT "permissions_key_uniq" UNIQUE ("key")
);

CREATE TABLE IF NOT EXISTS "platform_role_permissions" (
  "role_id" uuid NOT NULL REFERENCES "platform_roles"("id") ON DELETE CASCADE,
  "permission_id" uuid NOT NULL REFERENCES "permissions"("id") ON DELETE CASCADE,
  CONSTRAINT "platform_role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

CREATE TABLE IF NOT EXISTS "user_platform_roles" (
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role_id" uuid NOT NULL REFERENCES "platform_roles"("id") ON DELETE CASCADE,
  CONSTRAINT "user_platform_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

CREATE TABLE IF NOT EXISTS "session_families" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "revoked_at" timestamptz NULL,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "session_families_user_id_idx" ON "session_families" ("user_id");

CREATE TABLE IF NOT EXISTS "refresh_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "family_id" uuid NOT NULL REFERENCES "session_families"("id") ON DELETE CASCADE,
  "token_hash" text NOT NULL,
  "used_at" timestamptz NULL,
  "expires_at" timestamptz NOT NULL,
  "replacement_id" uuid NULL REFERENCES "refresh_tokens"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "refresh_tokens_token_hash_uniq" UNIQUE ("token_hash")
);
CREATE INDEX IF NOT EXISTS "refresh_tokens_family_id_idx" ON "refresh_tokens" ("family_id");

CREATE TABLE IF NOT EXISTS "identity_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "purpose" text NOT NULL CHECK ("purpose" IN ('reset','verification')),
  "token_hash" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "consumed_at" timestamptz NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "identity_tokens_token_hash_uniq" UNIQUE ("token_hash")
);
CREATE INDEX IF NOT EXISTS "identity_tokens_user_id_idx" ON "identity_tokens" ("user_id");

-- Seed: fixed UUIDs + ON CONFLICT DO NOTHING make this repeatable; the
-- migration stays twice-safe and adoption-safe like the T003 bootstrap.
-- Roles mirror PRD personas; permissions are the foundation set (extended by
-- owning tasks; T018 asserts the full matrix).

INSERT INTO "platform_roles" ("id","key") VALUES
  ('10000000-0000-0000-0000-000000000001','admin'),
  ('10000000-0000-0000-0000-000000000002','support'),
  ('10000000-0000-0000-0000-000000000003','seller'),
  ('10000000-0000-0000-0000-000000000004','customer')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "permissions" ("id","key") VALUES
  ('20000000-0000-0000-0000-000000000001','product:update'),
  ('20000000-0000-0000-0000-000000000002','order:read'),
  ('20000000-0000-0000-0000-000000000003','order:refund'),
  ('20000000-0000-0000-0000-000000000004','seller:approve'),
  ('20000000-0000-0000-0000-000000000005','audit:read'),
  ('20000000-0000-0000-0000-000000000006','role:manage'),
  ('20000000-0000-0000-0000-000000000007','customer:read')
ON CONFLICT ("id") DO NOTHING;

-- admin: everything. support: read + capped refunds (cap enforced in app, T069).
-- seller: own catalog + own order lines. customer: ownership-based, no grants.
INSERT INTO "platform_role_permissions" ("role_id","permission_id") VALUES
  ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000003'),
  ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000004'),
  ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000005'),
  ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000006'),
  ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000007'),
  ('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000003'),
  ('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000007'),
  ('10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000002')
ON CONFLICT DO NOTHING;

COMMENT ON TABLE "users" IS 'T009 global accounts; email_normalized UNIQUE is the duplicate-registration guard';
COMMENT ON TABLE "refresh_tokens" IS 'T009 rotation records; token_hash only, never raw tokens';
COMMENT ON TABLE "identity_tokens" IS 'T009 reset/verification proofs; token_hash only, single-use via consumed_at';
