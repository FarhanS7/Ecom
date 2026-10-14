# CI evidence (T008)

Workflow: `.github/workflows/ci.yml` (jobs `gates` → `integration`, serialized).
Runners: `ubuntu-latest` (service containers for PostgreSQL/Redis; the same
pnpm scripts run on the Windows host per `docs/operations/commands.md`).

## Happy workflow (agent host, 2026-10-14)

Exact command: `pnpm check` (= `typecheck` + `lint` + `test`), plus `pnpm build`
and `pnpm test:integration` separately. Results:

- `pnpm typecheck` — 6/6 workspace projects, exit 0.
- `pnpm lint` — zero problems (first run: 91 findings across stubs, unused
  imports, and missing type-aware project coverage; all fixed honestly — no
  rule weakened, no inline disables except one justified
  `no-empty-object-type` on the postgres.js row generic).
- `pnpm build` — all projects incl. Next.js static/dynamic routes, exit 0.
- `pnpm test` — backend 9/9; empty packages exit 0 via explicit
  `passWithNoTests` (declared, not hidden).
- `pnpm test:integration` — backend 3/3 (2 skip without infra), api 10/10.
- `pnpm openapi` + `git diff --exit-code docs/openapi.json` — clean (CI repeats this).

## Failing-fixture rehearsal (gate proven red)

- Branch `test/ci-failing-fixture` (created, then deleted — never merged).
- Fixture: `packages/backend/src/platform/ci-fixture-fail.test.ts`,
  `expect('gate').toBe('red')`.
- Result: `pnpm test` → **1 failed, 9 passed, exit 1**. The gate fails loudly;
  branch deleted afterwards (`git branch -D`), fixture file removed.
- Workflow YAML itself validated locally: parsed with the `yaml` package
  (`jobs: gates,integration`); the parse caught and fixed a `#`/`//` comment
  typo before commit.

## Not executed here (declared, not claimed)

- GitHub Actions run: no runner access from this environment. The workflow runs
  on first push/PR to `dev`/`main`; results will be linked here then.
- Live-DB backend assertions in CI: covered by the `integration` job's
  postgres service + `pnpm db:migrate`; the job additionally fails on any
  `SKIP:` line so silent skipping cannot pass.
- Playwright e2e in CI: arrives with later milestones (needs browsers + full
  stack); the `shell.spec.ts` exists for the bench host.

## Credentials and scope

- CI env carries dummy shape-valid values only (32+ char test strings,
  loopback URLs). No step echoes environment; app errors are redacted by
  construction (proven T003/T005/T006). The openapi script secret-scans the
  generated document before writing.
- Downloaded references never run: `pnpm list -r --depth -1 --parseable`
  lists exactly root + 6 workspace projects (api, web, worker, backend,
  config, contracts) — no `skills/` entry. The workflow repeats this as its
  first scope-guard step.
- Artifacts: `docs/openapi.json` only, `retention-days: 7` (scoped).

## Config-file rationale (expected files)

- `jest.config.ts` (task-suggested): **not created**. Implementation
  standardizes on vitest (T002–T006: 14 spec/config files, all green);
  introducing Jest now would duplicate the runner for zero behavior gain.
  `docs/operations/commands.md` updated to match reality (change control).
- Root `vitest.config.ts` (task-suggested): **not created**. Package-level
  configs + `pnpm -r` scripts are the proven mechanism (`pnpm check` above);
  a root config would shadow them. Revisit if cross-package orchestration
  needs it.
- Root `playwright.config.ts`: created in T007 (the spec needed it to run);
  T008 references it, CI runs it in a later milestone.
