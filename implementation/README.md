# ShopScale Implementation Planning System

> **Authoritative, IDE-Executable Engineering Specification & Task Plan**  
> Generated for autonomous IDE coding agents and technical reviewers.

---

## 1. Executive Summary

This directory contains the complete, implementation-ready execution system for **ShopScale: Multi-Vendor E-commerce Marketplace**.

It translates the product goals, architectural decisions, security requirements, and operational conventions from [01-ecommerce-marketplace-PRD.md](../01-ecommerce-marketplace-PRD.md), [PRD_TO_TASKS_FRAMEWORK.md](../PRD_TO_TASKS_FRAMEWORK.md), [ARCHITECTURE.md](../ARCHITECTURE.md), and repository documentation into an unambiguous, traceable, and command-driven plan.

Every architectural decision is made once and referenced; every product requirement is tracked through implementation, automated tests, and user verification; and every task file is structured as an imperative execution specification for an IDE agent.

---

## 2. Directory Navigation

| File | Purpose |
|---|---|
| [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) | **Master implementation plan**: project summary, analyzed sources, scope breakdown, phase roadmap, dependency critical path, and completion gates. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | **Canonical technical foundation**: system shape, module boundaries, data access, transactions, sync/async boundaries, caching, auth, and error conventions. |
| [DECISIONS.md](DECISIONS.md) | **Architecture Decision Records (ADRs)**: comprehensive record of all foundational architectural decisions (DEC-001 through DEC-012) with trade-offs. |
| [DEPENDENCIES.md](DEPENDENCIES.md) | **Task dependency graph**: blocking chains, parallelizable groups, critical path, and execution sequence. |
| [REQUIREMENT_TRACEABILITY.md](REQUIREMENT_TRACEABILITY.md) | **Requirement Traceability Matrix (RTM)**: mapping PRD IDs (ID, CT, IN, CA, OR, RV, AD, NFRs) to tasks, tests, manual verifications, and statuses. |
| [RISKS.md](RISKS.md) | **Project Risk Register**: critical technical risks, concurrency pitfalls, mitigations, validation procedures, and fallbacks. |
| [TEST_STRATEGY.md](TEST_STRATEGY.md) | **Verification architecture**: unit, integration (real PostgreSQL), contract, frontend, E2E, concurrency (k6), and chaos testing expectations. |
| [SECURITY_PLAN.md](SECURITY_PLAN.md) | **Security and threat model**: assets, trust boundaries, RBAC/ABAC matrix, session security, rate limits, webhook verification, and PII masking. |
| [MANUAL_VERIFICATION_PLAN.md](MANUAL_VERIFICATION_PLAN.md) | **User verification gates**: mandatory manual checkpoints with step-by-step actions, expected results, and PASS/FAIL criteria. |
| [tasks/](tasks/) | **Individual executable task files**: 91 standalone markdown task specifications (`001-*.md` to `091-*.md`) formatted as direct commands. |

---

## 3. Project Status & Progress (as of Milestone 2 Exit)

ShopScale is being developed as a **modular monolith** with independently runnable Fastify/NestJS API and BullMQ worker entry points, PostgreSQL 16/17, Redis 7, and a Next.js App Router storefront/console.

The codebase is currently through **Milestone 2 (Catalog and Storefront)**:

| Phase / Milestone | Status | Task Range | Summary |
|---|---|---|---|
| **0. Foundation** | **IMPLEMENTED** | `TASK-001` – `TASK-008` | Monorepo pnpm workspace, Drizzle migration harness, Docker Compose profiles, validated config, RFC 7807 error format, Next.js shell, CI pipeline. |
| **1. Identity and Stores** | **IMPLEMENTED** | `TASK-009` – `TASK-018`, `TASK-091` | Global customer accounts, Argon2id auth, session families, refresh token rotation, brute-force rate limits, store memberships, seller invitations, channel/theme resolution, authorization matrix harness, address book. |
| **2. Catalog and Storefront** | **IMPLEMENTED** | `TASK-019` – `TASK-028` | Product/variant schema, seller mutations, keyset pagination, token-based UI components, multi-store homepages, PLP with filter state, PDP with variant selection, seller editing screens, deterministic seed skeleton. |
| **3. Events, Search, Media** | **PLANNED (NEXT)** | `TASK-029` – `TASK-036` | Transactional outbox & relay worker, idempotent projection consumers, PostgreSQL full-text/trigram search & facets, autocomplete UI, Redis product cache with stampede protection, reindex CLI, presigned asset uploads. |
| **4. Carts and Inventory** | **PLANNED** | `TASK-037` – `TASK-044` | Atomic stock reservation with TTL, append-only stock movement ledger, Redis/Postgres channel carts, guest cart merge, add-to-cart UI, 500-buyer concurrency proof. |
| **5. Checkout & Payments** | **PLANNED** | `TASK-045` – `TASK-054` | Totals calculation, coupon allocation, order & seller suborder models, idempotent checkout API, persistent mock payment simulator, HMAC webhook ingestion, compensation saga, reconciliation, retry safety proof. |
| **6. Fulfillment & After-Sales** | **PLANNED** | `TASK-055` – `TASK-062` | Scoped order history, seller fulfillment state machine, customer/seller order UI, cancellation/return workflows, double-entry financial refund ledger, PDF invoices, privileged audit logging. |
| **7. Engagement & Admin** | **PLANNED** | `TASK-063` – `TASK-070` | Coupon redemption UI, verified purchaser reviews, customer wishlist, sales materialized views, seller/admin analytics dashboards, store theme settings, support policy workflows, simulated seller settlements. |
| **8. Reliability & Quality** | **PLANNED** | `TASK-071` – `TASK-076` | OpenTelemetry request tracing, Prometheus metrics & alerts, broker crash/recovery verification, security regression suite, accessibility/responsive verification, low-stock alerts. |
| **9. Performance & Scale** | **PLANNED** | `TASK-077` – `TASK-084` | Realistic seed generator (Tiers S, M, L, XL), EXPLAIN ANALYZE index proofs, k6 browse/search/flash-sale suites, frontend Web Vitals, OpenSearch comparison adapter, partitioning experiments, honest benchmark reporting. |
| **10. Release & Portfolio** | **PLANNED** | `TASK-085` – `TASK-090` | Backup/restore rehearsals, deployment and rollback scripts, operational runbooks, independent milestone review, portfolio narrative, clean production handoff documentation. |

---

## 4. Strict Operating Rules for Implementation Agents

Every IDE coding agent executing tasks in this repository MUST abide by these non-negotiable rules:

1. **Never Invent Missing Behavior**: If an edge case or requirement is ambiguous, check [ARCHITECTURE.md](ARCHITECTURE.md) and [DECISIONS.md](DECISIONS.md). If still unspecified, ask the user or explicitly record an assumption in the task's completion report.
2. **Inspect and Activate Skills Before Coding**: Each task lists exact required skills from `skills/`. The agent must read the skill instructions and adhere to them before altering code.
3. **Red-Green-Refactor TDD**: Write or update failing tests *first*. Run the focused test to confirm RED. Write the minimal implementation to achieve GREEN. Refactor without altering behavior.
4. **No Untested Commits**: Tests must pass before any commit. Follow the Conventional Commits format: `type(scope): description`. One commit per subtask.
5. **Preserve Architectural Decisions**: Do not redesign patterns inside task files. For example, never introduce a second authentication scheme, never write across module boundaries without ports, and never call third-party networks while holding database row locks.
6. **Enforce Tenant and Role Isolation**: Every seller mutation and read must be scoped by `store_id`. Unscoped or unauthorized store requests must return uniform `404 Not Found` to prevent tenancy enumeration or information leakage.
7. **Adversarial Review Requirement**: Code must undergo independent review before merge according to the task's risk level (`LOW`, `MEDIUM`, or `HIGH`).
8. **User Manual Verification Gate**: After automated tests pass and review is complete, present the explicit verification steps to the user. A feature is not complete until the user confirms `PASS` or records `DEFER`.

---

## 5. Immediate Next Action

The next unblocked task ready for execution is:
👉 **[TASK-029: Implement Transactional Outbox and Relay](tasks/029-implement-transactional-outbox-and-relay.md)**
