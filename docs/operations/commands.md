# Proposed command contracts

These commands are **not runnable yet**. T002–T008 implement the tooling, and later tasks add their commands/tests. The current workspace has documentation and a visual reference only.

Use pnpm scripts as the portable Windows entry point. Optional Make targets wrap the same scripts for environments with Make; do not require Make on Windows.

| Command | Planned behavior / availability |
| --- | --- |
| pnpm install --frozen-lockfile | Install pinned workspace; lockfile created T002 |
| pnpm infra:up | Start core Compose services and wait for health, T004 |
| pnpm infra:jobs | Start jobs Redis, T029 |
| pnpm infra:down | Stop this project's services without deleting volumes, T004 |
| pnpm db:migrate | Apply reviewed migrations, T003 |
| pnpm seed --size s --seed 42 | Deterministic seed; early catalog in T028, complete tiers T077 |
| pnpm seed:verify | Verify counts/FKs/distributions/ledger, T028/T077 |
| pnpm dev:api / dev:web / dev:worker | Start the selected host process; separate terminals |
| pnpm lint / typecheck / build | Check only app workspace code; lint arrived T008 |
| pnpm test | Unit suites per package (vitest, explicit passWithNoTests where empty), T008 |
| pnpm test:unit | Focused unit suites per package, T008 |
| pnpm test:integration | Real service tests, serial by default on this host, T008 onward |
| pnpm test:e2e | Playwright against isolated seeded application (spec exists T007; CI wiring later) |
| pnpm openapi | Regenerate + validate docs/openapi.json from built dist, T006 |
| pnpm test:security | Permission matrix + isolation/security regressions, T074 |
| pnpm loadtest --scenario browse --size l | k6 threshold run with environment manifest, T079 |
| pnpm bench:queries | Controlled query-plan experiments, T078 |
| pnpm search:reindex | Version-aware shadow projection rebuild, T034 |
| pnpm backup:rehearse | Backup/restore into isolated target, T085 |
| pnpm release:check | Clean-build/migration/health/evidence gates, T086 |

## Focused examples after implementation

```powershell
pnpm --filter @shopscale/backend exec vitest run --config vitest.integration.config.ts tests/integration/checkout.spec.ts
pnpm exec playwright test tests/e2e/checkout.spec.ts --workers=1
pnpm exec vitest run apps/web/src/components/ui.test.tsx
```

Vitest runs unit, integration, and frontend component tests (one runner by
T002–T006 implementation decision; the planning-era Jest split is superseded —
see ci-evidence.md rationale). Exclude backend/frontend files from each other's
suites via package configs. Playwright runs against the configured test server
and seed; it must not mutate a production host.

At T002/T008, add and test all initial package script definitions plus test-runner include/exclude rules. Later task completion requires its command to exist and be documented here. The exact implementation command and output go in evidence, not a retroactive claim that today's plan was executed.
