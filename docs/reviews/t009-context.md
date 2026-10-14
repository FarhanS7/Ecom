# Review context — T009: Global accounts and session records

Branch: `feature/identity/t009-model-global-accounts-and-session-records`.

## Changed files

- `db/migrations/0001-identity.sql` (new, reviewed): users, platform_roles,
  permissions, role/user link tables, session_families, refresh_tokens,
  identity_tokens + foundation role/permission seed (fixed UUIDs, conflict-safe).
- `packages/backend/src/identity/schema.ts` (new): drizzle mirror for
  generate-diff verification.
- `packages/backend/src/db/schema.ts`: re-exports identity tables (drizzle-kit
  entry; extensionless import — drizzle's CJS loader cannot resolve `.js`).
- `packages/backend/src/identity/schema.test.ts` (new): table-name tripwire.
- `packages/backend/tests/integration/identity-schema.spec.ts` (new):
  concurrent-duplicate → one account, hash-only storage, seed + constraints.
- `db/drizzle.config.ts`: CWD-relative paths (kit resolves from CWD, not the
  config file) + fixed `generate:pg` command in backend `package.json`.

## Behavior

Normalized-email UNIQUE is the duplicate-registration guard; token tables
store hashes only; families RESTRICT (audit anchor), links/ephemerals CASCADE,
refresh self-link SET NULL; seed gives admin 7/7 grants, support read+refund,
seller catalog+read, customer none (ownership-based).

## Assumptions

- Normalization (lowercase+trim) happens in application code (T010); the DB
  enforces the normalized form.
- Refresh/reset tokens are sha256-of-random-32B (fast, lookup-by-hash);
  passwords are argon2id (T010, deliberately not used in these tests).
- SQL owns CHECKs (kit 0.20 drops `check()` — verified in diff), the refresh
  self-FK (drizzle 0.30 type cycle), and seeds; schemas own shape.

## Risk areas

- Generate-diff is structural, not byte-equal (naming + CHECKs + seeds differ
  by design). The unit table-name test + integration catalog assertions
  (pg_constraint/pg_indexes) are the tripwires.
- Stray `packages/backend/migrations/` from a failed generate run was deleted;
  only `db/migrations/` is canonical.

## Verification (exact results, agent host 2026-10-14)

- Backend `build` + `typecheck` + `lint` green; unit 10/10 (incl. new schema test).
- Integration 6/6 green with honest skips (no DATABASE_URL / unreachable DB);
  live-DB concurrency + hash + seed proofs execute in CI (`integration` job).
- `db:generate` run: 9 tables recognized; diff vs reviewed SQL confirmed
  tables/columns/uniques/indexes/FKs match; found + fixed a redundant double
  unique on `refresh_tokens.token_hash`; generated artifacts deleted afterwards.

## Learner notes

- Naive: `SELECT`-then-`INSERT` for duplicate emails → race creates two
  accounts; the UNIQUE constraint + `23505` handling collapses them. Caught by:
  10-way concurrent insert test asserting exactly 1 row.
- Naive: store raw reset tokens "temporarily" → DB dump = account takeover;
  caught by: known-raw round-trip asserting stored≠raw and zero raw sightings.
- Survives restart: users/families/tokens/seeds (PostgreSQL). Cache-only: n/a.

## Independent review report

**Pending** — distinct model in a fresh session unavailable here. Nothing merged
to `main`/`dev`; merge/release gates stay closed until review completes.
