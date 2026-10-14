-- T091 address book migration: user-owned addresses. Reviewed SQL.
-- Numbering: the task's `0003b` was provisional; actual ordering wins
-- (0004 taken by themes). No foreign key points AT addresses by design:
-- future orders (T046+) carry address SNAPSHOTS, never references, so
-- editing or deleting an address can never mutate order history.

CREATE TABLE IF NOT EXISTS "addresses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "fields" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "addresses_user_id_idx" ON "addresses" ("user_id");

COMMENT ON TABLE "addresses" IS 'T091 customer address book; owner-scoped CRUD, snapshots (not FKs) for orders';
