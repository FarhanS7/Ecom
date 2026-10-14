# Review context — T018: Authorization matrix harness

Branch: `feature/stores/t018-authorization-matrix-harness`.

## Changed files

- `packages/backend/src/platform/route-policy.ts` (new): 20-route registry
  (public/session/storeMember/store-permission/platformAdmin) +
  `findUnclassifiedRoutes` (CI gate) + `findUndocumentedRoutes` (drift gate).
- `apps/api/tests/fixtures/actors.ts` (new): 7-persona world (2 stores, roles,
  shared hash, full teardown).
- `apps/api/tests/integration/permission-matrix.spec.ts` (new): classification
  gate + 6 persona runs (anon/customer/owners/editor/fulfillment/support/admin).
- `docs/testing/permission-matrix.md` (measured-results note), `apps/api/package.json`
  (postgres devDep for fixture types), `tasks/todo.md`.

## Behavior

- Scoped store routes collapse every scope failure — non-member, unknown
  store, member-without-grant — to byte-identical generic 404s (uniform
  no-oracle rule; platform-admin routes 403, unauthenticated session routes
  401 — each tier documented in the spec header).
- Membership bodies carry `{storeId, role, status}` only (asserted: no emails,
  no user lists). Multi-role accounts (ownerA) pass both shopper and staff reads.
- Unclassified OpenAPI paths fail CI by registry comparison, not by convention.

## Assumptions

- Support has no store/admin scope yet (policy-scoped lookup is reporting
  work); support behaves as customer + platform read where routes allow.
- Webhook verification routes arrive with payments (T050); the registry grows
  with them under the same gate.

## Risk areas

- Fixture cleanup is predicate-scoped to test emails/slugs; a crashed run
  leaves rows that `ON CONFLICT`/cleanup-on-next-run absorb (reruns verified
  by design, not assumed).
- Matrix covers implemented routes only; T074 expands to all future routes
  using this same harness.

## Verification (exact results, agent host 2026-10-15)

- API 41/41 green (matrix 7: classification gate executes live; 6 persona
  runs skip honestly without DB, full runs in CI).
- Workspace `build` + `typecheck` + `lint` green.

## Learner notes

- Naive: per-route ad-hoc auth checks → unclassified endpoints ship silently;
  registry + doc-comparison test makes classification structural.
- Naive: 403 for in-scope-but-unpermitted vs 404 for out-of-scope → membership
  oracle; uniform 404 (only platform surface 403s).
- Naive: JWT role claims as scope proof → stale access; every scoped read
  re-queries membership (T014b pattern, re-proven per persona here).
- Survives restart: roles/memberships (PostgreSQL). Fixture cookies are
  per-run memory.

## Independent review report

**Pending** — distinct model in a fresh session unavailable here. Nothing merged
to `main`/`dev`; merge/release gates stay closed until review completes.
