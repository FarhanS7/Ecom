# Review context — T016: Storefront channels and themes

Branch: `feature/stores/t016-storefront-channels-and-themes`
(parent task; linked subtasks T016a/T016b per the scope rule).

## Changed files

T016a (`586f62c`): `db/migrations/0004-themes.sql`, `contracts/channel.ts`
(closed token set), backend `channel.service.ts` + `theme.service.ts`,
drizzle additions, `theme.test.ts` (13 injection shapes).
T016b (this commit): api `channel.controller.ts` (public channel read),
`app.module.ts`, web `stores/[slug]/layout.tsx` + `page.tsx`, `tests/e2e/
store-theme.spec.ts` (not-run here, declared), `scripts/openapi.mjs` (path
list), `docs/openapi.json` (+1 path), web `tsconfig.json` (drop
`@shopscale/*`→src mapping), `tasks/todo.md`.

## Behavior

- `GET /v1/stores/{slug}`: active store → validated theme; unknown, malformed,
  pending, suspended → generic 404. Malicious theme rows serve DEFAULT_THEME.
- Storefront pages render server-side theme variables; unknown slugs hit
  Next `notFound()`; pages are `force-dynamic` (no frozen build-time state).
- Channel always derives from the path server-side; bodies never select stores.

## Assumptions

- No theme write path yet (T068 owns editing + validation-at-write); T016
  proves read + validation + fallback. No logo assets (T035 media).
- No migration content seeds: verification fixtures go through real flows/SQL
  on the bench host, not baked rows.
- e2e needs browsers + infra: written, not run here.

## Risk areas

- Web `@shopscale/*`→src mapping broke Next's rootDir (source pulled into the
  app program): removed; dist is the target (builds always precede web builds
  in CI `gates` order — build runs workspace-wide first).
- Theme fallback unit uses stub sql (no DB); row-level fallback also covered
  by the backend integration spec (live in CI).

## Verification (exact results, agent host 2026-10-15)

- Backend unit 36/36 (incl. injection table + stub fallback); integration
  honest skips.
- Web `build` (new `/stores/[slug]` dynamic route) + `typecheck` + unit green.
- API gates green. `pnpm openapi` clean (20 paths).
- Live curl/e2e battery: PENDING bench host (no DB/browsers here) — declared,
  with exact slugs + expectations in the specs.

## Learner notes

- Naive: render theme JSON into style attributes → CSS/HTML injection; closed
  zod set + fallback; caught by 13-shape rejection table.
- Naive: `WHERE slug = $body.slug` or trusting a `store_id` param → cross-store
  render; path-derived + active-only resolution; unknown/suspended → null.
- Naive: static prerender of themed pages → frozen/misleading state; dynamic.
- Survives restart: themes/content/stores (PostgreSQL).

## Independent review report

**Pending** — distinct model in a fresh session unavailable here. Nothing merged
to `main`/`dev`; merge/release gates stay closed until review completes.
