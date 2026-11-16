# Requirement Traceability Matrix (RTM): ShopScale

> **Authoritative Traceability from PRD Requirements to Implementation, Tests, and Verification**  
> Every V1 requirement maps to an explicit task, automated test, and manual verification gate.

---

## 1. Functional Requirements

### 1.1 Identity (`ID`)

| Requirement | Description | Task(s) | Automated Test | Manual Verification | Status |
|---|---|---|---|---|---|
| **ID-1** | User registration, login, logout, refresh, password reset with Argon2id hashing. | `TASK-009`, `TASK-010`, `TASK-011`, `TASK-012`, `TASK-017` | `packages/backend/src/identity/auth.service.test.ts` | Register user, login, inspect session cookies, test logout. | **IMPLEMENTED** |
| **ID-2** | Email verification with single-use expiring token hashes. | `TASK-012`, `TASK-017` | `packages/backend/src/identity/recovery.service.test.ts` | Request verification email, click token link, verify verified status in DB. | **IMPLEMENTED** |
| **ID-3** | Refresh token rotation with family reuse detection (stolen token invalidates family). | `TASK-011` | `packages/backend/src/identity/session.service.test.ts` | Replay an already-consumed refresh token; assert all sibling sessions revoked. | **IMPLEMENTED** |
| **ID-4** | Account lockout / exponential backoff on repeated failed logins (Redis sliding window). | `TASK-013` | `packages/backend/src/identity/rate-limit.test.ts` | Submit 5 bad passwords; assert 429 Too Many Requests with Retry-After header. | **IMPLEMENTED** |
| **ID-5** | Seller onboarding application flow with platform admin approval transition. | `TASK-015`, `TASK-069` | `packages/backend/src/stores/admin-stores.test.ts`, `apps/api/src/onboarding.controller.ts`, `apps/web/src/features/admin/merchant-moderation.test.tsx`, `tests/integration/admin-workflows.spec.ts` | Apply as seller; login as admin, approve application; verify seller gains store scope. | **IMPLEMENTED** (Backend in T015; Admin moderation UI, categories, & support policy workflows in T069) |

---

### 1.2 Catalog and Search (`CT`)

| Requirement | Description | Task(s) | Automated Test | Manual Verification | Status |
|---|---|---|---|---|---|
| **CT-1** | Products with variants (size/color), prices, JSONB attributes, and category tree. | `TASK-019`, `TASK-020`, `TASK-027` | `packages/backend/src/catalog/schema.test.ts` | Author product with 2 variants in seller console; verify DB record and schema. | **IMPLEMENTED** |
| **CT-2** | Keyset (cursor) pagination on `(created_at, id)`, sort by price/newest/sales. | `TASK-021`, `TASK-022`, `TASK-025`, `TASK-078` | `packages/backend/src/catalog/cursor.test.ts`, `tests/integration/query-plans.spec.ts`, `docs/benchmarks/query-plans.md` | Scroll product list; verify nextCursor updates URL without duplicate rows. | **IMPLEMENTED** |
| **CT-3** | Full-text search with typo tolerance (`pg_trgm`), category path, price/brand filters, and facets. | `TASK-030`, `TASK-031`, `TASK-032` | `tests/integration/search.spec.ts` | Search "hedphone" (typo); assert "Headphones" returned with accurate facet counts. | **IMPLEMENTED** |
| **CT-4** | Autocomplete suggestions under 50 ms p95 response time. | `TASK-032`, `TASK-079` | `tests/integration/autocomplete.spec.ts` | Type 3 characters in header search bar; assert instant suggestions dropdown. | **IMPLEMENTED** |
| **CT-5** | Product detail page cached in Redis with cache-aside and single-flight stampede lock. | `TASK-033` | `tests/integration/cache-stampede.spec.ts` | Fire 100 concurrent requests on uncached PDP; assert exactly 1 DB query in logs. | **IMPLEMENTED** |
| **CT-6** | Search index updated asynchronously via outbox events; safe full reindex command; optional OpenSearch adapter. | `TASK-029`, `TASK-030`, `TASK-034`, `TASK-081` | `tests/integration/reindex.spec.ts`, `tests/integration/opensearch.spec.ts`, `docs/benchmarks/search-engine-comparison.md` | Update product title; verify search_documents projected; run pnpm search:reindex; benchmark OpenSearch vs Postgres FTS. | **IMPLEMENTED** (PostgreSQL FTS in T030; Reindex in T034; OpenSearch SearchPort in T081) |
| **CT-7** | Image upload via presigned S3 URLs, MIME verification, and responsive rendering. | `TASK-035`, `TASK-036` | `tests/integration/uploads.spec.ts` | Upload product image in seller console; verify MinIO storage and responsive image tag. | **IMPLEMENTED** |

---

### 1.3 Inventory (`IN`)

| Requirement | Description | Task(s) | Automated Test | Manual Verification | Status |
|---|---|---|---|---|---|
| **IN-1** | Stock tracked per variant with `on_hand` and `reserved` counters; available computed. | `TASK-037` | `tests/integration/inventory-schema.spec.ts` | Inspect DB schema; verify CHECK constraints enforce 0 <= reserved <= on_hand. | **IMPLEMENTED** |
| **IN-2** | Reservation on checkout start with 15-minute TTL; scheduled worker releases expired stock. | `TASK-038`, `TASK-039`, `TASK-047` | `packages/backend/src/inventory/inventory.service.test.ts`, `tests/integration/inventory-reserve.spec.ts`, `tests/integration/inventory-expiry.spec.ts` | Start checkout; let timer expire; verify worker job releases reserved counter. | **IMPLEMENTED** (Reserve engine in T038; Expiry worker in T039; Checkout coordinator in T047) |
| **IN-3** | Atomic decrement via conditional UPDATE preventing negative stock under concurrency. | `TASK-038`, `TASK-044`, `TASK-053` | `packages/backend/src/inventory/concurrency.test.ts`, `tests/integration/concurrency-race.spec.ts` | Run flash-sale test: 500 buyers on 50 units; assert exactly 50 succeed, 0 negative stock. | **IMPLEMENTED** (Reservation race proven in T044; final payment capture in T053) |
| **IN-4** | Every stock change recorded in append-only `stock_movements` ledger. | `TASK-037`, `TASK-038`, `TASK-039` | `packages/backend/src/inventory/stock-adjustment.test.ts`, `tests/integration/inventory-reserve.spec.ts`, `tests/integration/inventory-expiry.spec.ts` | Execute reserve/confirm/adjust; verify ledger delta sums equal current on_hand. | **IMPLEMENTED** |
| **IN-5** | Low-stock alerts triggered to seller when available stock falls below configured threshold. | `TASK-076` | `packages/backend/tests/integration/low-stock-alert.spec.ts`, `apps/worker/src/consumers/low-stock-alert.consumer.test.ts`, `tests/integration/low-stock-alert.spec.ts` | Sell item down to 2 units; verify seller notification event generated. | **IMPLEMENTED** |

---

### 1.4 Cart (`CA`)

| Requirement | Description | Task(s) | Automated Test | Manual Verification | Status |
|---|---|---|---|---|---|
| **CA-1** | Channel-scoped carts stored in Redis for speed, synchronized to DB for logged-in users. | `TASK-041` | `tests/integration/cart.spec.ts` | Add items to marketplace cart and store cart; verify channel isolation in Redis & DB. | **IMPLEMENTED** |
| **CA-2** | Guest cart ownership signed with token; merges cleanly into user cart upon login. | `TASK-042`, `TASK-043` | `tests/integration/cart-merge.spec.ts`, `apps/web/src/features/cart/cart-drawer.test.tsx` | Add 2 items as guest; log in; verify guest items appear in user cart with no duplicates. | **IMPLEMENTED** |
| **CA-3** | Server-side revalidation of stock and price at checkout initiation; client prices rejected. | `TASK-045`, `TASK-047`, `TASK-048` | `packages/backend/src/commerce/quote.service.test.ts`, `apps/web/src/features/checkout/checkout-form.test.tsx`, `tests/integration/quote.spec.ts` | Alter product price in DB while viewing cart; click checkout; assert PRICE_CHANGED alert in UI and 409 from API. | **IMPLEMENTED** |

---

### 1.5 Checkout, Orders, Payments (`OR`)

| Requirement | Description | Task(s) | Automated Test | Manual Verification | Status |
|---|---|---|---|---|---|
| **OR-1** | Mandatory `Idempotency-Key` header; replayed requests return original cached response. | `TASK-047`, `TASK-054` | `packages/backend/src/commerce/checkout.service.test.ts`, `tests/integration/checkout.spec.ts` | Fire duplicate checkout requests; assert cached 201 response returned and 0 duplicate orders/reservations. | **IMPLEMENTED** (Checkout idempotency implemented in T047; payment replay in T054) |
| **OR-2** | Order state machine (`PENDING -> PAID -> PACKED -> SHIPPED -> DELIVERED`); rejects illegal steps. | `TASK-046`, `TASK-051`, `TASK-056`, `TASK-058` | `packages/backend/src/commerce/schema.test.ts`, `packages/backend/src/commerce/fulfillment-fsm.test.ts`, `packages/backend/src/commerce/return.service.test.ts`, `tests/integration/orders-schema.spec.ts`, `tests/integration/fulfillment.spec.ts`, `tests/integration/returns.spec.ts` | Attempt invalid transition (PENDING to SHIPPED) or cancelled order; assert 400 Bad Request error. | **IMPLEMENTED** (Schema models in T046; saga transitions in T051; vendor fulfillment FSM in T056; cancellations & return requests in T058) |
| **OR-3** | Mock payment gateway with signed HMAC-SHA256 webhook callbacks and event deduplication. | `TASK-049`, `TASK-050`, `TASK-054` | `packages/backend/tests/integration/mock-payments.spec.ts`, `packages/backend/tests/integration/payment-webhooks.spec.ts`, `apps/api/src/webhook.controller.test.ts`, `apps/mock-payments/src/signer.test.ts` | Simulate webhook with bad signature (rejected 401); re-send valid event (deduped 200). | **IMPLEMENTED** (Mock simulator in T049; API webhook receiver & payment dispatch in T050; replay validation in T054) |
| **OR-4** | Transactional outbox pattern: order writes and domain events commit in one DB transaction. | `TASK-029`, `TASK-047` | `tests/integration/outbox.spec.ts`, `tests/integration/checkout.spec.ts` | Complete checkout; inspect DB; assert orders, suborders, reservations, and outbox rows committed together. | **IMPLEMENTED** |
| **OR-5** | Saga orchestration: reserve stock -> charge payment -> confirm; compensate on failure. | `TASK-051`, `TASK-052`, `TASK-053` | `tests/integration/order-saga.spec.ts`, `tests/integration/payment-reconciliation.spec.ts`, `tests/integration/checkout-expiry-race.spec.ts`, `packages/backend/src/commerce/order-completion.test.ts`, `packages/backend/src/payments/reconciliation.service.test.ts` | Inject payment simulator decline; verify stock released and order marked CANCELLED. | **IMPLEMENTED** (Order settlement saga in T051; payment reconciliation in T052; expiry race and late-payment refund in T053) |
| **OR-6** | Immediate seller suborders generated for fulfillment and independent payouts. | `TASK-046`, `TASK-047`, `TASK-055`, `TASK-056`, `TASK-070` | `tests/integration/orders-schema.spec.ts`, `tests/integration/checkout.spec.ts`, `tests/integration/order-query.spec.ts` | Checkout basket with 2 sellers; verify 1 parent order and 2 distinct seller_orders with store-scoped queries. | **IMPLEMENTED** (Relational model in T046; atomic splitting in T047; scoped queries & PII masking in T055; fulfillment in T056) |
| **OR-7** | Asynchronous invoice PDF generation by worker, persisted in MinIO object storage. | `TASK-061` | `apps/worker/src/documents/invoice.generator.test.ts`, `apps/worker/src/consumers/order-paid.consumer.test.ts`, `apps/api/src/orders.controller.test.ts`, `tests/integration/invoice-worker.spec.ts` | Complete order; wait for OrderPaid event; download generated invoice PDF from UI. | **IMPLEMENTED** (PDFKit invoice generator, MinIO persistence, notification deliveries ledger, and presigned download URL in T061) |
| **OR-8** | Full and partial refunds recorded with balanced double-entry financial ledger entries. | `TASK-060`, `TASK-070` | `packages/backend/src/payments/financial-ledger.service.test.ts`, `packages/backend/src/payments/refund.service.test.ts`, `tests/integration/refund-ledger.spec.ts` | Execute partial refund; verify financial_entries debit and credit sum to 0. | **IMPLEMENTED** (Double-entry ledger, row-level locking on payment attempt, support policy cap, and restocking in T060; payout reconciliation in T070) |
| **OR-9** | Discount coupons: percentage/fixed, per-user limits, and atomic global usage counts. | `TASK-045`, `TASK-063` | `packages/backend/src/promotions/coupon.service.test.ts`, `apps/api/src/promotions.controller.test.ts`, `apps/web/src/features/checkout/coupon-input.test.tsx`, `apps/web/src/features/seller/coupon-management.test.tsx`, `tests/integration/coupons.spec.ts` | Redeem coupon with max_uses=1 concurrently from 2 accounts; assert only 1 succeeds. | **IMPLEMENTED** (Quote proportional allocation without penny loss in T045; DB schema, atomic holds, per-user limits, and management/redemption UI in T063) |

---

### 1.6 Reviews and Ratings (`RV`)

| Requirement | Description | Task(s) | Automated Test | Manual Verification | Status |
|---|---|---|---|---|---|
| **RV-1** | Only verified purchasers can review; enforced `UNIQUE(product_id, user_id)`. | `TASK-064` | `packages/backend/tests/integration/reviews.spec.ts` | Attempt review without buying (denied 403); buy item, submit review; re-review (409). | **IMPLEMENTED** |
| **RV-2** | Aggregate star rating and review count stored denormalized on product, updated async. | `TASK-064` | `packages/backend/tests/integration/reviews.spec.ts` | Submit 5-star review; verify ReviewChanged event updates product rating_avg in search. | **IMPLEMENTED** |

---

### 1.7 Admin, Audit, Notifications (`AD`)

| Requirement | Description | Task(s) | Automated Test | Manual Verification | Status |
|---|---|---|---|---|---|
| **AD-1** | Immutable audit log capturing actor, action, store_id, IP, and redacted before/after JSON. | `TASK-015`, `TASK-029`, `TASK-062` | `packages/backend/src/platform/audit-sanitizer.test.ts`, `apps/api/src/audit.controller.test.ts`, `tests/integration/audit.spec.ts` | Perform seller approval and stock adjustment; verify audit_logs rows created. | **IMPLEMENTED** (Schema in 0003; Full audit sanitizer, domain wiring, and admin endpoint in T062) |
| **AD-2** | Admin and seller dashboards: GMV, daily order volume, and top-selling products; replica pool routing and partitioned audits. | `TASK-066`, `TASK-067`, `TASK-082` | `packages/backend/tests/integration/reporting-views.spec.ts`, `tests/integration/partitioning.spec.ts`, `docs/benchmarks/partitioning.md` | Open admin dashboard; verify charts render GMV and orders; verify replica pool routing and partition pruning. | **IMPLEMENTED** (Reporting views & analytics in T066; dashboards in T067; replica routing and table partitioning in T082) |
| **AD-3** | Transactional email/SMS notifications via BullMQ worker with retry and dead-letter queue. | `TASK-061`, `TASK-073` | `apps/worker/src/documents/invoice.generator.test.ts`, `apps/worker/src/consumers/order-paid.consumer.test.ts`, `tests/integration/invoice-worker.spec.ts` | Trigger order confirmation; inspect local delivery ledger and retry logic on error. | **IMPLEMENTED** (PDF generation, MinIO upload, notification delivery sink in T061; DLQ handling in T073) |
| **AD-4** | Feature flags engine supporting gradual percentage and store-scoped rollouts. | `TASK-076` | `packages/backend/src/platform/feature-flag.service.test.ts`, `apps/api/src/feature-flags.controller.test.ts`, `apps/api/tests/integration/feature-flags.spec.ts` | Toggle feature flag off in admin console; verify feature hides in storefront UI. | **IMPLEMENTED** |

---

## 2. Non-Functional Requirements & Engineering Goals

| Goal / SLO | Target | Task(s) | Verification Evidence | Status |
|---|---|---|---|---|
| **G1: Catalog Speed** | p95 < 150 ms on list/search on 100k products | `TASK-077`, `TASK-078`, `TASK-079`, `TASK-084` | `tests/integration/seed-large.spec.ts`, `docs/benchmarks/seed-evidence.md`, `tests/integration/query-plans.spec.ts`, `docs/benchmarks/query-plans.md`, `loadtests/results/browse-tier-l.json`, `docs/benchmarks.md` | **IMPLEMENTED** (Seed tiers & Zipfian skew in T077; query index & keyset in T078; load suites in T079; unified authoritative report in T084) |
| **G2: Zero Overselling** | 0 oversold units under 500 concurrent buyers / 50 stock | `TASK-044`, `TASK-053` | `loadtests/flash-sale.js`, `tests/integration/concurrency-race.spec.ts`: exactly 50 orders, 0 negative stock. | **IMPLEMENTED** (Reservation concurrency proven in T044) |
| **G3: Safe Payments** | Idempotency keys prevent double charge; webhook dedupe | `TASK-047`, `TASK-054` | `tests/integration/idempotency-concurrency.spec.ts`, `loadtests/retry-storm.js` | 20 concurrent replays = 1 charge, 1 order, 1 stock decrement. | **IMPLEMENTED** |
| **G4: Real RBAC & ABAC** | Permission matrix tests covering every route x role x store | `TASK-018`, `TASK-074` | `packages/backend/src/stores/permissions.test.ts`, `apps/api/tests/integration/permission-matrix.spec.ts`, `tests/security/security-regression.spec.ts`: 100% matrix pass across 7 roles, IDOR resistance, Uniform 404 rule, support $200 refund cap, SQL injection fuzzing, and CSRF protection. | **IMPLEMENTED** (Continuous Gate) |
| **G5: Pipeline Recovery** | Worker killed mid-flow; recovers without lost/duplicated side effects | `TASK-073` | `tests/chaos/worker-crash.spec.ts`: 20 concurrent orders, SIGKILL crash simulation, lease timeout expiry, and restarted worker re-claims batch via FOR UPDATE SKIP LOCKED < 60s with zero duplicate side effects. | **IMPLEMENTED** |
| **G6: Operability** | OpenTelemetry traces, Prometheus metrics, runbooks, backup drill, production packaging | `TASK-071`, `TASK-072`, `TASK-085`, `TASK-086`, `TASK-087` | `packages/backend/src/platform/tracer.test.ts`, `apps/api/src/request-id.hook.test.ts`, `tests/integration/tracing.spec.ts`, `packages/backend/src/platform/metrics.service.test.ts`, `apps/api/tests/integration/metrics.spec.ts`, `tests/integration/metrics.spec.ts`, `tests/integration/backup-restore.spec.ts`, `tests/integration/production-packaging.spec.ts`, `tests/integration/runbooks.spec.ts`, `docs/operations/deployment.md`, `docs/operations/runbooks.md` | OpenTelemetry traces in T071; Prometheus metrics & alerts in T072; backup & restore in T085; production packaging & rollback in T086; operational incident runbooks & drills in T087. | **IMPLEMENTED** |
| **SLO: Product List Cache** | p95 < 50 ms | `TASK-079` | `loadtests/results/browse-mix.json`: p95 108.5 ms uncached, < 25 ms with Redis cache hit. | **IMPLEMENTED** |
| **SLO: Product Detail** | p95 < 80 ms | `TASK-079` | `loadtests/results/browse-mix.json`: achieved 41.2 ms p95. | **IMPLEMENTED** |
| **SLO: Search Query** | p95 < 150 ms | `TASK-079` | `loadtests/results/search-stress.json`: achieved 126.8 ms p95 (autocomplete 38.6 ms p95). | **IMPLEMENTED** |
| **SLO: Checkout Endpoint**| p95 < 500 ms | `TASK-079` | `loadtests/results/checkout-load.json`: achieved 365.2 ms p95. | **IMPLEMENTED** |
| **SLO: Frontend Core Web Vitals** | Lighthouse Perf >= 90, LCP < 2.5s, CLS < 0.1, FID/TBT < 100ms | `TASK-080` | `lighthouserc.json`, `docs/benchmarks/web-vitals.md`, `tests/integration/lighthouse-ci.spec.ts`: Perf 100/100, LCP ~220ms, CLS 0.00-0.042, TBT 0.0ms. | **IMPLEMENTED** |
| **SLO: Endurance Soak & Contention** | 1-hour sustained 200 req/s; zero leak; zero pool starvation | `TASK-083` | `loadtests/soak-test.js`, `loadtests/results/soak-test.json`, `docs/benchmarks/soak-analysis.md`, `tests/integration/soak-metrics.spec.ts`: 720k reqs, drift 1.91 MB/hr, 0 starvation events, 0 deadlocks, error rate 0.019%. | **IMPLEMENTED** |
| **SLO: Domain Test Coverage** | >= 80% coverage on packages/backend domain logic | All tasks | Vitest coverage report: 100% on all domain modules. | **IMPLEMENTED** (Continuous Gate) |

---

## 3. Confirmed Product Scope Additions

| ID | Feature Description | Task(s) | Verification Method | Status |
|---|---|---|---|---|
| **REQ-STORE-001** | Branded store routing (`/stores/{slug}`) and marketplace routing (`/`). | `TASK-016`, `TASK-024` | Open `/` and `/stores/north-face`; verify distinct branding and products. | **IMPLEMENTED** |
| **REQ-STORE-002** | Scoped store memberships (`owner`, `manager`, `catalog-editor`, `fulfillment`). | `TASK-014`, `TASK-018` | Matrix test: catalog-editor cannot view payouts; manager cannot delete store. | **IMPLEMENTED** |
| **REQ-STORE-003** | Token-based theme customizer (colors, header layout, banner). | `TASK-016`, `TASK-023`, `TASK-068` | Update store theme tokens; inspect live CSS variable updates in storefront. | **IMPLEMENTED** |
| **REQ-STORE-004** | Customer address book with immutable delivery snapshots at checkout. | `TASK-091`, `TASK-047`, `TASK-055` | Update address in account; verify historical order retains original address. | **IMPLEMENTED** (Snapshot in T047) |
| **REQ-COMM-001** | Multi-seller basket splitting into independent suborders. | `TASK-046`, `TASK-056`, `TASK-057` | `tests/integration/fulfillment.spec.ts`, `tests/e2e/order-fulfillment.spec.ts` | Purchase from 2 sellers; verify Seller A can ship while Seller B is pending, each with independent tracking. | **IMPLEMENTED** |
| **REQ-COMM-002** | Signed server price quote preventing checkout on unreviewed price changes. | `TASK-045`, `TASK-047`, `TASK-048` | Trigger price increase during quote; verify checkout requires user re-approval in UI and server rejects stale quote token. | **IMPLEMENTED** |
| **REQ-COMM-003** | Customer return requests with seller physical inspection workflow. | `TASK-058`, `TASK-059` | `packages/backend/src/commerce/return.service.test.ts`, `tests/integration/returns.spec.ts`, `apps/web/src/features/returns/return-form.test.tsx`, `apps/web/src/features/returns/seller-approval.test.ts`, `tests/e2e/returns.spec.ts` | Submit return; seller inspects and approves; verify restock ledger entry. | **IMPLEMENTED** (Customer cancellation & return requests backend in T058; customer portal & seller inspection console in T059) |
| **REQ-COMM-004** | Double-entry accounting ledger balancing all debits and credits. | `TASK-060`, `TASK-070` | `packages/backend/src/payments/financial-ledger.service.test.ts`, `tests/integration/refund-ledger.spec.ts` | Query financial_entries; assert sum(debit_cents) - sum(credit_cents) = 0. | **IMPLEMENTED** (Double-entry validation, balanced record insertion, ledger audit queries in T060; payout balancing in T070) |
| **REQ-ENG-001** | Customer shared wishlist across marketplace and branded stores. | `TASK-065` | `packages/backend/tests/integration/wishlist.spec.ts` | Click heart icon on PDP; navigate to /account/wishlist; verify saved item and availability. | **IMPLEMENTED** |
| **REQ-ENG-002** | Materialized views for fast seller sales analytics and admin GMV reports. | `TASK-066`, `TASK-067` | `packages/backend/tests/integration/reporting-views.spec.ts`, `apps/api/src/analytics.controller.test.ts`, `apps/web/src/features/dashboard/dashboard-loader.test.ts` | Refresh materialized views; verify query response < 20ms and dashboard render. | **IMPLEMENTED** (Materialized views & services in T066; UI dashboards in T067) |
| **REQ-ENG-003** | Simulated periodic seller settlement with commission deductions. | `TASK-070` | `packages/backend/src/payments/settlement.service.test.ts`, `apps/worker/src/schedulers/settlement.scheduler.test.ts`, `tests/integration/settlements.spec.ts` | Trigger settlement job; verify seller payout ledger row and commission debit. | **IMPLEMENTED** (Settlement accounting, refund carry-forward, balanced ledgering in T070) |
