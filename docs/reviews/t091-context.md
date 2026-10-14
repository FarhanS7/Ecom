# Review context — T091: Customer address book

Branch: `feature/identity/t091-address-book` (parent task; linked subtasks
T091a/T091b per the scope rule).

## Changed files

T091a (previous commit): `0009-addresses.sql` additive migration (self-owned
rows only, no cross-module FKs per the drizzle-schema decision),
`packages/backend/src/identity/addresses.ts` service, `AddressesController`
(`/v1/me/addresses` CRUD, session-scoped), contracts (`addressFields` /
`addressResponse`), `apps/api/tests/integration/addresses.spec.ts`,
route-policy +5 entries, openapi +2 paths (T018 gate caught stale drift live
and forced the fix), T091a/T091b subtask docs.

T091b (this commit): `apps/web/src/features/account/addresses.tsx`
(list/create/edit/two-step-delete), mounted on `app/account/page.tsx`,
`lib/api.ts` `ALLOWED_GATEWAY_PREFIXES` (one-extra-segment depth cap),
`lib/csrf.ts` `gatewayRequest` (any verb, same-origin guard),
`app/api/[...path]/route.ts` PATCH/DELETE verb support (was GET/POST only →
Next 405 before ever reaching the proxy), `lib/api.test.ts` prefix test,
`tests/e2e/addresses.spec.ts` (not-run here, declared), `tasks/todo.md`
(T017/T018 checkpoints closed).

## Behavior

- Address CRUD is session-scoped server-side; the browser only ever calls
  same-origin `/api/v1/me/addresses[/{id}]` through the gateway prefix.
- Prefix matching: exact allowlist paths stay literal; a prefix plus exactly
  one extra strict-segment proxies per-ID routes. Two-level children,
  traversal, and unknown paths collapse to the byte-identical generic
  gateway 404 (same problem shape as any unknown route).
- Gateway verbs: GET/POST/PATCH/DELETE; bodies forwarded only for POST/PATCH
  (buffered as text, content-type re-declared); GET/DELETE never send one.
- UI: validation errors announce via role=alert, nonsecret input persists
  across failed submits, deletes require an inline two-step confirm (no
  dialog trap), all controls ≥44px and keyboard-operable.

## Assumptions

- Authenticated CRUD round-trips need live DB (integration spec skips
  honestly here, runs in CI); the unauthenticated 401 through every verb is
  the live proof that gateway→API routing and the session guard both engage.
- e2e journeys written but NOT run (Playwright browsers absent on this host).

## Risk areas

- Prefix list is code (never client input); future per-ID routes must extend
  `ALLOWED_GATEWAY_PREFIXES` + the route-policy registry together (T018 gate
  fails CI on route-policy drift, not on gateway-prefix drift — that gap is
  review-noted).
- Address `fields` travel as a JSON record; snapshot-history regression is
  explicitly deferred to checkout work (T091 checkpoint line says "with
  checkout").

## Verification (exact results, agent host 2026-10-15)

- Web `build` (10 routes) + `typecheck` + unit 7/7 + `lint` green; workspace
  `typecheck`+`lint`+`test` green (backend 36/36).
- api `test:integration` 44/44 (DB-dependent specs incl. addresses skip with
  `SKIP:` lines locally, run live in CI).
- Prod loopback battery (API dist :4010 + `next start` :3100): GET collection,
  GET per-ID, POST, PATCH, DELETE all → API 401 (auth guard reached through
  the proxy — all five verbs proven end-to-end); two-level child and
  traversal → gateway 404; unknown path → gateway 404; `/account` renders the
  Addresses heading + form SSR-side.
- Bundle grep: no JWT/SECRET/API_BASE_URL/URLs in client chunks (3 hits are
  React `__SECRET_INTERNALS` identifiers only).

## Learner notes

- Naive: proxy everything under `/api/` → open SSRF-ish relay; allowlist +
  depth-capped prefixes keep the proxy closed by default.
- Naive: `body: undefined` on GET fetch → exactOptionalPropertyTypes catches
  the sloppiness at build time; conditional spread makes the no-body case
  explicit.
- Survives restart: addresses live in Postgres keyed to the account; the
  browser holds nothing (no storage writes anywhere in web src).

## Independent review report

**Pending** — distinct model in a fresh session unavailable here. Nothing
merged to `main`/`dev`; merge/release gates stay closed until review
completes.
