# Review context — T003: Create the database migration harness

Branch: `feature/platform/t003-create-the-database-migration-harness` (commit `012fa97`).

## Changed files

- `db/drizzle.config.ts` (fixed paths; generate-only, no hard env dependency)
- `db/migrations/0000-bootstrap.sql` (reviewed: pgcrypto, `migration_probe`, idempotent sentinel)
- `packages/backend/src/db/schema.ts` (Drizzle source of truth, probe only)
- `packages/backend/src/platform/database.ts` (harness: redacted config errors, ordered/tracked/idempotent runner)
- `packages/backend/src/db/migrate.ts` (`pnpm db:migrate` entry)
- `packages/backend/tests/integration/migrations.spec.ts` (canonical location; task
  suggested root `tests/` but package-colocated per repo layout — recorded in commit)
- `.env.example`, backend `platform/database` export, vitest unit/integration configs,
  `tsconfig.typecheck.json`, `.gitignore` (`.next/`)

## Behavior

`runMigrations(sql, dir)` applies `*.sql` in lexicographic order, one transaction
per file, skips recorded files (twice-safe). `requireDatabaseUrl()` throws
`DatabaseConfigError` with redacted text on missing/malformed credentials.

## Assumptions

- Additive migrations only; domain tables arrive in owning tasks (data-model note).
- `__shopscale_migrations(filename PK)` is the tracking table; pre-harness
  databases are adopted (existing `migration_probe` preserved, file recorded once).

## Risk areas

- Runner executes raw SQL files: files must be reviewed before commit (enforced by
  convention + `db:generate` flow, not by code). A malicious/typo'd migration runs
  with migration privileges — same trust level as any committed code.
- One transaction per file (not whole batch): intentional, so retry resumes after
  the last recorded file. Partial-batch state is visible in the tracking table.

## Verification (exact results, agent host 2026-10-14)

- `pnpm build`, `pnpm typecheck` — green workspace-wide.
- Backend `test:integration` — **3 passed**: missing-credentials redacted error
  asserted (`/redacted/`, `not.toMatch(/postgres:\/\//)`); empty-DB migrate +
  twice-safe rerun **skipped** (no DATABASE_URL); pre-harness upgrade **skipped**
  (DB unreachable). Docker daemon unavailable here; live-DB proof deferred to
  infra availability (T004) and re-run then.
- `pnpm db:migrate` with empty `DATABASE_URL` — redacted error, exit 1, no secret.

## Checkpoint (todo.md requires one after T003)

T001–T003 form the first checkpoint trio: planning reviewed (T001), workspace
builds (T002), migration harness unit-verified without infra (T003). Live-DB
proof and Docker profile are T004's scope. No blocking findings; two honest
pendings: live-DB migration run, independent review.

## Independent review report

**Pending** — distinct model in a fresh session unavailable here. Nothing merged
to `main`/`dev`; merge/release gates stay closed until review completes.
