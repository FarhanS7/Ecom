# Review context — T011: Refresh rotation and logout

Branch: `feature/identity/t011-implement-refresh-rotation-and-logout`
(parent task; linked subtasks T011a/T011b per the scope rule).

## Changed files

T011a (`668eb64`): backend `identity/session.service.ts` (resolveActor,
rotateRefresh, revokeFamily, getSafeUser), `identity/session.guard.ts`
(Actor, exact-name cookie parsing, decideSession), unit suites (rotation
decision table via scripted fake; guard contract), index exports.
T011b (this commit): contracts `logoutResponse`; api `session.guard.ts`
(Nest adapter, generic 401), `auth.controller.ts` (+refresh/logout/me);
web `lib/session.ts` + `session.test.ts` (single-flight); api
`tests/integration/refresh.spec.ts` (race, reuse, logout, guard); `docs/openapi.json`
(+3 paths); `tasks/todo.md`.

## Behavior

- Rotation: one transaction under `FOR UPDATE OF t`; consumed/revoked → family
  revoked; expired/suspended/unknown → generic invalid (no revocation noise).
- Reuse is theft: loser of a race revokes the family — strict by module spec;
  the browser single-flight helper exists so benign clients never self-trigger.
- Logout revokes + clears cookies; `/me` requires a live session (suspended
  users resolve to null despite valid signatures).

## Assumptions

- Refresh JWT claims are re-checked against live rows on every use; platform
  roles in the token are a snapshot, store memberships always re-queried (T014+).
- `POST /v1/auth/*` still unthrottled (T013) and gateway auth paths still
  closed (T017) — both called out, not silent.

## Risk areas

- Strict revocation-on-race can log out a user on a benign double-submit that
  bypasses single-flight (e.g., two tabs); accepted per spec, documented here.
- Timing equality for refresh outcomes is cost-level, like T010 logins.

## Verification (exact results, agent host 2026-10-15)

- Backend unit 21/21 (4 rotation + 2 guard + prior suites).
- API 19/19 green; refresh 4 skip honestly (DB unreachable) and execute in CI.
  Routes `/v1/auth/refresh|logout|me` confirmed in router log.
- Web unit 2/2 (coalescing + post-settle). Workspace `build` + `typecheck` +
  `lint` green. `pnpm openapi` clean (8 paths).

## Learner notes

- Naive: read-then-write rotation without `FOR UPDATE` → two live descendants;
  caught by: race test asserting exactly one 200 + zero usable sessions after.
- Naive: distinguish "expired" from "invalid" for UX → oracle for token
  validity; all non-success outcomes share one generic 401 (only the DB log
  distinguishes, and it never reaches clients).
- Naive: trust JWT expiry alone for logout → "logged out" sessions stay valid
  15 minutes; revocation is server-side state, proven by post-logout 401s.
- Survives restart: families/tokens/revocations (PostgreSQL). Cache: n/a —
  pending slot is process memory by design (per-tab serialization).

## Independent review report

**Pending** — distinct model in a fresh session unavailable here. Nothing merged
to `main`/`dev`; merge/release gates stay closed until review completes.
