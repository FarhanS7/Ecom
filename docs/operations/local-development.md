# Windows and Docker Desktop development

Confirmed environment: Windows, Docker Desktop, 8 GB system RAM. CPU, WSL backend status, free disk, and Docker allocation are unknown. The hardware query was denied; no elevated access is required to follow this plan.

## Proposed everyday setup

Run the Nest API, Next.js dev server, and one worker on the host. Docker runs PostgreSQL and Redis cache. Add a separate Redis jobs container when asynchronous work begins. Start with Tier S and one test/browser worker.

Illustrative starting container budgets, to measure and tune: PostgreSQL 512–768 MiB; cache Redis 128 MiB; jobs Redis 128–256 MiB. These are container limits, not a promise of total process/VM memory. Account for Docker/WSL overhead, Windows, editor, browsers, and Node builds. Do not blindly allocate all 8 GB to Docker.

## Profiles

| Profile | Services | When |
| --- | --- | --- |
| core | PostgreSQL + cache Redis | Everyday feature development |
| jobs | separate Redis jobs + host worker | Outbox, search projection, checkout effects |
| storage | S3-compatible local object storage | Uploads, thumbnails, invoices |
| observe | collector, Prometheus, Grafana, trace backend | Focused instrumentation lessons |
| search | OpenSearch | Engine comparison after SQL baseline |
| replica | PostgreSQL replica | Replication/reporting experiment |
| demo | production builds, proxy, required services | Deployment rehearsal |
| benchmark | explicit measured service set | Tier L run; never enabled implicitly |

A feature test requiring an omitted service must say “not run: dependency profile disabled,” not pass with silently mocked infrastructure.

## Setup sequence during implementation

1. Confirm Docker Desktop starts Linux containers. Check backend settings; do not assume WSL2 is installed.
2. Pick one Node development environment (Windows native or WSL2). Do not mix node_modules between Windows and Linux.
3. Pin runtime/package versions in T002 after compatibility checks; install workspace only.
4. Copy .env.example to an ignored local environment file and generate fresh demo secrets.
5. Start core services, wait for health, run migrations and Tier S seed.
6. Start API/web, then worker/jobs profile for lessons requiring jobs.
7. Measure peak memory during build, integration test, and browser run separately. Record allocation and peaks in local-measurements.md at T004.

If using WSL2, keep the project and dependencies in the same filesystem/environment chosen for Node; moving this workspace is a separate user action, not part of the plan. Docker documents WSL integration and memory behavior in [its Windows guide](https://docs.docker.com/desktop/features/wsl/).

## Environment contract

Proposed keys: NODE_ENV, PORT, DATABASE_URL, REDIS_CACHE_URL, REDIS_JOBS_URL, APP_ORIGIN, JWT_SIGNING_SECRET, REFRESH_TOKEN_PEPPER, CSRF_SECRET, MOCK_PAYMENT_URL, MOCK_WEBHOOK_SECRET, STORAGE_ENDPOINT, STORAGE_BUCKET, STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY, OTEL_EXPORTER_OTLP_ENDPOINT, SEED.

Validate URL schemes/lengths, allowed origins, required service-specific settings, and secret presence at startup. STORAGE settings are required only for enabled media/document capability, not for the earliest shell. Never prefix secrets with NEXT_PUBLIC_. Separate test/dev/demo databases and storage buckets.

## Stop, restart, reset

Normal stop preserves volumes. Reset requires an explicitly named local-demo command that prints the exact project/database/volume target and refuses production/shared targets. A “clean startup” must never mean deleting arbitrary Docker volumes. No reset or installation is performed by this documentation task.
