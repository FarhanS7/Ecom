# Task Dependency Graph & Critical Path: ShopScale

> **Authoritative Task Dependencies, Sequencing Rules, and Critical Path**  
> Every task specifies its prerequisite blockers, blocked downstream tasks, and parallel execution candidates.

---

## 1. Global Dependency Map

### Milestone 0: Foundation (Tasks 001 – 008) — [COMPLETED]

```text
TASK-001: Review Scope and Proposed Decisions
Blocked by: none
Blocks: TASK-002, TASK-003, TASK-004, TASK-005, TASK-006, TASK-007, TASK-008
Can run in parallel with: none
Reason: Foundational scope and architectural sign-off required before repository setup.

TASK-002: Establish TypeScript Workspace
Blocked by: TASK-001
Blocks: TASK-003, TASK-005, TASK-006, TASK-007, TASK-008
Can run in parallel with: TASK-004
Reason: Sets up pnpm monorepo structure, tsconfig bases, and shared packages.

TASK-003: Create Database Migration Harness
Blocked by: TASK-002, TASK-004
Blocks: TASK-008, TASK-009, TASK-019, TASK-029, TASK-037
Can run in parallel with: TASK-005, TASK-006, TASK-007
Reason: Required for running schema migrations against PostgreSQL.

TASK-004: Define Minimal Docker Profile
Blocked by: TASK-001
Blocks: TASK-003, TASK-008
Can run in parallel with: TASK-002
Reason: Defines compose.yml for local PostgreSQL and Redis dependencies.

TASK-005: Add Validated Configuration and Health Routes
Blocked by: TASK-002
Blocks: TASK-006, TASK-008
Can run in parallel with: TASK-003, TASK-004, TASK-007
Reason: Config validation package and API bootstrap health checks.

TASK-006: Establish API and Error Conventions
Blocked by: TASK-002, TASK-005
Blocks: TASK-008, TASK-010, TASK-018, TASK-020
Can run in parallel with: TASK-003, TASK-007
Reason: RFC 7807 error handling filters, typed domain error classes, and DTO validation.

TASK-007: Create Next.js Application Shell
Blocked by: TASK-002
Blocks: TASK-008, TASK-016, TASK-017, TASK-023
Can run in parallel with: TASK-003, TASK-004, TASK-005, TASK-006
Reason: Base presentation shell, CSS variables, and server-side API proxy.

TASK-008: Add Initial Continuous Integration Gates
Blocked by: TASK-002, TASK-003, TASK-005, TASK-006, TASK-007
Blocks: TASK-009 (and all subsequent milestones)
Can run in parallel with: none
Reason: CI gates (lint, typecheck, unit tests) must enforce code quality for all future branches.
```

---

### Milestone 1: Identity and Stores (Tasks 009 – 018, 091) — [COMPLETED]

```text
TASK-009: Model Global Accounts and Session Records
Blocked by: TASK-003, TASK-008
Blocks: TASK-010, TASK-011, TASK-012, TASK-014, TASK-091
Can run in parallel with: none
Reason: Core identity schema (users, session_families, refresh_tokens) must exist.

TASK-010: Implement Registration and Login
Blocked by: TASK-006, TASK-009
Blocks: TASK-011, TASK-013, TASK-017, TASK-018
Can run in parallel with: TASK-091
Reason: Password hashing, credential verification, and initial session creation.

TASK-011: Implement Refresh Rotation and Logout
Blocked by: TASK-010
Blocks: TASK-013, TASK-017, TASK-018
Can run in parallel with: TASK-012, TASK-014
Reason: Cookie-based token refresh, family reuse revocation, and session invalidation.

TASK-012: Implement Account Recovery and Verification
Blocked by: TASK-009, TASK-010
Blocks: TASK-017
Can run in parallel with: TASK-011, TASK-013, TASK-014
Reason: Single-use hash tokens for password resets and email verifications.

TASK-013: Add Authentication Throttling and Protections
Blocked by: TASK-010, TASK-011
Blocks: TASK-018
Can run in parallel with: TASK-012, TASK-014, TASK-015
Reason: Redis sliding-window brute-force defense on login and recovery endpoints.

TASK-014: Implement Scoped Store Memberships
Blocked by: TASK-003, TASK-009
Blocks: TASK-015, TASK-016, TASK-018, TASK-020
Can run in parallel with: TASK-011, TASK-012, TASK-013
Reason: Multi-tenant businesses, stores, store_roles, and store_memberships tables.

TASK-015: Implement Seller Applications and Invitations
Blocked by: TASK-014
Blocks: TASK-018, TASK-068, TASK-069
Can run in parallel with: TASK-016, TASK-017
Reason: Seller onboarding, admin approval transition, and email invitations for staff.

TASK-016: Resolve Storefront Channels and Themes
Blocked by: TASK-007, TASK-014
Blocks: TASK-017, TASK-023, TASK-024
Can run in parallel with: TASK-015, TASK-018
Reason: Resolves slug to store context, loads theme tokens JSONB, and enforces channel headers.

TASK-017: Build Account and Recovery Screens
Blocked by: TASK-007, TASK-010, TASK-011, TASK-012, TASK-016
Blocks: TASK-024
Can run in parallel with: TASK-015, TASK-018
Reason: Next.js pages for /login, /register, /forgot-password, /reset-password, and /account.

TASK-018: Build Authorization Matrix Harness
Blocked by: TASK-006, TASK-010, TASK-011, TASK-013, TASK-014, TASK-015
Blocks: TASK-020, TASK-074
Can run in parallel with: TASK-016, TASK-017
Reason: Automated test harness verifying every API route against all roles and stores.

TASK-091: Implement Customer Address Book
Blocked by: TASK-003, TASK-009
Blocks: TASK-047, TASK-055
Can run in parallel with: TASK-010, TASK-011, TASK-012, TASK-014
Reason: Customer addresses table and management endpoints; historical snapshotting deferred to checkout.
```

---

### Milestone 2: Catalog and Storefront (Tasks 019 – 028) — [COMPLETED]

```text
TASK-019: Model Products and Variants
Blocked by: TASK-003, TASK-014
Blocks: TASK-020, TASK-021, TASK-022, TASK-028, TASK-037
Can run in parallel with: none
Reason: Database schema for categories, products, product_variants, and product_publications.

TASK-020: Implement Seller Catalog Mutations
Blocked by: TASK-006, TASK-018, TASK-019
Blocks: TASK-027, TASK-028, TASK-029
Can run in parallel with: TASK-021, TASK-022
Reason: Scoped CRUD for products and variants with uniform 404 tenancy protection.

TASK-021: Implement Channel-Aware Catalog Reads
Blocked by: TASK-019, TASK-016
Blocks: TASK-024, TASK-025, TASK-026
Can run in parallel with: TASK-020, TASK-022
Reason: Public endpoints filtering products by active status and channel publication flags.

TASK-022: Add Stable Keyset Pagination
Blocked by: TASK-019
Blocks: TASK-025, TASK-078
Can run in parallel with: TASK-020, TASK-021, TASK-023
Reason: Keyset cursor encoding/decoding on (created_at DESC, id DESC) and price/sort tuples.

TASK-023: Build Token-Based Component Foundation
Blocked by: TASK-007, TASK-016
Blocks: TASK-024, TASK-025, TASK-026, TASK-027
Can run in parallel with: TASK-019, TASK-020, TASK-021, TASK-022
Reason: Accessible UI primitives (Button, Input, Badge, Card, Modal) styled with CSS tokens.

TASK-024: Build Connected Storefront Home Pages
Blocked by: TASK-016, TASK-021, TASK-023
Blocks: TASK-025, TASK-026
Can run in parallel with: TASK-022, TASK-027
Reason: Storefront homepage rendering for marketplace (/) and branded stores (/stores/[slug]).

TASK-025: Build Product Listing and Filters
Blocked by: TASK-021, TASK-022, TASK-023, TASK-024
Blocks: TASK-032, TASK-043
Can run in parallel with: TASK-026, TASK-027
Reason: PLP page with category navigation, sort controls, and client-side filter panel.

TASK-026: Build Product Detail and Variant Selection
Blocked by: TASK-021, TASK-023, TASK-024
Blocks: TASK-033, TASK-043
Can run in parallel with: TASK-025, TASK-027
Reason: PDP page with variant selector URL state, stock badges, and SSR metadata.

TASK-027: Build Seller Catalog Editing Screens
Blocked by: TASK-020, TASK-023
Blocks: TASK-028, TASK-036, TASK-040
Can run in parallel with: TASK-025, TASK-026
Reason: Next.js seller console for creating products, editing variants, and publication controls.

TASK-028: Seed Deterministic Catalog Skeleton
Blocked by: TASK-019, TASK-020, TASK-027
Blocks: TASK-029, TASK-030, TASK-077
Can run in parallel with: none
Reason: Baseline seed fixtures for Tier S/M verification; validates catalog and identity data.
```

---

### Milestone 3: Events, Search, and Media (Tasks 029 – 036) — [PLANNED / CURRENT SPRINT]

```text
TASK-029: Implement Transactional Outbox and Relay
Blocked by: TASK-003, TASK-020, TASK-028
Blocks: TASK-030, TASK-034, TASK-047, TASK-071, TASK-073
Can run in parallel with: TASK-035
Reason: Transactional outbox table, outbox writer port, and relay worker polling with SKIP LOCKED.

TASK-030: Implement Idempotent Projection Consumers
Blocked by: TASK-029
Blocks: TASK-031, TASK-034, TASK-044, TASK-064
Can run in parallel with: TASK-033, TASK-035
Reason: Consumer receipt tracking (consumer_receipts table) and version-checked projector.

TASK-031: Implement Text Search, Typo Fallback and Facets
Blocked by: TASK-030
Blocks: TASK-032, TASK-034, TASK-079, TASK-081
Can run in parallel with: TASK-033, TASK-035
Reason: PostgreSQL search_documents projection, tsvector GIN, pg_trgm similarity, and facets.

TASK-032: Implement Autocomplete and Search UI
Blocked by: TASK-025, TASK-031
Blocks: TASK-075, TASK-079
Can run in parallel with: TASK-033, TASK-034, TASK-036
Reason: Sub-50ms autocomplete suggestion endpoint and interactive search bar component.

TASK-033: Add Scoped Product Caching and Stampede Control
Blocked by: TASK-021, TASK-026, TASK-030
Blocks: TASK-079
Can run in parallel with: TASK-031, TASK-032, TASK-034, TASK-035
Reason: Redis cache-aside for PDP with single-flight mutex lock and outbox event invalidation.

TASK-034: Implement Safe Full Reindex
Blocked by: TASK-029, TASK-030, TASK-031
Blocks: TASK-077, TASK-087
Can run in parallel with: TASK-032, TASK-033, TASK-035, TASK-036
Reason: Zero-downtime search projection rebuilding CLI command.

TASK-035: Implement Validated Asset Uploads
Blocked by: TASK-003, TASK-014
Blocks: TASK-036
Can run in parallel with: TASK-029, TASK-030, TASK-031, TASK-032, TASK-033
Reason: Presigned URL upload generation, MIME sniffing validation, and media_assets table.

TASK-036: Connect Media Editing and Responsive Images
Blocked by: TASK-027, TASK-035
Blocks: TASK-075, TASK-080
Can run in parallel with: TASK-031, TASK-032, TASK-033, TASK-034
Reason: Product image association, position sorting, and Next.js Image component optimization.
```

---

### Milestone 4: Carts and Shared Inventory (Tasks 037 – 044) — [PLANNED]

```text
TASK-037: Model Stock Invariants and Movement Ledger
Blocked by: TASK-003, TASK-019
Blocks: TASK-038, TASK-039, TASK-040, TASK-044
Can run in parallel with: TASK-041
Reason: Inventory table (on_hand, reserved) and append-only stock_movements ledger.

TASK-038: Implement Atomic Basket Reservations
Blocked by: TASK-037
Blocks: TASK-039, TASK-044, TASK-047
Can run in parallel with: TASK-040, TASK-041
Reason: Conditional single-row stock reservations with ascending variant ID lock ordering.

TASK-039: Implement Expiry and Stock Adjustments
Blocked by: TASK-038, TASK-029
Blocks: TASK-040, TASK-044, TASK-053
Can run in parallel with: TASK-041, TASK-042
Reason: BullMQ reservation expiry sweep worker and seller inventory adjustments.

TASK-040: Build Seller Stock Management UI
Blocked by: TASK-027, TASK-037, TASK-039
Blocks: TASK-067
Can run in parallel with: TASK-041, TASK-042, TASK-043
Reason: Seller console stock table with low-stock warnings and adjustment modal.

TASK-041: Implement Durable Channel Carts
Blocked by: TASK-003, TASK-009, TASK-019
Blocks: TASK-042, TASK-043, TASK-047
Can run in parallel with: TASK-037, TASK-038
Reason: Redis-backed carts with persistent PostgreSQL synchronization per channel.

TASK-042: Implement Guest Cart Ownership and Merge
Blocked by: TASK-041, TASK-010
Blocks: TASK-043, TASK-047
Can run in parallel with: TASK-038, TASK-039, TASK-040
Reason: Guest cart token signing, ownership verification, and atomic merge on user login.

TASK-043: Build Cart and Add-to-Cart Interactions
Blocked by: TASK-023, TASK-025, TASK-026, TASK-041, TASK-042
Blocks: TASK-048
Can run in parallel with: TASK-040, TASK-044
Reason: Next.js cart drawer, item count badge, quantity selectors, and channel basket separation.

TASK-044: Prove Cross-Channel Stock Contention
Blocked by: TASK-038, TASK-039, TASK-041
Blocks: TASK-047, TASK-079
Can run in parallel with: TASK-040, TASK-042, TASK-043
Reason: Automated concurrency test proving 500 concurrent buyers for 50 units never oversell.
```

---

### Milestone 5: Checkout and Mock Payments (Tasks 045 – 054) — [PLANNED]

```text
TASK-045: Implement Totals and Coupon Allocation Contracts
Blocked by: TASK-019, TASK-041
Blocks: TASK-047, TASK-048, TASK-063
Can run in parallel with: TASK-046, TASK-049
Reason: Canonical server-issued price quotes with discount allocation and price change detection.

TASK-046: Model Orders and Seller Suborders
Blocked by: TASK-003, TASK-014, TASK-019
Blocks: TASK-047, TASK-051, TASK-055, TASK-056
Can run in parallel with: TASK-045, TASK-049
Reason: Database schema for orders, seller_orders, order_items, and payment_attempts.

TASK-047: Implement Idempotent Checkout Creation
Blocked by: TASK-038, TASK-041, TASK-045, TASK-046, TASK-091, TASK-029
Blocks: TASK-048, TASK-050, TASK-051, TASK-054
Can run in parallel with: TASK-049
Reason: Checkout API requiring Idempotency-Key; locks reservations, generates order & suborders.

TASK-048: Build Checkout Review and Pending-Order UI
Blocked by: TASK-043, TASK-045, TASK-047
Blocks: TASK-057
Can run in parallel with: TASK-049, TASK-050
Reason: Multi-step checkout screen: address selection, quote review, and payment authorization.

TASK-049: Implement Persistent Mock Payment Provider
Blocked by: TASK-002, TASK-005
Blocks: TASK-050, TASK-052
Can run in parallel with: TASK-045, TASK-046, TASK-047, TASK-048
Reason: Mock payment HTTP simulator with deterministic delays, failure modes, and HMAC signatures.

TASK-050: Implement Payment Dispatch and Webhook Ingestion
Blocked by: TASK-029, TASK-047, TASK-049
Blocks: TASK-051, TASK-052, TASK-054
Can run in parallel with: TASK-048
Reason: Worker payment dispatch, HMAC webhook signature validation, and webhook_events deduplication.

TASK-051: Confirm Paid Orders and Compensate Failures
Blocked by: TASK-046, TASK-047, TASK-050
Blocks: TASK-055, TASK-056, TASK-060
Can run in parallel with: TASK-052, TASK-053
Reason: Order state transition to PAID, stock decrement confirmation, and failure refund compensation.

TASK-052: Reconcile Uncertain Payment Outcomes
Blocked by: TASK-049, TASK-050, TASK-051
Blocks: TASK-073
Can run in parallel with: TASK-053, TASK-054
Reason: Worker reconciliation job querying payment simulator for abandoned or timed-out charges.

TASK-053: Prove Checkout Expiry Race
Blocked by: TASK-039, TASK-051
Blocks: TASK-079
Can run in parallel with: TASK-052, TASK-054
Reason: Integration test proving late payment after reservation expiry triggers automated refund/void.

TASK-054: Prove Retry and Duplicate-Webhook Safety
Blocked by: TASK-047, TASK-050, TASK-051
Blocks: TASK-079
Can run in parallel with: TASK-052, TASK-053
Reason: Concurrency test firing 20 duplicate checkout requests and duplicate webhooks simultaneously.
```

---

### Milestone 6: Fulfillment and After-Sales (Tasks 055 – 062) — [PLANNED]

```text
TASK-055: Implement Scoped Order History and Detail
Blocked by: TASK-046, TASK-051, TASK-091
Blocks: TASK-057, TASK-058
Can run in parallel with: TASK-056, TASK-061
Reason: Customer order history and detail endpoints with buyer PII masking for unfulfilled orders.

TASK-056: Implement Seller Fulfillment Transitions
Blocked by: TASK-046, TASK-051, TASK-018
Blocks: TASK-057, TASK-058, TASK-060
Can run in parallel with: TASK-055, TASK-061
Reason: Suborder state machine (PAID -> PACKED -> SHIPPED -> DELIVERED) with tracking references.

TASK-057: Build Customer and Seller Order Screens
Blocked by: TASK-048, TASK-055, TASK-056
Blocks: TASK-059
Can run in parallel with: TASK-058, TASK-060, TASK-061, TASK-062
Reason: Customer order tracking view and seller fulfillment management console.

TASK-058: Implement Cancellation and Return Requests
Blocked by: TASK-055, TASK-056
Blocks: TASK-059, TASK-060
Can run in parallel with: TASK-061, TASK-062
Reason: Unshipped order line cancellations and customer return request submission with reasons.

TASK-059: Build After-Sales Request Screens
Blocked by: TASK-057, TASK-058
Blocks: TASK-069
Can run in parallel with: TASK-060, TASK-061, TASK-062
Reason: Next.js screens for customer return requests and seller inspection/approval workflows.

TASK-060: Implement Partial Refunds and Balanced Ledger
Blocked by: TASK-051, TASK-056, TASK-058
Blocks: TASK-069, TASK-070
Can run in parallel with: TASK-061, TASK-062
Reason: Double-entry financial_entries ledger balancing debits and credits on full/partial refunds.

TASK-061: Implement Invoices and Demo Notifications
Blocked by: TASK-029, TASK-051
Blocks: TASK-073
Can run in parallel with: TASK-055, TASK-056, TASK-057, TASK-058, TASK-059, TASK-060
Reason: Asynchronous PDF invoice generation stored in MinIO, and local email/SMS notification queue.

TASK-062: Audit All Privileged Business Mutations
Blocked by: TASK-003, TASK-015, TASK-020, TASK-056, TASK-060
Blocks: TASK-067, TASK-069, TASK-082
Can run in parallel with: TASK-057, TASK-059, TASK-061
Reason: Append-only audit_logs capture of actor, action, store_id, and redacted before/after JSON.
```

---

### Milestone 7: Engagement and Administration (Tasks 063 – 070) — [PLANNED]

```text
TASK-063: Build Coupon Management and Redemption UI
Blocked by: TASK-045, TASK-027
Blocks: TASK-075
Can run in parallel with: TASK-064, TASK-065, TASK-066
Reason: Seller/admin coupon creation interface and checkout coupon application input.

TASK-064: Implement Verified Reviews and Rating Projection
Blocked by: TASK-019, TASK-030, TASK-056
Blocks: TASK-075
Can run in parallel with: TASK-063, TASK-065, TASK-066
Reason: Enforces verified purchaser eligibility, unique(product_id, user_id), and async rating rollup.

TASK-065: Implement Shared Customer Wishlist
Blocked by: TASK-019, TASK-009
Blocks: TASK-075
Can run in parallel with: TASK-063, TASK-064, TASK-066
Reason: Customer wishlist endpoints, item toggles, and private availability indicators.

TASK-066: Implement Scoped Sales Read Models
Blocked by: TASK-046, TASK-051, TASK-060
Blocks: TASK-067, TASK-082
Can run in parallel with: TASK-063, TASK-064, TASK-065, TASK-068
Reason: PostgreSQL materialized views for daily sales, revenue, and store order summaries.

TASK-067: Build Seller and Platform Dashboards
Blocked by: TASK-062, TASK-066
Blocks: TASK-075
Can run in parallel with: TASK-068, TASK-069, TASK-070
Reason: Analytics dashboards displaying GMV, order volume, refund rates, and top sellers.

TASK-068: Build Team, Theme and Store-Content Settings
Blocked by: TASK-015, TASK-016, TASK-027
Blocks: TASK-075
Can run in parallel with: TASK-067, TASK-069, TASK-070
Reason: Seller console settings for staff invitations, token theme customization, and homepage content.

TASK-069: Build Support and Admin Policy Workflows
Blocked by: TASK-015, TASK-058, TASK-060, TASK-062
Blocks: TASK-074
Can run in parallel with: TASK-067, TASK-068, TASK-070
Reason: Admin console for approving sellers, category edits, and support refunds capped at $200.

TASK-070: Implement Simulated Seller Settlement
Blocked by: TASK-060, TASK-056
Blocks: TASK-084
Can run in parallel with: TASK-067, TASK-068, TASK-069
Reason: Periodic accounting settlement calculating commission fees and net seller payouts.
```

---

### Milestone 8: Reliability and Quality (Tasks 071 – 076) — [PLANNED]

```text
TASK-071: Trace Requests Through API and Workers
Blocked by: TASK-005, TASK-029, TASK-050
Blocks: TASK-072, TASK-084
Can run in parallel with: TASK-074, TASK-075, TASK-076
Reason: OpenTelemetry instrumentation propagating trace IDs across HTTP, outbox, and BullMQ jobs.

TASK-072: Add Metrics Dashboards and Alerts
Blocked by: TASK-071
Blocks: TASK-084, TASK-087
Can run in parallel with: TASK-073, TASK-074, TASK-075, TASK-076
Reason: Prometheus metrics exporter and alert definitions for failed queues, error rates, and p95 latency.

TASK-073: Run Failure Recovery and Broker-Loss Tests
Blocked by: TASK-029, TASK-050, TASK-052, TASK-061
Blocks: TASK-084, TASK-087
Can run in parallel with: TASK-074, TASK-075, TASK-076
Reason: Chaos test killing worker processes mid-order and restarting Redis to verify zero lost orders.

TASK-074: Complete Security Regression Coverage
Blocked by: TASK-018, TASK-060, TASK-069
Blocks: TASK-088
Can run in parallel with: TASK-075, TASK-076
Reason: Comprehensive test suite verifying route authorization matrix, SQL injection, and IDOR protection.

TASK-075: Complete Accessibility and Responsive Verification
Blocked by: TASK-023, TASK-025, TASK-026, TASK-048, TASK-057
Blocks: TASK-080, TASK-088
Can run in parallel with: TASK-074, TASK-076
Reason: WCAG 2.1 AA accessibility compliance audit, screen reader testing, and mobile viewports.

TASK-076: Add Low-Stock and Feature-Flag Extensions
Blocked by: TASK-037, TASK-029
Blocks: TASK-088
Can run in parallel with: TASK-074, TASK-075
Reason: Low-stock notification triggers and administrative feature flag toggles for gradual rollout.
```

---

### Milestone 9: Performance and Scale Evidence (Tasks 077 – 084) — [PLANNED]

```text
TASK-077: Generate Realistic Seed Tiers and Verify Distributions
Blocked by: TASK-028, TASK-034, TASK-037, TASK-046
Blocks: TASK-078, TASK-079, TASK-083, TASK-084
Can run in parallel with: TASK-080
Reason: PostgreSQL COPY seed generator for Tiers S (1k), M (10k), L (100k), and XL (1M) with Zipf distributions.

TASK-078: Prove Index and Pagination Improvements
Blocked by: TASK-022, TASK-077
Blocks: TASK-084
Can run in parallel with: TASK-079, TASK-080, TASK-081, TASK-082
Reason: EXPLAIN ANALYZE comparison benchmarking OFFSET 50000 vs. keyset cursor pagination on 100k products.

TASK-079: Build SLO and Throughput Load Suites
Blocked by: TASK-031, TASK-033, TASK-044, TASK-054, TASK-077
Blocks: TASK-083, TASK-084
Can run in parallel with: TASK-080, TASK-081, TASK-082
Reason: k6 load test scenarios for browse mix (1000 req/s), search stress, and flash sale concurrency.

TASK-080: Measure Frontend Performance
Blocked by: TASK-036, TASK-075
Blocks: TASK-084
Can run in parallel with: TASK-078, TASK-079, TASK-081, TASK-082
Reason: Lighthouse Core Web Vitals audit (LCP < 2.5s, CLS < 0.1, FID/INP < 100ms) on Next.js storefronts.

TASK-081: Compare Optional OpenSearch Adapter
Blocked by: TASK-031, TASK-077
Blocks: TASK-084
Can run in parallel with: TASK-078, TASK-079, TASK-080, TASK-082
Reason: Implements SearchPort using OpenSearch 8 container and benchmarks against PostgreSQL FTS.

TASK-082: Explore Partitioning and Read Replicas
Blocked by: TASK-062, TASK-066, TASK-077
Blocks: TASK-084
Can run in parallel with: TASK-078, TASK-079, TASK-080, TASK-081
Reason: Evaluates table partitioning on stock_movements/audit_logs and read replica query routing.

TASK-083: Run Soak and Contention Analysis
Blocked by: TASK-077, TASK-079
Blocks: TASK-084
Can run in parallel with: TASK-081, TASK-082
Reason: Multi-hour sustained soak test evaluating memory leaks, pool exhaustion, and lock wait times.

TASK-084: Assemble Honest Benchmark Evidence
Blocked by: TASK-070, TASK-071, TASK-072, TASK-073, TASK-078, TASK-079, TASK-080, TASK-081, TASK-082, TASK-083
Blocks: TASK-089, TASK-090
Can run in parallel with: none
Reason: Compiles all raw k6 results, query plans, graphs, and limitations into docs/benchmarks.md.
```

---

### Milestone 10: Release and Portfolio (Tasks 085 – 090) — [PLANNED]

```text
TASK-085: Rehearse Backups and Restoration
Blocked by: TASK-077
Blocks: TASK-086, TASK-087
Can run in parallel with: TASK-088, TASK-089
Reason: Automated pg_dump/pg_restore drill verifying database point-in-time recovery and integrity.

TASK-086: Prepare Demo Deployment and Rollback
Blocked by: TASK-004, TASK-085
Blocks: TASK-087, TASK-090
Can run in parallel with: TASK-088, TASK-089
Reason: Single-command production packaging (docker-compose.prod.yml) and documented rollback triggers.

TASK-087: Complete Runbooks and Operating Drills
Blocked by: TASK-034, TASK-072, TASK-073, TASK-085, TASK-086
Blocks: TASK-090
Can run in parallel with: TASK-088, TASK-089
Reason: Operator runbooks for incident response, worker restart, reindexing, and queue recovery.

TASK-088: Perform Independent Milestone Review
Blocked by: TASK-074, TASK-075, TASK-076
Blocks: TASK-089, TASK-090
Can run in parallel with: TASK-085, TASK-086, TASK-087
Reason: Multi-pass adversarial code review in fresh sessions across all critical modules.

TASK-089: Prepare Portfolio Narrative and Demonstration
Blocked by: TASK-084, TASK-088
Blocks: TASK-090
Can run in parallel with: TASK-085, TASK-086, TASK-087
Reason: Authoritative README walkthrough, architectural diagrams, benchmark showcase, and video script.

TASK-090: Close Demo and Define Production Handoff
Blocked by: TASK-084, TASK-086, TASK-087, TASK-088, TASK-089
Blocks: none (Final Project Completion)
Can run in parallel with: none
Reason: Final validation sign-off, production handoff checklist, and demo repository freeze.
```

---

## 2. Critical Path Analysis

The critical path represents the longest chain of non-parallelizable dependencies from the current project state to completion:

$$\text{TASK-029} \rightarrow \text{TASK-030} \rightarrow \text{TASK-037} \rightarrow \text{TASK-038} \rightarrow \text{TASK-041} \rightarrow \text{TASK-045} \rightarrow \text{TASK-047} \rightarrow \text{TASK-050} \rightarrow \text{TASK-051} \rightarrow \text{TASK-056} \rightarrow \text{TASK-060} \rightarrow \text{TASK-074} \rightarrow \text{TASK-077} \rightarrow \text{TASK-079} \rightarrow \text{TASK-084} \rightarrow \text{TASK-088} \rightarrow \text{TASK-089} \rightarrow \text{TASK-090}$$

**Total Critical Path Length**: 18 sequential engineering stages.  
Any delay on these specific tasks directly delays final project delivery.

---

## 3. Parallel Execution Groups

When multiple developers or subagents are available, tasks can be scheduled in concurrent groups:

### Parallel Group A (Search & Discovery Stream)
*Unblocked after `TASK-030` lands:*
- `TASK-031` (Search & Typo Fallback)
- `TASK-033` (Product Caching & Single-Flight)
- `TASK-035` (Asset Uploads)

### Parallel Group B (UI & Experience Stream)
*Unblocked after `TASK-041` lands:*
- `TASK-040` (Seller Stock Management UI)
- `TASK-042` (Guest Cart Merge)
- `TASK-043` (Add-to-Cart Interactions)

### Parallel Group C (Post-Order & Administration Stream)
*Unblocked after `TASK-051` lands:*
- `TASK-055` (Order History)
- `TASK-056` (Seller Fulfillment Transitions)
- `TASK-061` (Invoices & Notifications)
- `TASK-064` (Verified Reviews)
- `TASK-065` (Wishlist)

### Parallel Group D (Evidence & Hardening Stream)
*Unblocked after `TASK-077` lands:*
- `TASK-078` (Index & Pagination Proofs)
- `TASK-079` (k6 Load Test Scenarios)
- `TASK-080` (Frontend Core Web Vitals)
- `TASK-081` (OpenSearch Adapter Comparison)
- `TASK-082` (Partitioning & Replica Experiments)
- `TASK-085` (Backup & Restore Rehearsals)
