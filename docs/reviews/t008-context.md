# Review context — T008: Initial CI gates

Branch: `feature/platform/t008-add-initial-continuous-integration-gates`.

## Changed files

- `eslint.config.js` (new; two-tier: type-aware for tsconfig sources, plain
  for tests/tooling) + root `lint` script + `"type": "module"` + devDeps
  (`eslint@8`, `typescript-eslint`, `globals`, `@eslint/js@8`, `yaml`).
- 10 backend stub ports converted `async` → explicit `Promise.resolve/reject`
  (codemod script created, run, deleted); platform `Transaction` branded,
  `unitOfWork`/`auditWriter`/redis-check de-asyncified; worker shutdown sync;
  api `app.module`/`problem.filter` cleanups; seed `_random` reservation.
- `.github/workflows/ci.yml` (new; `gates` → `integration(serialized)`).
- `docs/operations/ci-evidence.md` (new; happy run, failing rehearsal, scope,
  credential, and config-rationale records).
- `docs/operations/commands.md` (vitest reconciliation), `docs/operations/toolchain.md`
  (lint arrived; husky not activated), `docs/reviews/milestone-0-context.md`,
  `tasks/todo.md` (T008 + checkpoint).

## Behavior

- `pnpm lint` green (first run: 91 findings, all fixed without weakening).
- CI gates typecheck/lint/build/unit, then integration with real postgres+redis
  services, `db:migrate`, a no-SKIP guard, and an openapi drift check.
- Scope guard fails the run if `skills/` enters the workspace graph.

## Assumptions

- Runners are `ubuntu-latest` (service containers); same pnpm scripts as Windows.
- CI env uses dummy shape-valid values only; nothing echoes environment.
- Playwright e2e in CI arrives with later milestones (not faked).
- Root `vitest.config.ts` / `jest.config.ts` deliberately absent — package
  configs + `pnpm -r` are the proven mechanism; vitest-only runner decision
  recorded in ci-evidence.md.

## Risk areas

- First GitHub Actions run not yet observed (no runner access here).
- Live-DB backend assertions execute first in CI, not locally (no Docker here).
- `varsIgnorePattern: '^_'` and one justified inline disable are the only
  softened edges; both documented at their sites.

## Verification (exact results, agent host 2026-10-14)

- `pnpm check` (typecheck+lint+test), `pnpm build`, `pnpm test:integration`
  — all green (backend 9, api 10, migration 3 with honest skips).
- Failing rehearsal on `test/ci-failing-fixture` (deleted): 1 failed / 9
  passed, exit 1 — gate proven red.
- `pnpm list -r --depth -1 --parseable` — exactly root + 6 projects, no skills.
- Workflow YAML parsed locally (`jobs: gates,integration`); parse caught a
  comment typo pre-commit.

## Learner notes

- Naive: `async` stubs without `await` ("harmless") → hides missing
  implementations from reviewers and trips `require-await`; caught by lint.
- Naive: one lint tier for everything → projectService crashes on files
  outside tsconfigs; fixed by tiering (tsc still checks tests separately).
- Naive: CI without services + skip-tolerant suites → green-but-empty;
  caught by the no-SKIP guard + real `db:migrate` step.
- Survives restart: CI config is stateless; artifacts retained 7 days (scoped).

## Independent review report

**Pending** — distinct model in a fresh session unavailable here. Nothing merged
to `main`/`dev`; merge/release gates stay closed until review completes.
