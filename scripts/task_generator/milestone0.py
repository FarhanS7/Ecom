def get_tasks():
    return [
        {
            "id": "001",
            "name": "Review Scope and Proposed Decisions",
            "status": "IMPLEMENTED",
            "goal": "Review and confirm PRD functional scope, architectural ADRs, non-functional targets, and directory layout.",
            "why": "Establishes canonical baseline and prevents architectural churn or conflicting requirements.",
            "requirements": ["G1", "G2", "G3", "G4", "G5", "G6", "ARCH-001"],
            "blocked_by": [],
            "blocks": ["TASK-002", "TASK-003", "TASK-004", "TASK-005", "TASK-006", "TASK-007", "TASK-008"],
            "architecture": ["ARCHITECTURE.md", "DECISIONS.md -> DEC-001, DEC-002"],
            "skills": [
                {
                    "name": "spec-driven-development",
                    "location": "skills/agent-skills-main/skills/spec-driven-development/SKILL.md",
                    "why": "Governs translating ambiguous PRD text into concrete engineering contracts.",
                    "instructions": ["Extract invariants before coding", "Identify open questions as explicit decisions"]
                }
            ],
            "inspect_files": ["01-ecommerce-marketplace-PRD.md", "PRD_TO_TASKS_FRAMEWORK.md", "ARCHITECTURE.md"],
            "current_behavior": "Completed. Scope documented in docs/planning/scope.md and confirmed in docs/planning/confirmed-decisions.md.",
            "required_behavior": "Unambiguous scope boundary separating V1 portfolio demo from deferred production capabilities.",
            "contracts": "Authoritative ADRs DEC-001 through DEC-010.",
            "commands": [
                "Inspect 01-ecommerce-marketplace-PRD.md and PRD_TO_TASKS_FRAMEWORK.md.",
                "Reconcile multi-store vs multi-vendor model into confirmed decisions.",
                "Commit decision records to docs/decisions/."
            ],
            "data_changes": "None.",
            "security": "Enforces tenant isolation and authenticated session boundaries as core architectural rules.",
            "error_handling": "RFC 7807 error model adopted across all HTTP endpoints.",
            "edge_cases": ["Multi-seller basket with mixed shipping rules", "Shared customer account with store staff memberships"],
            "observability": "Decision logs and milestone context records.",
            "unit_tests": ["None — governance and planning task."],
            "integration_tests": ["None."],
            "e2e_tests": ["None."],
            "security_tests": ["None."],
            "manual_verification": "Review docs/planning/confirmed-decisions.md and verify all ADRs align with PRD goals.",
            "risk_level": "LOW",
            "review_requirements": "Reviewed by project lead and documented in docs/reviews/t001-context.md.",
            "commit": "docs(planning): review scope and proposed decisions"
        },
        {
            "id": "002",
            "name": "Establish the TypeScript Workspace",
            "status": "IMPLEMENTED",
            "goal": "Configure pnpm monorepo workspace with apps/ (api, web, worker) and packages/ (backend, contracts, config).",
            "why": "Provides decoupled project boundaries and shared TypeScript compilation rules.",
            "requirements": ["ARCH-001", "PRD Section 3"],
            "blocked_by": ["TASK-001"],
            "blocks": ["TASK-003", "TASK-005", "TASK-006", "TASK-007", "TASK-008"],
            "architecture": ["ARCHITECTURE.md -> System shape", "DECISIONS.md -> DEC-001"],
            "skills": [
                {
                    "name": "ci-cd-and-automation",
                    "location": "skills/agent-skills-main/skills/ci-cd-and-automation/SKILL.md",
                    "why": "Governs monorepo toolchain and package graph configuration.",
                    "instructions": ["Configure strict TypeScript across all workspaces", "Enforce pnpm workspace filters"]
                }
            ],
            "inspect_files": ["package.json", "pnpm-workspace.yaml", "tsconfig.base.json"],
            "current_behavior": "Completed. Monorepo configured with pnpm 9, Fastify/NestJS API, Next.js web, and shared packages.",
            "required_behavior": "Root pnpm build and pnpm typecheck compile all workspaces with zero errors.",
            "contracts": "pnpm-workspace.yaml package paths and tsconfig project references.",
            "commands": [
                "Initialize pnpm monorepo structure.",
                "Configure tsconfig.base.json with strict compiler checks.",
                "Wire packages/backend, packages/contracts, and packages/config into workspace."
            ],
            "data_changes": "None.",
            "security": "Enforces no direct cross-package database imports from apps/web to packages/backend.",
            "error_handling": "Build fails loudly on type errors.",
            "edge_cases": ["Circular package references", "TypeScript version mismatches"],
            "observability": "Workspace compilation logs.",
            "unit_tests": ["package.json scripts validation"],
            "integration_tests": ["Workspace build verification"],
            "e2e_tests": ["None."],
            "security_tests": ["None."],
            "manual_verification": "Run pnpm install && pnpm build. Assert all packages build with code 0.",
            "risk_level": "LOW",
            "review_requirements": "Single independent review pass. Verified in docs/reviews/t002-context.md.",
            "commit": "chore(workspace): establish pnpm workspace and typescript configs"
        },
        {
            "id": "003",
            "name": "Create the Database Migration Harness",
            "status": "IMPLEMENTED",
            "goal": "Set up Drizzle ORM migration runner and schema harness supporting sequential SQL migrations against PostgreSQL.",
            "why": "Ensures reproducible database setup and reviewable additive migrations.",
            "requirements": ["ARCH-003", "PRD Section 8"],
            "blocked_by": ["TASK-002", "TASK-004"],
            "blocks": ["TASK-008", "TASK-009", "TASK-019", "TASK-029", "TASK-037"],
            "architecture": ["ARCHITECTURE.md -> Database Schema", "DECISIONS.md -> DEC-002"],
            "skills": [
                {
                    "name": "test-driven-development",
                    "location": "skills/agent-skills-main/skills/test-driven-development/SKILL.md",
                    "why": "Ensures migration scripts run clean in integration tests.",
                    "instructions": ["Test migrations against real PostgreSQL", "Assert rollback safety"]
                }
            ],
            "inspect_files": ["db/drizzle.config.ts", "packages/backend/src/platform/database.ts", "db/migrations/0000-bootstrap.sql"],
            "current_behavior": "Completed. Drizzle migration runner executes SQL files from db/migrations/ with migration lock.",
            "required_behavior": "pnpm db:migrate runs cleanly against fresh PostgreSQL instance.",
            "contracts": "node-postgres Pool connection and Drizzle client port.",
            "commands": [
                "Configure db/drizzle.config.ts and database connection pool.",
                "Create 0000-bootstrap.sql enabling pgcrypto and pg_trgm extensions.",
                "Write migration runner script in packages/backend/src/db/migrate.ts."
            ],
            "data_changes": "Creates schema migrations lock table and initial extensions.",
            "security": "Database credentials strictly read from validated environment variables.",
            "error_handling": "Throws typed MigrationError on SQL failure and aborts transaction.",
            "edge_cases": ["Concurrent migration runs", "Out-of-order migration filenames"],
            "observability": "Migration execution logs detailing applied SQL files and timestamps.",
            "unit_tests": ["packages/backend/src/platform/database.test.ts"],
            "integration_tests": ["Migration bootstrap test against live PostgreSQL"],
            "e2e_tests": ["None."],
            "security_tests": ["None."],
            "manual_verification": "Run pnpm db:migrate against PostgreSQL container; verify tables and extensions created.",
            "risk_level": "MEDIUM",
            "review_requirements": "Thorough independent review of migration locking. Recorded in docs/reviews/t003-context.md.",
            "commit": "feat(db): create drizzle migration harness and bootstrap migration"
        },
        {
            "id": "004",
            "name": "Define the Minimal Docker Profile",
            "status": "IMPLEMENTED",
            "goal": "Create compose.yml defining lightweight containers for PostgreSQL 16 and Redis 7.",
            "why": "Provides deterministic local dependencies without exhausting host RAM on 8 GB development machines.",
            "requirements": ["PRD Section 3", "ARCH-001"],
            "blocked_by": ["TASK-001"],
            "blocks": ["TASK-003", "TASK-008"],
            "architecture": ["ARCHITECTURE.md -> Environments", "DECISIONS.md -> DEC-009"],
            "skills": [
                {
                    "name": "ci-cd-and-automation",
                    "location": "skills/agent-skills-main/skills/ci-cd-and-automation/SKILL.md",
                    "why": "Governs container orchestration and local dev profiles.",
                    "instructions": ["Keep default profile minimal (<500MB RAM)", "Separate heavy profiles into optional files"]
                }
            ],
            "inspect_files": ["infra/compose.yml", ".env.example"],
            "current_behavior": "Completed. compose.yml boots PostgreSQL 16 and Redis 7 with healthchecks.",
            "required_behavior": "docker compose up -d boots healthy PostgreSQL on 5432 and Redis on 6379.",
            "contracts": "Port mappings: 5432 (PG), 6379 (Redis).",
            "commands": [
                "Create infra/compose.yml defining postgres and redis services.",
                "Configure volume persistence and healthcheck probes.",
                "Document resource limits in .env.example."
            ],
            "data_changes": "None.",
            "security": "Default development passwords documented; production deployment mandates secure override.",
            "error_handling": "Container healthchecks retry 5 times before failing.",
            "edge_cases": ["Port collision with host PostgreSQL/Redis"],
            "observability": "Docker health status indicators.",
            "unit_tests": ["docker compose config validation"],
            "integration_tests": ["Container port readiness check"],
            "e2e_tests": ["None."],
            "security_tests": ["None."],
            "manual_verification": "Execute docker compose up -d; verify postgres and redis report healthy status.",
            "risk_level": "LOW",
            "review_requirements": "Single review pass. Documented in docs/reviews/t004-context.md.",
            "commit": "chore(infra): add minimal docker compose profile for postgres and redis"
        },
        {
            "id": "005",
            "name": "Add Validated Configuration and Health Routes",
            "status": "IMPLEMENTED",
            "goal": "Build @shopscale/config package with Zod environment validation and expose unversioned /health/live and /health/ready endpoints.",
            "why": "Ensures application crashes immediately if environment is invalid and provides container liveness/readiness probes.",
            "requirements": ["ARCH-004", "PRD Section 10"],
            "blocked_by": ["TASK-002"],
            "blocks": ["TASK-006", "TASK-008"],
            "architecture": ["ARCHITECTURE.md -> Configuration", "DECISIONS.md -> DEC-001"],
            "skills": [
                {
                    "name": "security-and-hardening",
                    "location": "skills/agent-skills-main/skills/security-and-hardening/SKILL.md",
                    "why": "Enforces strict validation of secrets and environment variables at startup.",
                    "instructions": ["Fail loudly on missing secrets", "Ensure no secrets leak into logs or client bundles"]
                }
            ],
            "inspect_files": ["packages/config/src/env.ts", "apps/api/src/health/health.controller.ts"],
            "current_behavior": "Completed. Zod validates process.env at boot; /health/live and /health/ready report DB and Redis status.",
            "required_behavior": "App aborts boot if DATABASE_URL or JWT_SECRET is missing; health routes report 200 OK when up.",
            "contracts": "GET /health/live -> { status: 'ok' }; GET /health/ready -> { status: 'ok', checks: { database: 'up', redis: 'up' } }.",
            "commands": [
                "Implement Zod environment schema in packages/config.",
                "Wire config module into NestJS apps/api.",
                "Implement HealthController checking database ping and redis ping."
            ],
            "data_changes": "None.",
            "security": "Health endpoints expose no secrets, passwords, or system environment dumps.",
            "error_handling": "Readiness endpoint returns 503 Service Unavailable if database is unreachable.",
            "edge_cases": ["Database temporarily down during cold boot"],
            "observability": "Structured health check logging with response time.",
            "unit_tests": ["packages/config/src/env.test.ts"],
            "integration_tests": ["apps/api/src/health/health.test.ts"],
            "e2e_tests": ["None."],
            "security_tests": ["Assert health endpoint does not leak secrets"],
            "manual_verification": "Curl http://localhost:3001/health/ready; assert 200 OK with database: 'up'.",
            "risk_level": "LOW",
            "review_requirements": "Single review pass. Documented in docs/reviews/t005-context.md.",
            "commit": "feat(platform): add validated configuration and health endpoints"
        },
        {
            "id": "006",
            "name": "Establish API and Error Conventions",
            "status": "IMPLEMENTED",
            "goal": "Implement RFC 7807 problem details exception filter, typed domain errors, and request ID propagation.",
            "why": "Provides consistent API error responses and end-to-end request tracing across all modules.",
            "requirements": ["PRD Section 10", "ARCH-004"],
            "blocked_by": ["TASK-002", "TASK-005"],
            "blocks": ["TASK-008", "TASK-010", "TASK-018", "TASK-020"],
            "architecture": ["ARCHITECTURE.md -> Error conventions", "docs/architecture/conventions.md"],
            "skills": [
                {
                    "name": "api-and-interface-design",
                    "location": "skills/agent-skills-main/skills/api-and-interface-design/SKILL.md",
                    "why": "Enforces RESTful error contracts and RFC 7807 standards.",
                    "instructions": ["Use typed error codes", "Include requestId in every error payload"]
                }
            ],
            "inspect_files": ["packages/contracts/src/errors.ts", "packages/backend/src/platform/http.ts"],
            "current_behavior": "Completed. Global Fastify error filter converts domain exceptions into RFC 7807 JSON envelopes.",
            "required_behavior": "All thrown exceptions return { type, title, status, detail, code, requestId }.",
            "contracts": "ProblemDetails schema with stable error codes (e.g. NOT_FOUND, VALIDATION_ERROR).",
            "commands": [
                "Define ProblemDetails and DomainError classes in packages/contracts.",
                "Implement Fastify GlobalExceptionFilter in packages/backend.",
                "Add X-Request-Id header middleware generating or propagating correlation IDs."
            ],
            "data_changes": "None.",
            "security": "Internal stack traces are stripped in production mode to prevent information leakage.",
            "error_handling": "Catches unhandled exceptions and maps them to generic 500 Internal Server Error.",
            "edge_cases": ["Malformed JSON request body", "Invalid Content-Type header"],
            "observability": "Logs every 4xx and 5xx error with requestId and actor ID.",
            "unit_tests": ["packages/backend/src/platform/http.test.ts"],
            "integration_tests": ["Error formatting integration test"],
            "e2e_tests": ["None."],
            "security_tests": ["Assert stack traces are not leaked in error responses"],
            "manual_verification": "Send GET /v1/invalid-route; assert RFC 7807 problem JSON returned with 404.",
            "risk_level": "LOW",
            "review_requirements": "Single review pass. Documented in docs/reviews/t006-context.md.",
            "commit": "feat(api): implement rfc 7807 problem details and request id propagation"
        },
        {
            "id": "007",
            "name": "Create the Next.js Application Shell",
            "status": "IMPLEMENTED",
            "goal": "Build Next.js App Router presentation shell with design tokens, layout, header, footer, and same-origin API proxy.",
            "why": "Provides foundation for server-rendered storefronts and interactive client islands.",
            "requirements": ["PRD Section 3", "design.md"],
            "blocked_by": ["TASK-002"],
            "blocks": ["TASK-008", "TASK-016", "TASK-017", "TASK-023"],
            "architecture": ["ARCHITECTURE.md -> Frontend", "docs/architecture/frontend.md"],
            "skills": [
                {
                    "name": "frontend-ui-engineering",
                    "location": "skills/agent-skills-main/skills/frontend-ui-engineering/SKILL.md",
                    "why": "Governs Next.js App Router layout and CSS variable design tokens.",
                    "instructions": ["Keep Server/Client boundaries explicit", "Avoid unnecessary client-side JS"]
                }
            ],
            "inspect_files": ["apps/web/src/app/layout.tsx", "apps/web/src/app/page.tsx", "apps/web/src/app/api/proxy/[...path]/route.ts"],
            "current_behavior": "Completed. Next.js 14 App Router shell with accessible layout and same-origin /api/proxy handler.",
            "required_behavior": "Next.js renders shell with CSS custom properties and proxies requests to Fastify backend.",
            "contracts": "Design token CSS variables (:root tokens in design.md).",
            "commands": [
                "Bootstrap Next.js App Router in apps/web.",
                "Implement root layout with responsive header, main container, and footer.",
                "Build same-origin proxy route forwarding session cookies to NestJS API."
            ],
            "data_changes": "None.",
            "security": "Enforces SameSite cookie handling and forwards only allowlisted client headers.",
            "error_handling": "Renders Next.js error.tsx boundary for unexpected presentation crashes.",
            "edge_cases": ["Backend API offline during Next.js SSR"],
            "observability": "Next.js SSR request logs.",
            "unit_tests": ["apps/web/src/app/layout.test.tsx"],
            "integration_tests": ["apps/web/src/lib/api.test.ts"],
            "e2e_tests": ["tests/e2e/shell.spec.ts"],
            "security_tests": ["Verify proxy forwards only safe headers"],
            "manual_verification": "Visit http://localhost:3000; verify page loads with clean styling and active header.",
            "risk_level": "LOW",
            "review_requirements": "Single review pass. Documented in docs/reviews/t007-context.md.",
            "commit": "feat(web): create nextjs application shell and api proxy"
        },
        {
            "id": "008",
            "name": "Add Initial Continuous Integration Gates",
            "status": "IMPLEMENTED",
            "goal": "Configure GitHub Actions CI workflow running lint, typecheck, unit tests, and build on all branches.",
            "why": "Mechanically prevents broken code, convention violations, or type errors from merging into dev.",
            "requirements": ["PRD_TO_TASKS_FRAMEWORK Phase 1.5"],
            "blocked_by": ["TASK-002", "TASK-003", "TASK-005", "TASK-006", "TASK-007"],
            "blocks": ["TASK-009"],
            "architecture": ["PRD_TO_TASKS_FRAMEWORK.md -> Phase 1.5"],
            "skills": [
                {
                    "name": "ci-cd-and-automation",
                    "location": "skills/agent-skills-main/skills/ci-cd-and-automation/SKILL.md",
                    "why": "Defines automated test execution in CI environments.",
                    "instructions": ["Run fast checks first", "Ensure deterministic pnpm cache"]
                }
            ],
            "inspect_files": [".github/workflows/ci.yml", "package.json"],
            "current_behavior": "Completed. GitHub Actions workflow runs pnpm lint, typecheck, and test on push.",
            "required_behavior": "CI fails on any lint error, TypeScript type mismatch, or test failure.",
            "contracts": "Exit code 0 on green, non-zero on failure.",
            "commands": [
                "Create .github/workflows/ci.yml.",
                "Configure pnpm cache action and Node.js setup.",
                "Add test, lint, and typecheck steps."
            ],
            "data_changes": "None.",
            "security": "Runs in isolated runner with unprivileged permissions.",
            "error_handling": "Build fails loudly with detailed error logs on first failure.",
            "edge_cases": ["Flaky tests due to timer races"],
            "observability": "GitHub Actions run summary.",
            "unit_tests": ["package.json test script check"],
            "integration_tests": ["Local pnpm test execution across all workspaces"],
            "e2e_tests": ["None."],
            "security_tests": ["None."],
            "manual_verification": "Run pnpm lint && pnpm typecheck && pnpm test locally. Assert all exit 0.",
            "risk_level": "LOW",
            "review_requirements": "Single review pass. Documented in docs/reviews/milestone-0-context.md.",
            "commit": "chore(ci): add github actions workflow for lint typecheck and tests"
        }
    ]
