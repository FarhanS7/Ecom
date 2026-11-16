def get_tasks():
    return [
        {
            "id": "085",
            "name": "Rehearse Backups and Restoration",
            "status": "PLANNED",
            "goal": "Build automated database backup and restore drill scripts, and verify point-in-time recovery and referential integrity against Tier L dataset.",
            "why": "Proves that disaster recovery procedures are rehearsed and verified, preventing catastrophic data loss.",
            "requirements": ["G6", "PRD Section 1.2", "PRD_TO_TASKS_FRAMEWORK Phase 4"],
            "blocked_by": ["TASK-077"],
            "blocks": ["TASK-086", "TASK-087"],
            "architecture": ["ARCHITECTURE.md -> Operations", "docs/operations/backup-restore.md"],
            "skills": [
                {
                    "name": "ci-cd-and-automation",
                    "location": "skills/agent-skills-main/skills/ci-cd-and-automation/SKILL.md",
                    "why": "Governs backup automation and automated recovery verification scripts.",
                    "instructions": ["Use pg_dump with custom format (-Fc)", "Verify row count and FK checksums after restore"]
                }
            ],
            "inspect_files": [
                "scripts/backup.sh",
                "scripts/restore.sh",
                "packages/backend/src/db/seed/verify.ts"
            ],
            "current_behavior": "Not implemented. No automated database backup or restore rehearsal scripts exist.",
            "required_behavior": "Script 'pnpm db:backup' dumps PostgreSQL database to compressed archive; 'pnpm db:restore' restores to fresh instance; 'pnpm seed:verify' proves 100% data integrity and row count parity.",
            "contracts": "CLI commands: pnpm db:backup, pnpm db:restore [archive-path].",
            "commands": [
                "Author scripts/backup.sh using pg_dump with gzip compression and custom directory format.",
                "Author scripts/restore.sh using pg_restore with clean database drop and parallel workers.",
                "Execute backup against Tier L seeded instance.",
                "Drop database and execute restore script.",
                "Run pnpm seed:verify asserting zero orphan rows and identical checksums.",
                "Document rehearsal duration and recovery steps in docs/operations/backup-restore.md."
            ],
            "data_changes": "None in schema; exercises full database export and import.",
            "security": "Backup files encrypted or stored with strict file system permissions (600).",
            "error_handling": "Restore script halts immediately if checksum mismatch is detected.",
            "edge_cases": [
                "Restoring database while active connections are open (restore script terminates existing connections prior to drop)"
            ],
            "observability": "Backup archive size and restore duration metrics.",
            "unit_tests": ["None."],
            "integration_tests": [
                "tests/integration/backup-restore.spec.ts (create test database; backup; restore; assert identical table row counts)"
            ],
            "e2e_tests": ["None."],
            "security_tests": ["None."],
            "manual_verification": "Execute 'pnpm db:backup && pnpm db:restore'; verify database tables remain completely intact with seed verification script.",
            "risk_level": "MEDIUM",
            "review_requirements": "Single thorough review pass focusing on clean database connection termination and checksum verification. Documented in docs/reviews/t085-context.md.",
            "commit": "feat(ops): implement automated postgres backup and disaster recovery restore scripts"
        },
        {
            "id": "086",
            "name": "Prepare Demo Deployment and Rollback",
            "status": "PLANNED",
            "goal": "Author production deployment packaging (docker-compose.prod.yml), environment variable contracts, and documented rollback triggers.",
            "why": "Fulfills PRD_TO_TASKS_FRAMEWORK Phase 4 (Deployment & Release) and ensures predictable, reversible deployment.",
            "requirements": ["G6", "PRD_TO_TASKS_FRAMEWORK Phase 4"],
            "blocked_by": ["TASK-004", "TASK-085"],
            "blocks": ["TASK-087", "TASK-090"],
            "architecture": ["ARCHITECTURE.md -> Deployment", "docs/production/deployment.md"],
            "skills": [
                {
                    "name": "shipping-and-launch",
                    "location": "skills/agent-skills-main/skills/shipping-and-launch/SKILL.md",
                    "why": "Governs production release procedures, container packaging, and rollback plans.",
                    "instructions": ["Define explicit rollback trigger conditions", "Ensure migrations run before new containers boot"]
                }
            ],
            "inspect_files": [
                "infra/compose.prod.yml",
                "Dockerfile",
                ".env.example"
            ],
            "current_behavior": "Only development compose.yml exists; production containerization and rollback playbooks are unwritten.",
            "required_behavior": "docker-compose.prod.yml boots production-optimized containers (Fastify API, Next.js standalone, BullMQ worker, Postgres, Redis); rollback trigger written down before deployment.",
            "contracts": "Production Compose profile in infra/compose.prod.yml.",
            "commands": [
                "Author production Dockerfiles with multi-stage builds for apps/api, apps/web, and apps/worker.",
                "Build infra/compose.prod.yml with restart: always, logging rotation, and healthchecks.",
                "Write migration pre-deploy step: run pnpm db:migrate before starting API containers.",
                "Document concrete rollback triggers: error rate > 0.5% for 2 consecutive minutes or failed healthchecks.",
                "Document rollback procedure: redeploy previous container tag; additive migrations guarantee backward compatibility.",
                "Document deployment guide in docs/operations/deployment.md."
            ],
            "data_changes": "None.",
            "security": "Containers run as unprivileged 'node' user; secrets injected strictly through environment variables.",
            "error_handling": "Containers restart automatically upon unexpected exit.",
            "edge_cases": [
                "Failed migration during deploy (aborts deployment before switching traffic to new container versions)"
            ],
            "observability": "Docker health monitoring and container log rotation.",
            "unit_tests": ["Dockerfile syntax and multi-stage build check"],
            "integration_tests": ["Production container boot test"],
            "e2e_tests": ["None."],
            "security_tests": [
                "Assert containers run as non-root user (id -u node == 1000)"
            ],
            "manual_verification": "Execute docker compose -f infra/compose.prod.yml config; verify valid configuration and start demo in production profile.",
            "risk_level": "MEDIUM",
            "review_requirements": "Single thorough review pass focusing on additive-first migration safety and container security. Documented in docs/reviews/t086-context.md.",
            "commit": "feat(ops): author production docker compose packaging and documented rollback plan"
        },
        {
            "id": "087",
            "name": "Complete Runbooks and Operating Drills",
            "status": "PLANNED",
            "goal": "Author operational runbooks for incident response, worker restart, search reindexing, payment webhook reconciliation, and queue drain drills.",
            "why": "Fulfills PRD Goal G6 (Operable: metrics, tracing, structured logs, dashboards, runbook).",
            "requirements": ["G6", "PRD Section 1.2", "PRD_TO_TASKS_FRAMEWORK Phase 5"],
            "blocked_by": ["TASK-034", "TASK-072", "TASK-073", "TASK-085", "TASK-086"],
            "blocks": ["TASK-090"],
            "architecture": ["ARCHITECTURE.md -> Operations", "docs/operations/runbooks.md"],
            "skills": [
                {
                    "name": "documentation-and-adrs",
                    "location": "skills/agent-skills-main/skills/documentation-and-adrs/SKILL.md",
                    "why": "Governs operational runbook structure and disaster recovery playbooks.",
                    "instructions": ["Write copy-pasteable CLI commands for operators", "Include diagnosis and rollback steps for each alert"]
                }
            ],
            "inspect_files": [
                "docs/operations/runbooks.md",
                "infra/prometheus/alerts.yml",
                "docs/operations/commands.md"
            ],
            "current_behavior": "Operating instructions are dispersed across planning documents without standard operational runbooks.",
            "required_behavior": "docs/operations/runbooks.md provides copy-pasteable operator guides for: High Outbox Lag, Failed Webhooks, Stale Search Index, Database Connection Saturation, and Recovery Rehearsals.",
            "contracts": "Authoritative runbooks in docs/operations/runbooks.md.",
            "commands": [
                "Author docs/operations/runbooks.md covering 5 primary operational incidents.",
                "Include Runbook 1: Outbox Relay Lag High (how to inspect unleased rows, restart worker, force poll).",
                "Include Runbook 2: Webhook Signature Failure Storm (how to diagnose secret mismatch, replay quarantined events).",
                "Include Runbook 3: Search Projection Drift (how to run zero-downtime full reindex safely).",
                "Include Runbook 4: Database Connection Starvation (how to inspect pg_stat_activity, kill idle locks).",
                "Include Runbook 5: Payment Reconciliation Failure (how to inspect pending charges, trigger manual reconciliation).",
                "Execute and verify each runbook drill in local environment."
            ],
            "data_changes": "None.",
            "security": "Ensures operators have documented, sanctioned operational procedures without ad-hoc production patching.",
            "error_handling": "Runbooks include step-by-step diagnostic checklists for ambiguous failure modes.",
            "edge_cases": [
                "Operator executing reindex during high checkout traffic (documents how to throttle batch size to 100)"
            ],
            "observability": "References exact Prometheus metrics and log queries for each alert.",
            "unit_tests": ["None."],
            "integration_tests": ["None."],
            "e2e_tests": ["None."],
            "security_tests": ["None."],
            "manual_verification": "Follow Runbook 1 in local shell; execute commands; verify outbox relay status responds as documented.",
            "risk_level": "LOW",
            "review_requirements": "Single review pass focusing on command accuracy and operator clarity. Documented in docs/reviews/t087-context.md.",
            "commit": "docs(ops): complete operational incident runbooks and emergency playbooks"
        },
        {
            "id": "088",
            "name": "Perform Independent Milestone Review",
            "status": "PLANNED",
            "goal": "Execute multi-pass adversarial code review in fresh sessions across critical security, concurrency, and financial modules, resolving all critical/high findings.",
            "why": "Fulfills PRD_TO_TASKS_FRAMEWORK Phase 2.5 (AI Adversarial Review) to guarantee zero unverified AI-generated flaws ship in V1.",
            "requirements": ["G4", "PRD_TO_TASKS_FRAMEWORK Phase 2.5", "Phase 0.5"],
            "blocked_by": ["TASK-074", "TASK-075", "TASK-076"],
            "blocks": ["TASK-089", "TASK-090"],
            "architecture": ["ARCHITECTURE.md", "PRD_TO_TASKS_FRAMEWORK.md -> Phase 2.5"],
            "skills": [
                {
                    "name": "code-review-and-quality",
                    "location": "skills/agent-skills-main/skills/code-review-and-quality/SKILL.md",
                    "why": "Governs adversarial code review methodology and fresh-session evaluation.",
                    "instructions": ["Review with fresh context (never review own code in same turn)", "Focus on concurrency, auth, and data leakage"]
                }
            ],
            "inspect_files": [
                "packages/backend/src/inventory/inventory.service.ts",
                "packages/backend/src/commerce/checkout.service.ts",
                "packages/backend/src/payments/financial-ledger.service.ts",
                "docs/reviews/"
            ],
            "current_behavior": "Individual milestone checkpoints have been reviewed; a unified final milestone audit covering all cross-module interactions is required.",
            "required_behavior": "Adversarial review reports generated in docs/reviews/final-review.md; all CRITICAL and HIGH severity findings resolved with dedicated regression tests.",
            "contracts": "Review report format in docs/reviews/final-review.md.",
            "commands": [
                "Generate comprehensive REVIEW_CONTEXT.md covering all shipped modules.",
                "Execute adversarial review in clean session targeting: Inventory row locking, Payment idempotency, Multi-tenant store scoping, Financial ledger zero-sum balance.",
                "Record findings in docs/reviews/final-review-report.md.",
                "Fix any discovered critical, high, or medium findings in feature branches.",
                "Re-run review cycle until zero critical or high issues remain.",
                "Commit final review approval report."
            ],
            "data_changes": "None in schema unless required by a verified bug fix.",
            "security": "Audits all authentication guards, session management, and CSRF implementations.",
            "error_handling": "All identified edge cases receive regression test coverage.",
            "edge_cases": [
                "Reviewer model hallucinates non-existent defect (documented with code proof in report and dismissed)"
            ],
            "observability": "Review report audit record.",
            "unit_tests": ["Regression tests for all resolved review findings"],
            "integration_tests": ["Full test suite execution"],
            "e2e_tests": ["Full Playwright suite execution"],
            "security_tests": ["Security matrix pass confirmation"],
            "manual_verification": "Review docs/reviews/final-review-report.md; verify zero open CRITICAL or HIGH findings remain.",
            "risk_level": "HIGH",
            "review_requirements": "Requires 3 full adversarial review cycles across distinct fresh sessions. Follow PRD_TO_TASKS_FRAMEWORK Phase 2.5.",
            "commit": "docs(reviews): complete final independent milestone adversarial code review"
        },
        {
            "id": "089",
            "name": "Prepare Portfolio Narrative and Demonstration",
            "status": "PLANNED",
            "goal": "Author authoritative README.md showcase, architectural diagrams, benchmark highlights, demo account credentials, and recording script.",
            "why": "Fulfills portfolio goal: proves senior-level production engineering capabilities to technical recruiters and hiring managers in < 5 minutes.",
            "requirements": ["PRD Section 1.4", "PRD Section 11.3", "PRD_TO_TASKS_FRAMEWORK Phase 5"],
            "blocked_by": ["TASK-084", "TASK-088"],
            "blocks": ["TASK-090"],
            "architecture": ["ARCHITECTURE.md", "README.md"],
            "skills": [
                {
                    "name": "documentation-and-adrs",
                    "location": "skills/agent-skills-main/skills/documentation-and-adrs/SKILL.md",
                    "why": "Governs portfolio README structure, architectural storytelling, and benchmark highlights.",
                    "instructions": ["Explain WHY this architecture was chosen", "Include reproducible one-command setup", "Highlight hardest solved concurrency problems"]
                }
            ],
            "inspect_files": [
                "README.md",
                "ARCHITECTURE.md",
                "docs/benchmarks.md"
            ],
            "current_behavior": "Root README contains placeholder text; portfolio demonstration narrative is unwritten.",
            "required_behavior": "Root README.md is a showpiece document: Mermaid system diagram, key engineering achievements (500-buyer concurrency, idempotency, zero-downtime outbox), benchmark summary table, demo credentials, and quickstart instructions.",
            "contracts": "Authoritative README in README.md.",
            "commands": [
                "Author root README.md with executive overview, architecture diagram, and core achievements.",
                "Embed benchmark comparison table (p95 latencies across S, M, L tiers).",
                "Document demo accounts table with pre-seeded credentials and roles.",
                "Provide one-command quickstart: 'docker compose up -d && pnpm db:migrate && pnpm seed --size s --seed 42 && pnpm dev'.",
                "Include 5-minute video walkthrough outline demonstrating key flows.",
                "Review README against portfolio success criteria."
            ],
            "data_changes": "None.",
            "security": "Clearly states that shared demo credentials are for demonstration only.",
            "error_handling": "Includes troubleshooting section for common Docker port collisions or memory constraints.",
            "edge_cases": [
                "Reviewer running on Windows vs macOS/Linux (provides platform-neutral pnpm commands)"
            ],
            "observability": "Documentation readability score.",
            "unit_tests": ["None."],
            "integration_tests": ["None."],
            "e2e_tests": ["None."],
            "security_tests": ["None."],
            "manual_verification": "Clone repository into fresh directory, follow README quickstart step-by-step; verify app boots and functions in under 2 minutes.",
            "risk_level": "LOW",
            "review_requirements": "Single review pass focusing on clarity, tone, and professional narrative. Documented in docs/reviews/t089-context.md.",
            "commit": "docs(portfolio): author showpiece readme architecture diagrams and demo guide"
        },
        {
            "id": "090",
            "name": "Close Demo and Define Production Handoff",
            "status": "PLANNED",
            "goal": "Perform final validation sign-off, freeze demo baseline, and author production handoff specification in docs/production/roadmap.md.",
            "why": "Cleanly marks the portfolio demo project as completed while defining exact real-money production requirements (Stripe, carriers, taxes).",
            "requirements": ["PRD Section 1.3", "PRD Section 1.4", "PRD_TO_TASKS_FRAMEWORK Phase 5"],
            "blocked_by": ["TASK-084", "TASK-086", "TASK-087", "TASK-088", "TASK-089"],
            "blocks": [],
            "architecture": ["ARCHITECTURE.md", "docs/production/roadmap.md"],
            "skills": [
                {
                    "name": "shipping-and-launch",
                    "location": "skills/agent-skills-main/skills/shipping-and-launch/SKILL.md",
                    "why": "Governs final project sign-off, tagging, and production handoff documentation.",
                    "instructions": ["Tag git release v1.0.0", "Document deferred production dependencies clearly"]
                }
            ],
            "inspect_files": [
                "docs/planning/traceability.md",
                "tasks/todo.md",
                "docs/production/roadmap.md"
            ],
            "current_behavior": "Project is in active development with open tasks.",
            "required_behavior": "All 91 tasks complete or explicitly deferred; all traceability requirements mapped; docs/production/roadmap.md documents transition to real-money platform; git repository tagged v1.0.0.",
            "contracts": "Production roadmap in docs/production/roadmap.md.",
            "commands": [
                "Verify all 91 tasks in implementation/tasks/ have completed statuses or approved deferrals.",
                "Verify all PRD requirements in REQUIREMENT_TRACEABILITY.md are satisfied.",
                "Author docs/production/roadmap.md defining: Live Stripe Integration, Real Shipping Carrier APIs, Multi-Currency Tax Engines (Avalara), and Custom Domain Routing.",
                "Run full test suite: pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e.",
                "Merge dev branch into main branch.",
                "Tag git release: git tag -a v1.0.0 -m 'ShopScale V1.0.0 Portfolio Release'.",
                "Publish final sign-off report."
            ],
            "data_changes": "None.",
            "security": "Ensures no development secrets or temporary test fixtures are flagged for real production use.",
            "error_handling": "Sign-off fails if any automated test, lint, or typecheck check fails.",
            "edge_cases": [
                "Unmet stretch goal (explicitly documented as P2 / Post-V1 in roadmap without blocking release)"
            ],
            "observability": "Final project sign-off report.",
            "unit_tests": ["Full workspace unit test suite (100% green)"],
            "integration_tests": ["Full workspace integration test suite (100% green)"],
            "e2e_tests": ["Full Playwright E2E suite (100% green)"],
            "security_tests": ["Security matrix suite (100% green)"],
            "manual_verification": "Review git status on main branch; verify clean working tree, green CI badge, and v1.0.0 release tag.",
            "risk_level": "LOW",
            "review_requirements": "Final architectural sign-off review. Documented in docs/reviews/t090-context.md.",
            "commit": "release(v1.0.0): close demo project and define production roadmap handoff"
        }
    ]
