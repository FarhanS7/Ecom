# Review context — T014: Scoped store memberships

Branch: `feature/stores/t014-implement-scoped-store-memberships`
(parent task; linked subtasks T014a/T014b per the scope rule).

## Changed files

T014a (`0dafc84`): `db/migrations/0002-stores.sql` (businesses, stores with
UNIQUE business_id/slug, hyphenated staff roles + grant seed, memberships),
`stores/schema.ts` + `stores/permissions.ts` (grant map + `authorizeStore` +
`getMembership`/`listActiveMemberships`), `stores/index.ts` (aligned to data
model; old stub shapes replaced), `db/schema.ts` + `db/drizzle.config.ts`
(schema ENTRY ARRAY — see below), `store-scope.spec.ts` (backend), grant unit
suite.
T014b (this commit): api `stores.controller.ts` (self-membership read,
generic 404), `app.module.ts`, api `store-scope.spec.ts` (cross-store probe,
revoke-then-retry with live-token proof), `scripts/openapi.mjs` (path list),
`docs/openapi.json` (+1 path), `tasks/todo.md`.

## Behavior

- One business → one store (DB-enforced); ACTIVE membership + granting role
  required; catalog-editor ⊄ fulfillment (code + seed + test agree).
- Self-membership read returns `{storeId, role, status}`; non-member, unknown
  store, and malformed id share byte-identical 404s (no oracle).
- Revocation is immediate: same JWT 200→404 while `/me` still 200s (scope is
  live state, never claims). Platform-admin bypass deliberately absent (T018).

## Assumptions

- Invitations/themes/content tables belong to T015/T016 (absent by design).
- JWT carries platform roles only; store scope always re-queried.

## Risk areas

- **Extensionless imports break real Node ESM**: fixing drizzle-kit's CJS
  loader that way crashed `pnpm openapi` on backend dist imports (proven).
  Rule now recorded in both schema files: schema files stay dependency-free,
  cross-module FKs live in reviewed SQL only, drizzle config uses an entry
  array. Generate-diff still covers tables/columns/uniques/indexes/PKs and
  same-module FKs (14 tables verified).
- Vitest/tsc tolerate either specifier — they cannot catch this class; only
  real Node runs (openapi script, prod boot) can. The openapi script doubles
  as the runtime-import smoke test.

## Verification (exact results, agent host 2026-10-15)

- Backend unit 32/32 (incl. 4 grant invariants); integration honest skips.
- API 30/30 green (store-scope 3 skip w/o DB, live in CI); membership route
  confirmed in router log.
- Workspace `build` + `typecheck` + `lint` green. `pnpm openapi` clean
  (13 paths) after the import fix.

## Learner notes

- Naive: `WHERE store_id = $body.store_id` (trust client scope) → cross-store
  read; fixed by deriving scope from membership rows only. Caught by:
  cross-store probe + identical-bodies assertion.
- Naive: cache membership in JWT/session → revoked staff keeps access;
  caught by: revoke-then-retry-with-same-token test (+ live `/me` control).
- Naive: 403 for non-members vs 404 for unknown → store-existence oracle;
  one generic 404 for all three cases.
- Survives restart: businesses/stores/roles/memberships (PostgreSQL). Cache: n/a.

## Independent review report

**Pending** — distinct model in a fresh session unavailable here. Nothing merged
to `main`/`dev`; merge/release gates stay closed until review completes.
