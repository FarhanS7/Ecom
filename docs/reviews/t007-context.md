# Review context — T007: Next.js application shell + gateway

Branch: `feature/platform/t007-create-the-next-js-application-shell`
(parent task; linked subtasks T007a/T007b per the scope rule).

## Changed files

T007a (`d108f25`): `apps/web/src/lib/api.ts` (allowlist, server-only origin,
target validation), `apps/web/src/app/api/[...path]/route.ts` (gateway).
T007b (this commit): `layout.tsx` (landmarks, metadata), `page.tsx`
(force-dynamic server health + `<GatewayProbe/>`), `gateway-probe.tsx`
(client, same-origin only), `tests/e2e/shell.spec.ts` + root
`playwright.config.ts` (config expected by T008; created here so the spec is
runnable — recorded), web `tsconfig.json` (`baseUrl` override: base-relative
paths resolved to the repo root), `apps/api/package.json` + lockfile
(`@fastify/static@7`: first prod boot proved Swagger UI needs it), `tasks/todo.md`.

## Behavior

- `/` renders shell + per-request server health (live ok / readiness degraded
  against a DBlink-less API); client probe exercises the browser path.
- Gateway: allowlisted GET only; `evil → 404`, `extra suffix → 404`,
  `limit=999 → 422`; request IDs echoed; upstream statuses preserved.

## Assumptions

- Cookie/authorization forwarding arrives with identity (T010); documented in
  the route header. Mutations (non-GET) arrive with CSRF work (T013).
- Playwright browsers are NOT installed here: spec written for the bench host,
  marked not-run; HTTP-level evidence below stands in for this environment.

## Risk areas

- Static prerender would freeze build-time health: page is `force-dynamic`.
- `docs` route excluded from the `/v1` prefix alongside health/metrics.
- `passWithNoTests`-style honesty applies: e2e not run here is declared pending.

## Verification (exact results, agent host 2026-10-14)

Prod servers on loopback (API :3001 dist, web :3000 `next start`):
- `GET /` → shell HTML with `api-liveness: ok — API process is alive.`,
  `api-readiness: degraded — A dependency is unavailable.` (DB down: correct)
- `GET /api/v1/ping?limit=5` → 200 `{"pong":true,"limit":5}` (gateway round-trip)
- `GET /api/https:/evil.example` → 404; `/api/v1/ping/extra` → 404;
  `/api/v1/ping?limit=999` → 422
- `x-request-id: curl-probe-9` echoed back through the gateway
- Bundle inspection (`.next/static`): zero hits for the API origin value, all
  three secret canaries, `API_BASE_URL`, or `NEXT_PUBLIC` — in chunks or source
- `next build` + `tsc --noEmit` green. API server log confirms real requests.

## Learner notes

- Naive: client fetches Nest directly (CORS + secret sprawl) → gateway keeps
  one origin; caught by bundle-inspection test (origin must not appear).
- Naive: forward all headers incl. cookies "for later" → session fixation
  surface before auth exists; caught by design (allowlist) + header assertions.
- Naive: static page with build-time health → stale "unreachable" forever;
  caught by `force-dynamic` + fresh-per-request evidence above.
- Survives restart: page state is fetched per request (nothing stored).
  Gateway holds no state. Cache: no caches introduced.

## Independent review report

**Pending** — distinct model in a fresh session unavailable here. Nothing merged
to `main`/`dev`; merge/release gates stay closed until review completes.
