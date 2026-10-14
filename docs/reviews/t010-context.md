# Review context — T010: Registration and login

Branch: `feature/identity/t010-implement-registration-and-login`
(parent task; linked subtasks T010a/T010b per the scope rule).

## Changed files

T010a (`811bfe7`): `packages/contracts/src/identity.ts` (authUser, authResponse,
cookie spec; T002 `name`/body-refresh shapes superseded per ADR-0004),
`api/index.ts` (auth shapes removed → single source), backend
`identity/auth.service.ts` + `auth.service.test.ts`, `identity/index.ts`
exports, `vitest.config.ts` (serialized: parallel threads share process.env —
caused real cross-file flakes, fixed).
T010b (this commit): api `auth.controller.ts` (explicit zod parsing, raw
Set-Cookie issuance, typed AuthError → 409/401 mapping), `app.module.ts`,
`tests/integration/login.spec.ts` (5 tests), `docs/openapi.json`
(regenerated: +`/v1/auth/*`), `tasks/todo.md`.

## Behavior

- Register → 201 + safe user + one family; duplicate → 409 CONFLICT, no second
  family. Login → 200 + second family. Wrong/unknown/suspended → byte-identical
  generic 401 (message, code path, and argon2 cost equalized via dummy hash).
- Cookies: `access_token` (Path=/, 900s) + `refresh_token` (Path=/v1/auth,
  604800s), HttpOnly + SameSite always; Secure iff config. Refresh never in
  bodies; hashes never leave the API (scanned, not eyeballed).

## Assumptions

- Register creates `active` users until T012 defines verification gating.
- No CSRF/Origin checks or rate limits yet (T013); no gateway auth paths yet
  (T017 screens extend the allowlist with their own verification).
- JWT carries platform roles snapshot; store memberships are ALWAYS re-queried
  (module spec) — never trusted from claims.

## Risk areas

- `POST /v1/auth/*` without throttling until T013: brute-force surface is
  real; argon2 cost slows but does not stop it. Called out here, owned by T013.
- Timing equality is cost-level (one argon2 each path), not cycle-exact.

## Verification (exact results, agent host 2026-10-14)

- Backend unit 15/15 (normalize, argon2 round-trip, JWT round-trip+tamper,
  unique-violation mapping).
- API 15/15 green; login 5 skip honestly (DB unreachable) and execute in CI.
  Routes `POST /v1/auth/register|login` confirmed in router log.
- Workspace `build` + `typecheck` + `lint` green. `pnpm openapi` clean,
  secret scan passed, artifact test still green.

## Learner notes

- Naive: distinct "wrong password" vs "unknown user" messages (or skipping
  argon2 for unknown emails) → enumeration oracle; caught by
  byte-equality assertion across all three failure modes.
- Naive: refresh token in response body (T002 draft) → XSS-accessible session;
  fixed per ADR-0004, caught by cookie-only + no-refresh-in-body assertions.
- Naive: trusting JWT role claims for store scope → stale-membership access;
  contract states re-query rule; enforced in T014+.
- Survives restart: users/families/token hashes/roles (PostgreSQL). Cache: n/a.

## Independent review report

**Pending** — distinct model in a fresh session unavailable here. Nothing merged
to `main`/`dev`; merge/release gates stay closed until review completes.
