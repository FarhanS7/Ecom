# Review context — T013: Throttling and browser protections

Branch: `feature/identity/t013-auth-throttling-and-browser-protections`
(parent task; linked subtasks T013a/T013b per the scope rule).

## Changed files

T013a (`477aee1`): backend `identity/rate-limit.ts` (atomic Lua consume,
fail-closed outage, documented budgets, cache-redis singleton + test seam),
`platform/security.ts` (same-origin verifier, safe-headers map), unit suites
(manual-clock windows, isolation, outage, origin table, header pins).
T013b (this commit): api `auth.controller.ts` (origin + IP/identity budgets on
login/register/refresh/reset-request; 429+Retry-After / 503-fail-closed),
`main.ts` (`onSend` safe headers), web `lib/csrf.ts` + test, api
`tests/integration/auth-security.spec.ts` + allow-all limiter default in
`setup.ts`, `tasks/todo.md`.

## Behavior

- Budgets: login/register 20/60s IP + 10/60s email; refresh 20/60s IP +
  30/60s token; reset-request shares login budgets. Windows expire — no
  permanent lockout by construction.
- Wrong Origin → 403; absent provenance allowed (browsers always send Origin
  on cookie POSTs — documented limitation, not silence).
- Limiter down → 503 on gated mutations (fail closed, proven).
- Safe headers on every API response.

## Assumptions

- Counters live in the cache Redis (core profile); eviction loosens limits
  (fail-open direction under memory pressure — accepted, documented).
- `req.ip` is socket-derived (no-proxy demo assumption; proxies need
  XFF-trust work later).
- Token-based CSRF is future work; Origin checks satisfy ADR-0004 for now.

## Risk areas

- Threshold test needs live PostgreSQL (401s require the users table) — skips
  honestly, runs in CI. Cooldown-over-time proven at unit level (manual clock).
- Shared backend dist singleton for the test seam: specs reinstall doubles per
  file (setup default + per-test overrides + afterAll restore).

## Verification (exact results, agent host 2026-10-15)

- Backend unit 28/28; web unit 4/4.
- API 27/27 green (403 wrong-origin, 503 outage, safe headers live; threshold
  skips w/o DB, live in CI).
- Workspace `build` + `typecheck` + `lint` green.

## Learner notes

- Naive: count-then-decide in two Redis round-trips → race overshoot; one Lua
  script makes check+consume atomic (caught conceptually; unit fake mirrors it).
- Naive: fail-open on Redis outage ("keep login up") → brute force unblocks
  exactly when infra is weakest; 503-fail-closed proven by test.
- Naive: trust X-Forwarded-For for IP keys → spoofable budgets; socket IP used.
- Survives restart: nothing (counters are TTL windows by design). DB sessions
  unaffected by limiter state.

## Independent review report

**Pending** — distinct model in a fresh session unavailable here. Nothing merged
to `main`/`dev`; merge/release gates stay closed until review completes.
