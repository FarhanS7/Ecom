# Resource provenance and use

Reviewed for this plan on 2026-09-29. Original files were not edited. Downloaded repositories are reference material, not application dependencies and not automatically installed capabilities.

## Local project sources

| Resource | Use in plan |
| --- | --- |
| [Marketplace PRD](../../01-ecommerce-marketplace-PRD.md) | Functional IDs, invariants, SLOs, seeds, evidence and module scope |
| [Design specification](../../design.md) | Tokens, bento components, responsive/accessibility behavior, tenant content |
| [Task framework](../../PRD_TO_TASKS_FRAMEWORK.md) | Sanity review, one-time architecture, small tasks, commits, independent review and learning |
| [HTML reference](../../tm.html) | Visual reference only; static placeholder actions are not acceptance evidence |

## Downloaded collections

| Collection | Intended use | Boundary |
| --- | --- | --- |
| [Agent Skills](../../skills/agent-skills-main/README.md) | Specification, planning, incremental work, TDD, review, API/UI design, documentation workflows | Its AGENTS.md governs that collection itself; do not copy it wholesale into ShopScale |
| [Matt Pocock skills metadata](../../skills/skills-main/package.json) | Domain modeling, research, TDD, review, writing for agents, teaching | Root README is a Changesets stub; use bucket docs and skill files rather than treating that README as catalog |
| [Engineering skill catalog](../../skills/skills-main/skills/engineering/README.md) | Choose a narrowly relevant workflow at implementation time | Experimental/deprecated categories are not automatic standards |
| [Productivity skill catalog](../../skills/skills-main/skills/productivity/README.md) | Learning, explanation and focused handoff patterns | Learning format follows the user's request for both guided and challenge-first material |
| [i-have-adhd](../../skills/i-have-adhd-main/README.md) | Optional concise/actionable presentation ideas | Does not imply any diagnosis or require changing the user's environment |
| [Reticle](../../skills/reticle-main/README.md) | Optional supplemental browser/runtime verification after an app exists | Full tool monorepo, not ShopScale source; do not build/install it merely because it is downloaded |

No subagents or external reviewer were used to write this plan. Internal consistency checking is not the distinct-model implementation review required by the source framework.

## Primary technical references checked

| Reference | Narrow use |
| --- | --- |
| [Nest modules](https://docs.nestjs.com/modules) | Provider encapsulation and exported module interfaces |
| [Next server/client components](https://nextjs.org/docs/app/getting-started/server-and-client-components) | Rendering and interaction boundary |
| [Next authentication](https://nextjs.org/docs/app/guides/authentication) | Authentication/authorization implementation considerations |
| [PostgreSQL locking](https://www.postgresql.org/docs/current/explicit-locking.html) | Locking behavior; verify selected DB version when implementing |
| [PostgreSQL 16 full-text search](https://www.postgresql.org/docs/16/textsearch.html) | SQL search baseline |
| [PostgreSQL 16 pg_trgm](https://www.postgresql.org/docs/16/pgtrgm.html) | Similarity matching distinct from full-text search |
| [Drizzle migrations](https://orm.drizzle.team/docs/migrations) | Migration workflows; inspect generated SQL |
| [BullMQ idempotent jobs](https://docs.bullmq.io/patterns/idempotent-jobs) | Repeat-safe job design |
| [Docker Desktop WSL](https://docs.docker.com/desktop/features/wsl/) | Windows backend/resource considerations |
| [Testcontainers Node](https://node.testcontainers.org/) | Real-service integration harness |
| [Playwright assertions](https://playwright.dev/docs/test-assertions) | Browser verification |
| [k6 thresholds](https://grafana.com/docs/k6/latest/using-k6/thresholds/) | Explicit load-test pass/fail criteria |

These sources validate capabilities and concepts, not exact compatibility of an unbuilt toolchain. T002 records a compatible pinned version matrix and checks current official documentation. Do not copy version pins from the unrelated Reticle repository.
