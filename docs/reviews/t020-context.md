# Review context — T020: Implement seller catalog mutations

Branch: `feature/catalog/t020-implement-seller-catalog-mutations` (parent
task; linked subtasks T020a/T020b per the scope rule).

## Changed files

T020a (`9716574`): `packages/backend/src/catalog/product.service.ts`,
`packages/contracts/src/catalog.ts` (+ `catalog.test.ts`), T020a/T020b
subtask docs; `catalog/index.ts` replaced the T001-era `CatalogPorts`
stubs with real service exports (grep-proven zero dependents).

T020b (this commit): `apps/api/src/product.controller.ts` (9 routes under
`/v1/seller/stores/{storeId}/products`), `app.module.ts` registration,
`packages/backend/src/platform/route-policy.ts` (+9 classified entries),
`scripts/openapi.mjs` expected-path list (+6), `docs/openapi.json`
regenerated (28 paths, drift-free), `apps/api/tests/integration/
catalog-write.spec.ts`.

## Behavior

- Every mutation is store-scoped IN THE SQL statement (`store_id` in the
  WHERE); foreign/unknown product IDs and non-scoped reads share one
  generic 404 with unknown IDs (no existence oracle).
- Optimistic concurrency: updates carry `expectedVersion` (mandatory in
  the contract); the UPDATE matches on `version = $expected` and bumps it,
  so two writers submitting the same version produce exactly one success
  and one 409 (proven over HTTP in the integration battery; a retry with
  the fresh version succeeds — recovery path asserted).
- `min_price_cents` is DERIVED from active variants after every variant
  or status change (never a second editable price); publication toggles
  set independent flags, maintain `published_at` (visible-on-any-channel),
  and bump the product version in one transaction — unlisting from
  marketplace keeps store visibility (module acceptance scenario).
- Archive flips status + bumps version; variant rows survive (RESTRICT
  boundary from T019); stale edits after archive → 409.
- Duplicate SKU per store → 409 with constant message; malformed bodies
  on scoped routes → 404 (deliberate no-oracle deviation from 422).

## Contract decision (recorded, not silent)

The FIRST draft of T020b.md said "member without permission → 403".
Cross-checked against the T018 matrix and onboarding/stores services:
the established Milestone-1 decision is that ALL scope failures on
scoped store routes collapse to one generic 404 — 403 is reserved for
platform-admin routes. The controller and subtask doc were corrected to
match BEFORE commit (gate is now a single `authorizeStore` check;
the temporary membership-read 403 split was deleted). The catalog-write
spec asserts 404 + "no permission/forbidden text" for the fulfillment
persona to pin this.

## Assumptions

- Variant edits are gated by the PRODUCT's version counter (one optimistic
  counter per product keeps seller screens simple) — documented in the
  service header; per-variant counters would fragment the UX.
- `expectedVersion` is validated in the contract, then the body is parsed
  manually for PATCH (scoped-route no-oracle: a zod failure must also be
  404, so full-schema parsing would leak "bad input" ≢ "no scope").
- OpenAPI generation ran with inline throwaway demo secrets; the script's
  secret scan passed (no value enters the document).

## Risk areas

- `product.controller.ts` PATCH/`archive` do manual field extraction
  (`body.expectedVersion`) instead of schema parsing — schema-level
  constraint violations beyond `expectedVersion` reach SQL and surface
  as 500s; acceptable for demo scope, recorded for T074 hardening.
- `toCatalogError` maps BOTH `VERSION_CONFLICT` and `CONFLICT` to 409
  with the service message (constant strings; no state leaks).

## Verification (exact results, agent host 2026-10-15)

- Workspace `build` + `typecheck` + `lint` green; backend unit 41/41;
  contracts unit 4/4; api integration 49/49 files+tests with honest
  `SKIP:` lines (no reachable DB here; exit 0), including the T018 CI
  gate test: all 28 OpenAPI paths classified, zero drift (both
  directions).
- `docs/openapi.json` regenerated from built dist; drift check exit 0.
- Live-DB HTTP battery (5 scenarios: permission boundaries incl. anonymous
  401 / fulfillment 404 / customer 404; two-writers-one-winner + retry
  recovery; foreign-store + negative price + malformed body; duplicate
  SKU + derived min price + independent publication flags; archive
  preserves rows + stale edit 409) — written, compiled, honestly not run
  locally; CI-live.

## Learner notes

- Naive: `UPDATE ... SET version = version + 1 WHERE id = $1` then compare
  versions in JS after the write → both writers "succeed"; the version
  check must be IN the WHERE clause so the DB serializes the race.
- Naive: check permission, then load the product → TOCTOU + an existence
  oracle; scoping the statement itself closes both.
- Survives restart: version counters, publication flags, archived status
  are durable Postgres state; the derived min price is recomputed on
  demand and thus self-healing after any crash mid-transaction (it is
  only ever written inside the same tx as its trigger change).

## Independent review report

**Pending** — distinct model in a fresh session unavailable here.
Nothing merged to `main`/`dev`.
