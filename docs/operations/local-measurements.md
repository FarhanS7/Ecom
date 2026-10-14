# Local measurements (T004)

Resource policy: Windows + Docker Desktop share 8 GB total RAM. CPU, Docker
memory allocation, and free disk are **unknown** in this workspace (hardware
query denied per local-development.md). Budgets below are starting points to
measure and tune, not guarantees.

## Machine under test

| Fact | Value | Source |
| ---- | ----- | ------ |
| OS | Windows (native Node) / Docker Desktop Linux containers | local-development.md |
| Total RAM | 8 GB | confirmed decision D-009 |
| CPU / Docker allocation / free disk | unknown | hardware query denied; fill in on the bench host |
| Node | v22.17.1 | `node --version` (agent host, 2026-10-14) |
| Compose file | infra/compose.yml | T004 |

## Container budgets (starting points)

| Service | Image | Memory limit | Persistence |
| ------- | ----- | ------------ | ----------- |
| postgres | postgres:16-alpine | 768M | `shopscale_pgdata` (durable) |
| redis-cache | redis:7-alpine | 192M (maxmemory 128mb, allkeys-lru) | none (evictable by design) |
| redis-jobs (`jobs` profile) | redis:7-alpine | 256M (AOF on) | `shopscale_jobsdata` (durable) |

## Run log

### 2026-10-14 — agent environment (this session)

- Command: `node scripts/dev-infra.mjs up` (via `pnpm infra:up`)
- Outcome: **not run — Docker daemon unavailable** in this environment
  (`docker ps` → `open //./pipe/dockerDesktopLinuxEngine: The system cannot
  find the file specified`). Same for `docker stats`; no memory peaks to
  record here.
- Sentinel survival check (restart containers → `migration_probe` row still
  exactly 1): **pending** — requires Docker Desktop with Linux containers.
- T003 integration suite in this env: redacted-error test passed; the two
  live-DB tests skip with `SKIP: ... start infra first (T004)`.

### How to record a real run (bench host with Docker Desktop)

```powershell
pnpm infra:up
docker compose -f infra/compose.yml -p shopscale ps
pnpm db:migrate
# sentinel write happens in migration 0000-bootstrap.sql; verify:
# docker compose -f infra/compose.yml -p shopscale exec postgres psql -U shopscale -d shopscale -c "SELECT count(*) FROM migration_probe;"
node scripts/dev-infra.mjs down
pnpm infra:up
# re-run the SELECT: expect count = 1 (survived restart, volumes preserved)
docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}"
```

Paste the `docker stats` output and the two sentinel counts into a dated
section below. A reduced smoke run is not a Tier L pass; scale evidence
belongs to T079–T084 with its hardware manifest.
