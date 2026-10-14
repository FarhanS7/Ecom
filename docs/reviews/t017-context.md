# Review context — T017: Account and recovery screens

Branch: `feature/identity/t017-build-account-and-recovery-screens`
(parent task; linked subtasks T017a/T017b per the scope rule).

## Changed files

T017a (`5a1f4ad` + limiter hardening in the T017b window): gateway POST
support, auth-path allowlist, exact-name cookie rebuild, Set-Cookie
passthrough; `lib/api.test.ts`; ioredis fail-fast (enableOfflineQueue false)
+ quiet error listener (live logs proved 1.4s stalls + unhandled crashes).
T017b (this commit): `features/auth/auth-forms.tsx` + `auth-flows.tsx`
(register/login/reset-request/reset-confirm), `session-panel.tsx`,
`(auth)/layout.tsx`, five pages (login/register/forgot/reset/verify),
`account/page.tsx`, `lib/session-server.ts`, `tests/e2e/account.spec.ts`
(not-run here, declared), `tasks/todo.md`.

## Behavior

- Forms validate client-side, announce server errors (role=alert), keep
  nonsecret input, clear passwords post-submit; success renders links, never
  redirects (zero redirect/router calls in auth UI — loop-freedom structural).
- Verify-email confirms server-side (token never in client state); session
  panel re-syncs without navigation.
- Passwords live in component state only: no localStorage/sessionStorage use
  anywhere in web src (grep-proven, single comment mention).

## Assumptions

- Browser auth flows need live Redis + DB (fail-closed + skips); full click
  journeys await the bench host (e2e written, not run).
- Login/register pages skip the "already logged in" server notice (kept
  client-simple); `/account` is the state surface. No redirects either way.

## Risk areas

- `csrfFetch` posts JSON only; file uploads/multipart arrive with media work.
- Account page without API shows guest state, never an error wall.

## Verification (exact results, agent host 2026-10-15)

- All 6 pages 200 over prod `next start`; gateway login POST reaches API
  (503 fail-closed passthrough byte-identical — proves method/body/status
  proxying); unknown POST 404.
- Greps: zero storage writes; zero redirects in auth UI.
- Web `build` (10 routes) + `typecheck` + unit 6/6 + `lint` green.

## Learner notes

- Naive: tokens in URLs handled client-side → token in history/storage;
  verify confirms server-side, reset token lives in one form state only.
- Naive: login success → router.push('/account') → back-button/race loops;
  links instead of navigation (asserted structurally by grep).
- Naive: persist email in localStorage "for UX" → credential-adjacent data
  at rest; component state only.
- Survives restart: sessions/passwords (API/DB). Browser holds HttpOnly
  cookies it cannot read.

## Independent review report

**Pending** — distinct model in a fresh session unavailable here. Nothing merged
to `main`/`dev`; merge/release gates stay closed until review completes.
