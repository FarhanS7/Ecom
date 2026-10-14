# Decision Review — T001: Review scope and proposed decisions

**Branch:** `feature/platform/t001-review-scope-and-proposed-decisions`
**Date:** 2026-10-14
**Status:** Completed — all proposed ADRs reviewed and dispositioned

---

## Executive Summary

This review walks through the confirmed product decisions, the nine proposed Architecture Decision Records (ADRs), and a two-store checkout with late payment scenario to identify module ownership. Every ADR receives an explicit disposition: **Accepted**, **Accepted with Amendment**, or **Deferred**.

**Outcome:** All 9 ADRs accepted as proposed. No amendments required at this stage. The two-store scenario confirms module boundaries align with confirmed product choices (D-001 through D-009).

---

## 1. Confirmed User Decisions (from `confirmed-decisions.md`)

| ID | Decision | Status | Notes |
|----|----------|--------|-------|
| D-001 | Independent branded stores + shared marketplace | **Confirmed** | Drives store-scoped data model, channel routing |
| D-002 | One catalog/inventory pool per seller across channels | **Confirmed** | Core invariant: shared stock, reservation-based |
| D-003 | Seller controls marketplace publication | **Confirmed** | Separate `publication` state from `availability` |
| D-004 | One global customer account | **Confirmed** | Shared identity, store-scoped carts & views |
| D-005 | Per-store cart + marketplace multi-seller cart | **Confirmed** | No cross-channel cart merging; checkout requires login |
| D-006 | Portfolio demo first; production roadmap separate | **Confirmed** | Mock payments, simulated shipping/payouts |
| D-007 | One business = one store; owner + staff roles | **Confirmed** | Store-scoped memberships with role hierarchy |
| D-008 | Stack: TypeScript, NestJS, Next.js | **Confirmed** | Backend: Nest+Fastify; Frontend: Next.js App Router |
| D-009 | Local dev: Windows, Docker Desktop, 8 GB RAM | **Confirmed** | Host app processes; optional Compose profiles |

**All confirmed decisions remain intact.** No changes requested.

---

## 2. ADR Dispositions

### ADR-0001: Modular monolith and worker entry point
**Status:** **Accepted** ✅

**Rationale:** Aligns with D-008 (NestJS) and the learning goal of deep correctness without distributed overhead. The separate worker process using the same domain package (`packages/backend`) enables async processing (outbox relay, schedulers, consumers) while keeping business logic unified.

**Validation path:** Module import checks (dependency-cruiser), integration tests across ports, end-to-end purchase flow.

---

### ADR-0002: PostgreSQL with Drizzle and explicit SQL
**Status:** **Accepted** ✅

**Rationale:** Relational invariants (stock, orders, coupons, financials) demand ACID. Drizzle provides type-safe schema/migrations; explicit parameterized SQL handles hot paths (locks, conditional updates, COPY, EXPLAIN). Learner knows SQL.

**Validation path:** Constraint failures, rollback tests, empty/upgrade migrations, EXPLAIN evidence.

---

### ADR-0003: Store-scoped data with global customer identity
**Status:** **Accepted** ✅

**Rationale:** Directly implements D-001, D-002, D-003, D-004, D-005. One business → one store (D-007). Store IDs scope products, staff, content, seller views. Customer identity is global. Route resolver selects channel (marketplace `/` vs store `/stores/{slug}`).

**Validation path:** Cross-store ID substitution tests (variants, invoices, reports, caches, stale memberships). Composite FKs prevent cross-store associations. RLS as defense-in-depth lab only.

---

### ADR-0004: Cookie-carried access tokens and rotating refresh tokens
**Status:** **Accepted** ✅

**Rationale:** Meets PRD auth requirements (JWT access + refresh rotation with reuse detection). HttpOnly cookies on shared origin (D-009: same-origin demo) with SameSite, CSRF/Origin checks for mutations. 15-min access, rotating hashed refresh, durable family revocation.

**Validation path:** Rotation race, stale membership, logout, CSRF, reset expiry, no tokens in logs.

---

### ADR-0005: Reservation-based shared inventory
**Status:** **Accepted** ✅

**Rationale:** Core to D-002 (one pool, two channels). `available = on_hand - reserved`. Reserve: conditional `UPDATE ... SET reserved = reserved + :qty WHERE variant_id=:v AND on_hand - reserved >= :qty`. Confirm: decrement both. Release: decrement reserved. Every transition writes append-only `stock_movements` in same transaction. Stable lock order (variant ID asc).

**Validation path:** 500 concurrent buyers / 50 units, cross-channel overlap, expiry/payment race, ledger reconciliation.

---

### ADR-0006: Outbox, BullMQ, and durable deduplication
**Status:** **Accepted** ✅

**Rationale:** Order must not disappear between DB commit and job publication. Workers/webhooks may repeat. Transactional outbox committed with business data → relay to BullMQ on separate Redis jobs instance → consumers use transactional receipts (`consumer_receipts` table) and effect keys. Reconcile pending effects after broker loss.

**Validation path:** Kill relay/worker at transaction boundaries; replay same event ID.

---

### ADR-0007: PostgreSQL search first, OpenSearch comparison later
**Status:** **Accepted** ✅

**Rationale:** 8 GB RAM constraint (D-009). Build versioned `search_documents` projection using FTS + bounded `pg_trgm` fallback. Optional OpenSearch adapter only after contract tests and baseline measurement. Projection lag visible. Channel visibility gates public results/facets; stock revalidated at checkout.

**Validation path:** Typo/filter/facet fixtures, stale-version replay, reindex catch-up, documented engine comparison.

---

### ADR-0008: Deterministic mock commerce before real integrations
**Status:** **Accepted** ✅

**Rationale:** D-006 (demo first). Signed, persistent mock provider with controllable outcomes: success, decline, timeout, duplicate, late webhook. Simulated shipping/payouts. Single USD currency; explicit demo shipping (500 cents/suborder) and tax-not-modeled treatment. Simulator lives outside order transaction; preserves provider effects across worker crashes.

**Validation path:** Repeat effects, reconcile timeouts, assert exactly one provider charge and balanced ledger.

---

### ADR-0009: Resource-aware profiles without weaker correctness
**Status:** **Accepted** ✅

**Rationale:** D-009 (8 GB host). Node apps on host; core PostgreSQL + cache containers; jobs Redis when needed. Object storage, search, telemetry, benchmarks as deliberate Compose profiles. Everyday functional checks ≠ scale proof. Core resource estimates = starting budgets, not guarantees.

**Validation path:** Record `docker stats`, system memory, build peak, reproducible functional/benchmark results.

---

## 3. Two-Store Checkout & Late Payment Scenario Walkthrough

### Scenario
- **Customer** (global account) adds items from **Store A** and **Store B** to marketplace cart
- Customer proceeds to checkout (authenticated, Idempotency-Key provided)
- Mock payment initiated → provider returns "pending" (async webhook expected)
- Worker crashes before webhook arrives
- Webhook arrives late (after worker restart) → payment confirmed
- Fulfillment splits into seller suborders

---

### Step-by-Step Module Ownership

| Step | Action | Owning Module(s) | Key Invariants |
|------|--------|------------------|----------------|
| 1 | Customer browses marketplace, sees products from Store A & B | **Catalog** (read), **Stores** (channel resolution), **Search** (projection) | Channel visibility gates results; `publication=MARKETPLACE` |
| 2 | Customer adds items to marketplace cart | **Cart** (Redis + DB persistence), **Stores** (channel scope) | Cart keyed by `(channel=MARKETPLACE, customer_id)`; no cross-channel merge |
| 3 | Customer initiates checkout (POST `/checkout`, Idempotency-Key) | **Commerce** (orchestrator), **Identity** (actor from session), **Cart** (revalidate) | Actor derived from verified session; store/channel from trusted route |
| 4 | Checkout: snapshot prices, addresses, shipping, discounts | **Commerce**, **Catalog** (price snapshot), **Inventory** (reserve) | Historical orders never read live prices (Core Rule #2) |
| 5 | **Atomic reservation** of all basket lines (both stores) | **Inventory** (primary), **Commerce** (transaction boundary) | Reserve all lines in ONE transaction, lock variants in stable ID order (Core Rule #3) |
| 6 | Create order + suborders + outbox events in ONE transaction | **Commerce**, **Platform** (UnitOfWork), **Payments** (effect key) | Store order, reservation, coupon hold, idempotency outcome, outbox atomically (Core Rule #4) |
| 7 | Dispatch mock payment (async, signed) | **Payments** (provider adapter), **Outbox Relay** (event publish) | Durable effect keys; persist observation, reconcile uncertainty (Core Rule #5) |
| 8 | **Worker crashes** before webhook | — | Outbox events persisted; `published_at` NULL for unsent |
| 9 | Worker restarts → relay picks up unpublished outbox events | **Platform** (relay), **Payments** (webhook handler) | Relay uses `FOR UPDATE SKIP LOCKED`; idempotent consumers |
| 10 | Late webhook arrives (duplicate possible) | **Payments** (webhook ingestion), **Commerce** (confirmation) | Dedupe by `event_id`; idempotent consumer receipt; compensating actions if decline (Core Rule #6) |
| 11 | Order confirmed → suborders transition to `PAID` | **Commerce** (state machine), **Inventory** (confirm reservation) | State machine: `PENDING → PAID → PACKED → SHIPPED → DELIVERED` (OR-2) |
| 12 | Confirm reservation: decrement `on_hand` and `reserved` | **Inventory** | Atomic conditional UPDATE; movement ledger entry |
| 13 | Seller A & B fulfill independently | **Commerce** (seller portal), **Notifications** (async) | Seller sees only own `order_items`; buyer PII masked until `PAID` (Core Rule #7) |
| 14 | Simulated shipping updates, invoices generated | **Notifications** (worker), **Commerce** (PDF worker) | Invoice PDF in object storage; notifications via worker with retry/DLQ |

---

### Module Ownership Summary

| Module | Responsibilities in Scenario |
|--------|------------------------------|
| **Platform** | UnitOfWork (transaction boundary), config validation, health endpoints, AuditWriter port, outbox relay |
| **Identity** | Session verification, actor derivation, JWT/refresh rotation, authentication |
| **Stores** | Channel resolution (`/` vs `/stores/{slug}`), staff membership, theme, publication gates |
| **Catalog** | Product/variant reads, price snapshots, publication state, media references |
| **Inventory** | Stock invariants (`on_hand`, `reserved`), reservations, confirmations, releases, movement ledger |
| **Commerce** | Checkout orchestration, orders, seller suborders, state machine, fulfillment, returns, refunds |
| **Payments** | Mock provider, webhook ingestion, effect keys, reconciliation, financial ledger |
| **Search** | Async projection from events, typo-tolerant FTS, facets, autocomplete |
| **Notifications** | Email/SMS workers, retry + DLQ, invoice PDF generation |
| **Reporting** | Read-replica analytics, audit log consumption, seller/platform dashboards |

---

### Cross-Cutting Invariants Verified

1. **Actor from verified session** — Identity module, never from request body
2. **Store/channel from trusted route** — Stores module resolver, never from request body
3. **Price snapshots at checkout** — Commerce captures; orders never recalculate from live Catalog
4. **Single-transaction reservation** — Inventory locks variants in stable ID order; no network calls while locks held
5. **Atomic order + outbox** — Platform UnitOfWork ensures all-or-nothing
6. **Durable effect keys** — Payments persists provider ref + outcome; reconciliation handles uncertainty
7. **At-least-once delivery** — Outbox relay + consumer receipts handle duplicates
8. **Seller data isolation** — Repository methods require store scope; composite FKs; PII masking
9. **Cache scoping** — Public cache includes `(channel, store, locale, publication_version)`; private never cached

---

## 4. Open Items / Deferred Decisions

| Item | Status | Resolution Target |
|------|--------|-------------------|
| Exact staff roles & invitation flow | **Deferred** | T014/T015 (within confirmed one-business/one-store model) |
| Cross-domain session transport / custom domains | **Deferred** | Production roadmap (D-009: demo uses shared origin) |
| Mock-only vs provider test environment | **Deferred** | T049 (mock provider first; adapter exercise later) |
| OpenSearch adoption criteria | **Deferred** | T081 (after baseline PostgreSQL FTS measurement) |
| RLS as defense-in-depth | **Deferred** | Lab exercise; not assumed protection |

---

## 5. Definition of Done Checks (from `testing/definition-of-done.md`)

| Check | Status | Evidence |
|-------|--------|----------|
| All P0 requirements implemented & covered by automated tests | N/A (planning task) | — |
| All SLOs met on Tier L & documented with reproducible commands | N/A | — |
| Permission matrix test passes for every route and role | N/A | — |
| Flash-sale, retry-storm, chaos scenarios pass | N/A | — |
| `make up && make seed SIZE=l && make loadtest` works on clean machine | N/A | — |
| Documentation complete: README, ADRs, runbook, OpenAPI | **Partial** | ADRs reviewed; decision-review.md created |

**Note:** This is a planning/review task. Implementation DoD applies to code tasks (T002+).

---

## 6. Learner Reflection (T001 "Explain" Questions)

### What would the naive implementation get wrong?
1. **Trusting client-supplied `store_id`** — Would allow cross-store data leakage. Fix: derive store from trusted route resolver (Stores module).
2. **Read-then-write inventory** — `SELECT on_hand THEN UPDATE` oversells under concurrency. Fix: single conditional `UPDATE ... WHERE on_hand - reserved >= :qty`.
3. **Publish event after commit** — Lost events on crash between commit and publish. Fix: transactional outbox in same DB transaction.
4. **Blind webhook retry** — Duplicate charges. Fix: idempotency keys + consumer receipts + effect key reconciliation.
5. **Shared cart across channels** — Violates D-005. Fix: cart keyed by `(channel, customer_id)`.

### What exact test would catch each?
| Naive Bug | Test |
|-----------|------|
| Client `store_id` leakage | Cross-store ID substitution test: POST `/seller/products` with `store_id=B` while authenticated as Store A staff → 403 |
| Read-then-write oversell | 500 concurrent checkouts on 50 units → exactly 50 orders succeed, 0 negative stock, ledger sums |
| Lost event on crash | Kill worker after DB commit before relay publishes → restart → event delivered exactly once |
| Duplicate charge | Same idempotency key sent 20x concurrently → exactly 1 order, 1 charge |
| Shared cart | Add to marketplace cart → login → verify store cart unaffected |

### What state survives a restart vs. cache-only?
| State | Survives Restart? | Location |
|-------|-------------------|----------|
| Orders, order_items, payments | ✅ Yes | PostgreSQL (durable) |
| Stock reservations (`reserved` counter) | ✅ Yes | PostgreSQL (with TTL expiry job) |
| Stock movements ledger | ✅ Yes | PostgreSQL (append-only) |
| Outbox events (unpublished) | ✅ Yes | PostgreSQL |
| Consumer receipts (dedupe) | ✅ Yes | PostgreSQL |
| Idempotency keys + cached responses | ✅ Yes | PostgreSQL |
| Access tokens (JWT) | ✅ No (short-lived) | Cookie (client) / Redis (revocation) |
| Refresh token families | ✅ Yes | PostgreSQL (hashed) |
| Search projection (`search_documents`) | ✅ Yes | PostgreSQL (rebuildable from events) |
| Product detail cache | ❌ No | Redis (TTL + stampede protection) |
| Cart (Redis) | ❌ No (but DB copy for logged-in) | Redis + PostgreSQL |
| Rate limit counters | ❌ No | Redis |
| Session metrics / telemetry | ❌ No | In-memory / exported |

---

## 7. Commit Evidence

**Commands executed:**
```bash
# Branch creation
git checkout -b feature/platform/t001-review-scope-and-proposed-decisions

# Document creation (this file)
# Review of all 9 ADRs + confirmed decisions + scenario walkthrough
```

**Files created/modified:**
- `docs/planning/decision-review.md` (this file)

**Verification:** All 9 ADRs explicitly dispositioned. Two-store scenario mapped to 10 owning modules with invariants. No code changes — this is a review task.

---

## 8. Next Steps

Proceed to **T002: Establish the TypeScript workspace** (create monorepo structure, package.json, tsconfig, tooling).

**Branch for T002:** `feature/platform/t002-establish-typescript-workspace`

---

*Review completed per [development workflow](../../docs/operations/development-workflow.md). Ready for independent review context if required.*