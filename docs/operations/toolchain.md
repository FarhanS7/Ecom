# Toolchain & Runtime Standards

Status: established during T002; update when versions change.

## Runtime

| Tool | Version | Source |
|------|---------|--------|
| Node.js | 20.11.0+ (LTS) | `.nvmrc` / `volta` / system |
| pnpm | 9.1.0 | `packageManager` in root `package.json` |
| TypeScript | 5.4.5 | Workspace devDependency |

Pin exact versions in CI and local `.nvmrc`/`.tool-versions`.

## Workspace Structure

```
shopscale/
├── apps/
│   ├── api/          # NestJS HTTP API (Fastify)
│   ├── worker/       # Background workers (outbox relay, schedulers, consumers)
│   └── web/          # Next.js App Router (storefronts, dashboards)
├── packages/
│   ├── backend/      # Domain modules, application ports, shared business logic
│   ├── contracts/    # Public API schemas, event contracts (no ORM leakage)
│   └── config/       # Validated configuration, environment parsing
├── db/
│   ├── migrations/   # Versioned SQL (Drizzle-generated, reviewed)
│   └── seed/         # Deterministic seed scripts (Tier S/M/L/XL)
├── tests/
│   ├── integration/  # Real PostgreSQL + Redis (Testcontainers)
│   └── e2e/          # Playwright browser journeys
├── loadtests/        # k6 scenarios
├── infra/            # Docker Compose profiles, telemetry config
├── docs/             # Specifications, ADRs, operations, learning
├── tasks/            # Roadmap, task index, individual task files
└── skills/           # Downloaded references (excluded from workspace)
```

## Package Manifest Conventions

Every workspace package (`apps/*`, `packages/*`, `db/*`) must have:

```json
{
  "name": "@shopscale/<package-name>",
  "version": "0.0.0",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": "./dist/index.js",
    "./package.json": "./package.json"
  },
  "scripts": {
    "build": "tsc -b",
    "typecheck": "tsc --noEmit",
    "lint": "eslint \"src/**/*.ts\"",
    "test": "vitest run",
    "test:unit": "vitest run --reporter=verbose",
    "test:integration": "vitest run --config vitest.integration.config.ts"
  },
  "dependencies": {},
  "devDependencies": {}
}
```

- Use `@shopscale/*` prefix for all internal packages
- Version stays `0.0.0` until production release (changesets manage versioning)
- `exports` field enables `import { x } from '@shopscale/backend'`
- No `files` field — `dist/` is implicit via `main`/`types`

## TypeScript Configuration

### Root `tsconfig.base.json`
- `composite`: false (base only)
- `references`: [] (apps/packages define their own)
- Strict mode enabled with all recommended flags
- `verbatimModuleSyntax`: true (enforces explicit `import type`) — default for
  all packages **except** `@shopscale/backend` (see below)
- `isolatedModules`: true (compatible with esbuild/swc)
- Path aliases: `@shopscale/*` → `packages/*/src`

### Documented exception: `@shopscale/backend` module resolution

`packages/backend` uses `module ESNext` + `moduleResolution Bundler` with
`verbatimModuleSyntax: false`. Reason: the package has 11 intra-package
relative imports (`platform` → `db/client`, …) written with explicit `.js`
extensions (the portable ESM pattern: tsc resolves `.js` → `.ts`, Node runs
the emitted `.js`). The public contract (exports map, `dist/*.d.ts`) is
unchanged. Revisit if the package is split. Recorded T004; history in git.

### App/Package `tsconfig.json` (extends base)
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "tsBuildInfoFile": "./dist/tsbuildinfo",
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "references": [
    { "path": "../../packages/contracts" },
    { "path": "../../packages/config" }
  ]
}
```
- `composite`: true (enables project references, faster incremental builds)
- `references`: explicit dependency graph for typechecking order

## Linting (ESLint)

Status: **arrives with T008 (CI gates)** — specified here, not yet implemented.
`pnpm lint` scripts exist as placeholders; running them today fails (no
ESLint config installed). Do not claim lint gates pass until T008 lands.

- Flat config (`eslint.config.js`) at workspace root
- Extends: `eslint:recommended`, `plugin:@typescript-eslint/recommended-type-checked`, `prettier`
- Parser: `@typescript-eslint/parser` with `projectService: true`
- Rules: disallow `@ts-ignore` without justification comment; enforce explicit return types on public APIs

## Testing

| Layer | Tool | Config |
|-------|------|--------|
| Unit | Vitest | `vitest.config.ts` per package |
| Integration | Vitest + Testcontainers | `vitest.integration.config.ts` (PostgreSQL, Redis) |
| E2E | Playwright | `playwright.config.ts` in `tests/e2e/` |
| Load | k6 | Scripts in `loadtests/` |

- Unit tests: fast, no external deps, mock ports
- Integration tests: real PostgreSQL/Redis via Testcontainers, run in CI
- E2E: full browser journeys against running stack
- Load: k6 against Tier M/L data

## Git Workflow

### Branch Policy
- `main`: protected, only via PR with required checks
- `feature/<module>/<task-id>-<slug>`: short-lived feature branches
- `fix/<module>/<slug>`: bug fixes
- `chore/<slug>`: maintenance

### Commit Convention (Conventional Commits)
```
<type>(<scope>): <subject>

<body>

<footer>
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `build`, `ci`
Scope: module/package name (e.g., `platform`, `identity`, `catalog`, `api`, `web`)

### Required Checks Before Merge
1. `pnpm typecheck` passes (all packages)
2. `pnpm lint` passes (all packages)
3. `pnpm test` passes (unit + integration for changed packages)
4. Build succeeds (`pnpm build`)
5. No `@ts-ignore` without justification comment
6. No `console.log`/`debugger` in source

### Husky Pre-commit
```bash
# .husky/pre-commit
pnpm lint-staged
```
`lint-staged` runs ESLint + Prettier on staged files only.

## Docker / Local Development

Canonical file: `infra/compose.yml` (T004; controlled by `scripts/dev-infra.mjs`).
Default profile is `core` only: PostgreSQL + evictable Redis cache. Search,
telemetry, object storage, and replicas arrive as explicit profiles with their
own tasks — never enabled implicitly on the 8 GB host.

| Service | Image | Profile | Persistence | Memory budget (start) |
| ------- | ----- | ------- | ----------- | --------------------- |
| postgres | postgres:16-alpine | core | `shopscale_pgdata` (durable) | 768M |
| redis-cache | redis:7-alpine | core | none (evictable: maxmemory 128mb, allkeys-lru) | 192M |
| redis-jobs | redis:7-alpine | jobs | `shopscale_jobsdata` (AOF, durable) | 256M |

`down` preserves volumes; only the explicitly named reset action
(`node scripts/dev-infra.mjs reset --confirm`, refused for production targets)
deletes project volumes. Measured peaks go in
`docs/operations/local-measurements.md`.

### Profile Usage
```powershell
pnpm infra:up    # core services, waits for health
pnpm infra:jobs  # core + jobs Redis for worker lessons
pnpm infra:ps    # service status
pnpm infra:down  # stop, volumes preserved
```

## Database Tooling (Drizzle)

- Config: `db/drizzle.config.ts` (generate only; runtime uses the reviewed runner)
- Migrations: `db/migrations/` (reviewed SQL, not auto-pushed)
- Runner: `packages/backend/src/platform/database.ts` + `src/db/migrate.ts`
- Commands:
  ```bash
  pnpm db:generate   # Generate migration from schema changes (review before commit!)
  pnpm db:migrate    # Apply reviewed migrations via the harness
  pnpm db:seed       # Seed deterministic data (SIZE=s|m|l|xl SEED=42)
  ```

## CI Pipeline (GitHub Actions)

```yaml
# .github/workflows/ci.yml
on: [push, pull_request]
jobs:
  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck

  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint

  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env: { POSTGRES_DB: shopscale, POSTGRES_USER: shopscale, POSTGRES_PASSWORD: shopscale }
        ports: [5432:5432]
        options: --health-cmd="pg_isready" --health-interval=10s
      redis:
        image: redis:7-alpine
        ports: [6379:6379]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install --frozen-lockfile
      - run: pnpm test

  build:
    runs-on: ubuntu-latest
    needs: [typecheck, lint, test]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
```

## Version Management

- Node: `.nvmrc` (e.g., `v20.11.0`)
- pnpm: `packageManager` in root `package.json` (`pnpm@9.1.0`)
- Dependencies: pinned in `pnpm-lock.yaml`; update via `pnpm update --interactive`
- No `^` or `~` ranges in `package.json` dependencies — exact versions only

## Evidence for T002

Commands to verify workspace setup:
```bash
# 1. Clean clone
git clone https://github.com/FarhanS7/Ecom.git
cd Ecom

# 2. Install
pnpm install --frozen-lockfile

# 3. Verify skills/ is excluded
pnpm -r --filter=./skills/** list  # Should return nothing / error

# 4. Typecheck (empty — no source yet, but config valid)
pnpm typecheck

# 5. Lint (empty — no source yet, but config valid)
pnpm lint

# 6. Build (empty — no source yet, but config valid)
pnpm build
```

Expected: All commands exit 0. No packages under `skills/` participate in workspace commands.