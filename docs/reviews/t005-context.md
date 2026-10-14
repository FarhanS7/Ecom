# Review context — T005: Validated configuration and health routes

Branch: `feature/platform/t005-add-validated-configuration-and-health-routes`
(parent task; split into linked subtasks T005a/T005b per the task's scope rule).

## Changed files

T005a (`fe15e6a`): `packages/config/src/env.ts` (new; schema+validation),
`packages/config/src/index.ts` (re-export only), backend `db/client.ts`
(lazy `getSql`/`getDb`, no import-time side effects), `platform/index.ts`,
`db/seed.ts` (fixed secret leak: logged full DATABASE_URL, now redacted
host/db), `platform/import-time.test.ts` (new, 2 tests), backend
`tsconfig.json` (dropped tsconfig-only `@backend/*` alias for portable
relative `.js` imports), `tsconfig.typecheck.json`.
T005b (this commit): backend `platform/health.controller.ts` (new, Nest-free
logic), api `health.controller.ts` + `health-probe.service.ts` (thin Nest
adapter), `app.module.ts`, `main.ts` (exported `createApp()` factory, guarded
auto-bootstrap, fail-fast), `tsconfig.base.json` (`experimentalDecorators` +
`emitDecoratorMetadata` — required for Nest DI metadata; justifying change
recorded in T005b), api `vitest.*.config.ts` + `tsconfig.typecheck.json`,
`tests/integration/health.spec.ts` + `health-boot.spec.ts`,
`class-validator@0.14.1` + `class-transformer@0.5.1` (were missing;
ValidationPipe called `process.exit(1)` on first real boot — caught by the
new valid-boot test), `passWithNoTests` configs for test-less packages,
worker `vitest.integration.config.ts`, `tasks/todo.md`.

## Behavior

- Missing/malformed secrets stop boot (`createApp` → `getEnv`, redacted).
- `GET /health/live` → 200 `{status:'ok'}` regardless of DB.
- `GET /health/ready` → 200 ok / 503 degraded with per-dependency static
  details; no secrets in any body (asserted).
- Bodies validated against `@shopscale/contracts` health schemas.

## Assumptions

- Stopped DB = closed loopback port (fast refusal); a hung (not refused)
  connection would wait out `connect_timeout` — accepted, documented.
- Swagger setup moved to prod-only `bootstrap()`: its explorer needs
  tsc-emitted metadata that esbuild strips; `/docs` verified in dev/prod.
- Explicit `@Inject()` tokens (not inferred types) drive DI so vitest and tsc
  builds behave identically.

## Risk areas

- `main.ts` auto-bootstrap guard relies on `argv[1]` matching `main.ts|js`;
  exotic launchers (bundled binaries) must keep a `main.*` entry name.
- `passWithNoTests` flags are explicit and listed; T008 revisits real gates.
  `pnpm lint` still unrunnable until T008 (recorded, not claimed).

## Verification (exact results, agent host 2026-10-14)

- `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration` — all green.
- API suite over real Nest+Fastify `inject`: live 200 (×2), ready 503 with
  `checks.database.status: fail`, boot rejection `Invalid configuration:
  DATABASE_URL: Required` — 3/3 passed, bodies schema-validated + secret-free.
- Backend T005a unit 2/2; T003 suite 3/3 unaffected.

## Learner notes (naive implementation / catching test / state)

- Naive: trust `process.env` inline at each call site → inconsistent validation
  and secret-printed logs (seed.ts did exactly this). Caught by: redacted-error
  assertions + `not.toContain(secret)` on every body and the boot message.
- Naive: health computed inside route handlers with try/catch per route →
  divergent semantics; fixed by single backend builders + thin adapter. Caught
  by: contract-schema parse of both endpoints.
- Naive: readiness 200-always (the T002 stub returned `{status:'ok'}`) → outage
  invisible. Caught by: closed-port test asserting 503 + degraded.
- Survives restart: nothing in T005 (health is computed, not stored). Cache-only:
  n/a — no caching introduced.

## Independent review report

**Pending** — distinct model in a fresh session unavailable here. Nothing merged
to `main`/`dev`; merge/release gates stay closed until review completes.
