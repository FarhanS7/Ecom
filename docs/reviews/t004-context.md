# Review context — T004: Define the minimal Docker profile

Branch: `feature/platform/t004-define-the-minimal-docker-profile` (commit `4fb97cc`).

## Changed files

- `infra/compose.yml` (canonical; task-mandated filename)
- `scripts/dev-infra.mjs` + root `pnpm infra:up|jobs|ps|down|reset`
- `docs/operations/local-measurements.md` (new; honest run log)
- `.env.example` (additive `POSTGRES_*`), `docs/operations/toolchain.md`
  (Docker section reconciled to `compose.yml`; see below), `tasks/todo.md`

## Behavior

- `core` profile: postgres:16 + evictable redis-cache (no volume, by design).
- `jobs` profile: durable redis-jobs (AOF + volume, port 6380).
- `down` preserves volumes; `reset --confirm` prints the exact project/volumes
  and refuses production targets; reset without `--confirm` refuses.

## Assumptions

- Budgets (768M/192M/256M) are starting points from local-development.md to
  measure and tune, not guarantees. CPU/Docker allocation/disk unknown.
- Toolchain amendment (this task, change control): the T002 toolchain draft
  sketched `infra/compose.yaml` with a `PASSWORD_FILE` and an `all` profile —
  replaced by the reviewed `compose.yml` above. History preserved in git.

## Risk areas

- Compose `config` output renders resolved `POSTGRES_PASSWORD`: demo default only;
  real secrets live in untracked `.env`. Documented here so nobody mistakes
  `config` output as safe to paste.
- No `down -v` path except the guarded reset script — intentional.

## Verification (exact results, agent host 2026-10-14)

- `docker compose --profile core config --services` → `postgres redis-cache`;
  `+jobs` adds `redis-jobs`; no profile → empty (gating proven, telemetry/search
  cannot leak in — they do not exist in the file).
- Full rendered config inspected: env interpolation, memory limits, healthchecks,
  ports, named volumes all correct.
- `node --check scripts/dev-infra.mjs` clean; usage exits 1; `reset` without
  `--confirm` refuses naming exact volumes.
- `pnpm build` + `pnpm typecheck` green workspace-wide.
- **Not run / not claimed:** live `up`, restart sentinel survival, `docker stats`
  — Docker daemon unavailable (`//./pipe/dockerDesktopLinuxEngine` missing).
  Recorded in `local-measurements.md` with exact bench-host commands.

## Independent review report

**Pending** — distinct model in a fresh session unavailable here. Nothing merged
to `main`/`dev`; merge/release gates stay closed until review completes.
