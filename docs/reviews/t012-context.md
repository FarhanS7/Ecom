# Review context — T012: Account recovery and verification

Branch: `feature/identity/t012-implement-account-recovery-and-verification`
(parent task; linked subtasks T012a/T012b per the scope rule).

## Changed files

T012a (`cb5ddd4`): backend `identity/recovery.service.ts` (clock-injected
request/confirm for reset + verification, single-live-proof supersede,
consume+rehash+revoke-all txn, pending→active only), `identity/demo-delivery.ts`
(dev-only sink), `recovery.service.test.ts` (fixed-clock predicate table),
contracts reset/verify DTOs.
T012b (this commit): api `auth.controller.ts` (+4 routes), `tests/integration/
recovery.spec.ts` (4 tests), `docs/openapi.json` (+4 paths), `tasks/todo.md`.

## Behavior

- Reset requests always 202 with identical bodies; unknown emails create
  nothing. Confirm consumes, rehashes, revokes all families; replay,
  superseded, expired, and pre-expired proofs share one generic 404.
- Verification requests are authenticated-self; confirm lifts pending→active
  only — suspended stays suspended, replay 404s.
- New password logs in; pre-reset access tokens 401 on `/me`.

## Assumptions

- Demo sink holds cleartext proofs by design (dev only; prod uses providers).
  Tests read the in-process singleton (same backend instance as the app).
- Password policy (8–128) duplicated in service (defense in depth with the
  contract schema); both assert the same bounds.
- Register still creates `active` users (T010 decision); verification flow
  stands ready for T012-gated registration if product decides so later.

## Risk areas

- Sink singleton is process memory: multi-instance deployments would split
  proof visibility — acceptable for local demo, blocking for prod (roadmap).
- Clock skew between app hosts could shrink proof windows; single-host demo
  unaffected, noted for operations.

## Verification (exact results, agent host 2026-10-15)

- Backend unit 23/23 (incl. fixed-clock predicate table).
- API 23/23 green; recovery 4 skip honestly (DB unreachable) and execute in CI.
  Routes `password-reset/*` + `verify-email/*` confirmed in router log.
- Workspace `build` + `typecheck` + `lint` green. `pnpm openapi` clean (12 paths).

## Learner notes

- Naive: distinct "expired" vs "invalid" responses → validity oracle; one
  generic 404 for all dead proofs (only unit predicate names the reason).
- Naive: reset without session revocation → stolen sessions survive password
  change; caught by old-access-401 assertion.
- Naive: verification that activates any status → suspended bypass; caught by
  suspended-stays assertion.
- Survives restart: proofs/consumptions/hashes/revocations (PostgreSQL).
  Demo sink does NOT (process memory — documented demo limitation).

## Independent review report

**Pending** — distinct model in a fresh session unavailable here. Nothing merged
to `main`/`dev`; merge/release gates stay closed until review completes.
