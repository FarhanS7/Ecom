-- T014 stores migration: businesses, one-store relationship, staff roles,
-- membership policy. Reviewed SQL. Invitations (store_invitations) belong to
-- T015, themes/content to T016 — absent here by design, never snuck in.
--
-- Core invariant (D-007): UNIQUE(business_id) enforces one store per business
-- at the database boundary. Staff access requires an ACTIVE membership row;
-- a valid store ID alone proves nothing (authorizeStore, T014a).

CREATE TABLE IF NOT EXISTS "businesses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "status" text NOT NULL DEFAULT 'active'
    CHECK ("status" IN ('active','suspended')),
  "commission_bps" integer NOT NULL DEFAULT 500
    CHECK ("commission_bps" >= 0 AND "commission_bps" <= 10000),
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "stores" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE RESTRICT,
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending'
    CHECK ("status" IN ('pending','active','suspended')),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "stores_business_id_uniq" UNIQUE ("business_id"),
  CONSTRAINT "stores_slug_uniq" UNIQUE ("slug")
);

-- Role keys follow docs/architecture/data-model.md exactly (hyphenated).
CREATE TABLE IF NOT EXISTS "store_roles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" text NOT NULL,
  CONSTRAINT "store_roles_key_uniq" UNIQUE ("key")
);

CREATE TABLE IF NOT EXISTS "store_role_permissions" (
  "role_id" uuid NOT NULL REFERENCES "store_roles"("id") ON DELETE CASCADE,
  "permission_id" uuid NOT NULL REFERENCES "permissions"("id") ON DELETE CASCADE,
  CONSTRAINT "store_role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

CREATE TABLE IF NOT EXISTS "store_memberships" (
  "store_id" uuid NOT NULL REFERENCES "stores"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role_id" uuid NOT NULL REFERENCES "store_roles"("id") ON DELETE RESTRICT,
  "status" text NOT NULL DEFAULT 'active'
    CHECK ("status" IN ('active','revoked')),
  "version" integer NOT NULL DEFAULT 1,
  CONSTRAINT "store_memberships_pkey" PRIMARY KEY ("store_id","user_id")
);
CREATE INDEX IF NOT EXISTS "store_memberships_user_id_idx" ON "store_memberships" ("user_id");

-- Seed: fixed UUIDs + ON CONFLICT DO NOTHING (twice-safe, adoption-safe).
-- Grants mirror packages/backend/src/stores/permissions.ts STORE_ROLE_GRANTS;
-- the unit suite asserts they never drift (owner ⊇ all, editor ∩ fulfill ∅).
INSERT INTO "store_roles" ("id","key") VALUES
  ('30000000-0000-0000-0000-000000000001','owner'),
  ('30000000-0000-0000-0000-000000000002','manager'),
  ('30000000-0000-0000-0000-000000000003','catalog-editor'),
  ('30000000-0000-0000-0000-000000000004','fulfillment')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "permissions" ("id","key") VALUES
  ('20000000-0000-0000-0000-000000000008','catalog:manage'),
  ('20000000-0000-0000-0000-000000000009','fulfillment:manage'),
  ('20000000-0000-0000-0000-000000000010','team:manage'),
  ('20000000-0000-0000-0000-000000000011','store:manage'),
  ('20000000-0000-0000-0000-000000000012','reports:read')
ON CONFLICT ("id") DO NOTHING;

-- owner: everything. manager: everything but store settings. catalog-editor:
-- catalog only (notably NOT fulfillment). fulfillment: fulfillment only.
INSERT INTO "store_role_permissions" ("role_id","permission_id") VALUES
  ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000008'),
  ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000009'),
  ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000010'),
  ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000011'),
  ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000012'),
  ('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000008'),
  ('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000009'),
  ('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000010'),
  ('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000012'),
  ('30000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000008'),
  ('30000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000009')
ON CONFLICT DO NOTHING;

COMMENT ON TABLE "stores" IS 'T014 one store per business (UNIQUE business_id); approval in T015';
COMMENT ON TABLE "store_memberships" IS 'T014 staff scope; ACTIVE rows only grant access (authorizeStore)';
