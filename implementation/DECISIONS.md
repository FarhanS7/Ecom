# Architecture Decision Records (ADRs): ShopScale

> **Authoritative Architectural Decisions**  
> Every decision recorded here is binding across the entire project.

---

## DEC-001 — Modular Monolith Architecture with Separated Worker Process

### Context
ShopScale must demonstrate production-grade distributed behavior (asynchronous jobs, event projections, crash recovery, and queue decoupling) while remaining maintainable and runnable by a single engineer on an 8 GB development machine.

### Decision
Implement the backend as a **modular monolith** in TypeScript. Domain modules live in `packages/backend` and are consumed by two independently executable application roots:
1. `apps/api`: NestJS + Fastify HTTP server.
2. `apps/worker`: BullMQ background job processor and outbox relay.

Next.js App Router (`apps/web`) serves presentation and acts as a same-origin proxy.

### Why
- Provides strict domain boundaries through exported module ports without network overhead.
- Allows worker processes to be killed, restarted, or scaled independently of HTTP request handlers.
- Eliminates distributed transaction coordination, network serialization, and multi-repo friction.

### Alternatives Considered
- **Microservices**: Each domain as a separate deployed service communicating over HTTP/gRPC.
- **Single Process Monolith**: Running cron jobs and queue workers inside the HTTP server thread.

### Why Alternatives Were Rejected
- Microservices introduce extreme operational complexity, distributed consistency challenges, and memory footprint exceeding host capabilities.
- In-process workers risk blocking the HTTP event loop during heavy CPU tasks (e.g., PDF generation or reindexing) and make crash-recovery testing impossible.

### Consequences
- Modules share a single PostgreSQL database instance and schema migration tool.
- Modules must strictly respect encapsulation rules; cross-module table mutations are prohibited.

### Related Requirements
- G5, G6, ARCH-001

### Related Tasks
- `TASK-001`, `TASK-002`, `TASK-029`, `TASK-073`

---

## DEC-002 — Data Access via Drizzle ORM and Explicit SQL for Hot Paths

### Context
The application needs typed query composition and rapid migration generation for CRUD operations, but also requires raw query execution and explicit locking on high-concurrency transactional paths (such as inventory updates, keyset cursor pagination, and outbox polling).

### Decision
Adopt **Drizzle ORM** with `node-postgres` as the data access framework. Use Drizzle's typed schema and query builder for standard entity operations, but write parameterized raw SQL for hot paths requiring explicit locking (`FOR UPDATE`, `SKIP LOCKED`), keyset tuples, or PostgreSQL-specific extensions (`pg_trgm`, `tsvector`).

### Why
- Drizzle generates clean, human-readable SQL and avoids heavy runtime reflection or query caching layers.
- Raw SQL on hot paths allows exact control over query plans and `EXPLAIN ANALYZE` optimizations.
- Zero-downtime, reviewable SQL migrations in `db/migrations/`.

### Alternatives Considered
- **Prisma**: Heavy Rust query engine, lack of native support for `FOR UPDATE SKIP LOCKED`, and high memory footprint.
- **TypeORM**: Heavy Active Record / Data Mapper complexity, historical issues with complex migrations, and unpredictable subqueries.

### Why Alternatives Were Rejected
- Prisma's query engine overhead conflicts with strict p95 latency targets (<150ms on 100k products).
- TypeORM hides SQL execution details, making concurrency tuning and index proofs difficult.

### Consequences
- Developers must maintain Drizzle schema definitions and understand raw SQL execution.
- Complex queries require integration tests against real PostgreSQL.

### Related Requirements
- G1, G2, NFR-001

### Related Tasks
- `TASK-003`, `TASK-019`, `TASK-022`, `TASK-037`, `TASK-078`

---

## DEC-003 — Multi-Store Routing, Independent Channel Carts, and Shared Marketplace

### Context
ShopScale operates as both a multi-seller marketplace (`/`) and a multi-tenant platform with branded stores (`/stores/{slug}`). Sellers need store independence while shoppers benefit from a unified discovery marketplace.

### Decision
1. Route the shared marketplace at `/` and individual stores at `/stores/{slug}` under a unified domain.
2. Maintain separate, independent carts per channel: a customer can have an active marketplace cart containing items from multiple sellers, alongside separate single-store carts for specific vendor storefronts. No cross-channel cart merging is permitted.
3. Products belong to one seller store and can be independently enabled for marketplace publication and store-specific publication.

### Why
- Single-origin architecture simplifies cookie authentication, CSRF protection, and local development.
- Channel-scoped carts prevent confusing pricing policies, distinct shipping rules, and unexpected seller cross-subsidies.

### Alternatives Considered
- **Custom Domains per Store**: e.g., `store-a.shopscale.dev`.
- **Unified Global Cart**: A single cart mixing store-specific purchases with marketplace purchases.

### Why Alternatives Were Rejected
- Custom domains require complex SSL wildcard certificates, cross-domain SSO, and cookie synchronization.
- A global cart creates user confusion when checkout rules or store-specific coupons apply to only a fraction of the basket.

### Consequences
- Next.js routing and middleware must resolve channel context from route segments.
- Cart and checkout endpoints require an explicit `channelKey` parameter.

### Related Requirements
- ID-5, CT-1, CA-1, REQ-STORE-001

### Related Tasks
- `TASK-014`, `TASK-016`, `TASK-021`, `TASK-041`, `TASK-047`

---

## DEC-004 — Cookie-Based JWT Session Management with Refresh Token Family Rotation

### Context
Authentication must support stateless API authorization for performance, server-enforced session revocation, and security against cross-site scripting (XSS) and token theft.

### Decision
1. Issue short-lived JWT access tokens (15 minutes) containing `userId` and platform roles.
2. Issue long-lived refresh tokens (7 days) stored as SHA-256 hashes in a PostgreSQL `refresh_tokens` table, organized into `session_families`.
3. Transport tokens via `HttpOnly`, `SameSite=Lax`, `Secure` cookies.
4. **Reuse Detection**: Presenting an already-consumed refresh token immediately invalidates its entire session family, logging an audit alert and revoking all derived access.

### Why
- HttpOnly cookies protect tokens from theft via browser XSS vulnerabilities.
- Short access token lifetimes limit exposure, while refresh token rotation provides continuous security monitoring.
- Family revocation neutralizes stolen token race conditions.

### Alternatives Considered
- **Bearer Tokens in LocalStorage**: Common in SPAs.
- **Pure Database Sessions**: Stateful session checks on every single HTTP request.

### Why Alternatives Were Rejected
- LocalStorage is completely exposed to malicious third-party scripts or compromised dependencies.
- Querying PostgreSQL on every request introduces significant latency bottlenecks under high traffic.

### Consequences
- Requires Next.js server-side proxying and CSRF double-submit token protection on mutating requests.
- Logout requires clearing both cookies and database session records.

### Related Requirements
- ID-1, ID-3, G4, SEC-001

### Related Tasks
- `TASK-009`, `TASK-010`, `TASK-011`, `TASK-013`, `TASK-017`

---

## DEC-005 — Shared Inventory Pool with Atomic Reservation TTL and Movement Ledger

### Context
A physical inventory unit must never be oversold even when hundreds of concurrent customers checkout simultaneously across marketplace and store channels.

### Decision
1. Model inventory with `on_hand` and `reserved` integer counters. Available stock is calculated dynamically: `available = on_hand - reserved`.
2. Atomic reservation occurs during checkout initiation using a conditional single-row update:
   ```sql
   UPDATE inventory 
   SET reserved = reserved + :qty, version = version + 1 
   WHERE variant_id = :id AND (on_hand - reserved) >= :qty;
   ```
3. Reservations expire after 15 minutes via a scheduled worker job if payment is not completed.
4. Every change to `on_hand` or `reserved` produces an immutable, append-only record in `stock_movements`.
5. Multiple variants in a single order are locked in ascending `variant_id` order.

### Why
- Conditional SQL updates guarantee that overselling is physically impossible at the database engine level.
- Ascending lock ordering mathematically eliminates deadlocks during multi-item checkouts.
- The append-only ledger provides total auditability and reconciles discrepancies.

### Alternatives Considered
- **Application-Level Read-Check-Write**: Reading stock, checking availability in Node.js, then writing.
- **Redis as Primary Stock Authority**: Maintaining stock counters exclusively in Redis.

### Why Alternatives Were Rejected
- Read-Check-Write introduces fatal race conditions under concurrency (TOCTOU).
- Redis lacks durable relational ACID guarantees; data loss or desynchronization with PostgreSQL causes irrecoverable inventory drift.

### Consequences
- Failed reservations immediately abort checkout with an `INSUFFICIENT_STOCK` error.
- Background worker must run reliable reservation cleanup sweeps.

### Related Requirements
- G2, IN-1, IN-2, IN-3, IN-4

### Related Tasks
- `TASK-037`, `TASK-038`, `TASK-039`, `TASK-044`, `TASK-053`

---

## DEC-006 — Transactional Outbox Pattern and BullMQ for Durable Event Processing

### Context
Domain mutations (catalog edits, order creation, payments) must emit events to trigger asynchronous side effects (search reindexing, customer emails, PDF generation). Directly publishing to an external message broker after database commits causes dual-write inconsistencies if the broker is unavailable.

### Decision
1. Implement the **Transactional Outbox Pattern**: business mutations and outbox event records are inserted into PostgreSQL within the **exact same ACID transaction**.
2. A lightweight background relay worker continuously polls unpublished outbox records using `SELECT ... FOR UPDATE SKIP LOCKED` and enqueues jobs into **BullMQ** (running on Redis).
3. Consumers track execution using a `consumer_receipts(consumer_name, event_id)` table, ensuring at-least-once delivery with idempotent execution.

### Why
- Guarantees zero event loss even if the worker, Redis, or API server crashes mid-flight.
- `SKIP LOCKED` prevents lock contention across multiple relay worker instances.
- Consumers cannot accidentally re-apply stale or duplicated events.

### Alternatives Considered
- **Direct Dual-Write**: Writing to PostgreSQL and calling Redis/RabbitMQ in sequence.
- **Change Data Capture (CDC)**: Using Debezium / Kafka to read PostgreSQL WAL logs.

### Why Alternatives Were Rejected
- Direct dual-write inevitably loses events when the broker or network fails after database commit.
- CDC with Kafka/Debezium introduces massive infrastructure overhead incompatible with local development constraints.

### Consequences
- Outbox table grows continuously; requires periodic archiving/cleanup jobs.
- Relay introduces minor asynchronous delivery latency (~50-200ms).

### Related Requirements
- G5, OR-4, CT-6, AD-3

### Related Tasks
- `TASK-029`, `TASK-030`, `TASK-071`, `TASK-073`

---

## DEC-007 — Event-Projected PostgreSQL Full-Text Search with OpenSearch Migration Path

### Context
The catalog must support sub-150ms typo-tolerant text search, brand/category filtering, and facet counts across 100,000 products. OpenSearch was proposed in the original PRD, but running OpenSearch on an 8 GB development machine consumes excessive resources.

### Decision
1. Implement the primary search engine for V1 using a dedicated PostgreSQL search projection table (`search_documents`) powered by `tsvector` full-text search and `pg_trgm` trigram similarity.
2. The search projection is updated asynchronously via outbox events (`ProductChanged`, `InventoryChanged`).
3. Define a strict search service interface (`SearchPort`) in `@shopscale/contracts`.
4. In Milestone 9 (`TASK-081`), build an optional OpenSearch adapter that implements the exact same `SearchPort` interface for performance benchmarking.

### Why
- PostgreSQL FTS and trigram indexes comfortably handle 100k products with sub-150ms p95 latency while consuming negligible memory.
- Decoupling search queries from live normalized product tables prevents search traffic from impacting transactional commerce locks.
- Defining `SearchPort` enables seamless future infrastructure migration without rewriting application logic.

### Alternatives Considered
- **Mandatory OpenSearch Container**: Running Elasticsearch/OpenSearch 8 from Milestone 0.
- **Direct Queries on Normalized Tables**: Querying `products` and `product_variants` directly with `ILIKE`.

### Why Alternatives Were Rejected
- OpenSearch requires >= 2 GB RAM baseline, starving Node.js and PostgreSQL on laptop hardware.
- Direct `ILIKE` queries on normalized tables cause sequential table scans, catastrophic N+1 query patterns, and lock contention.

### Consequences
- Search projection must handle out-of-order event versions and publication tombstones.
- Requires `CREATE EXTENSION IF NOT EXISTS pg_trgm`.

### Related Requirements
- G1, CT-3, CT-4, CT-6

### Related Tasks
- `TASK-030`, `TASK-031`, `TASK-032`, `TASK-034`, `TASK-081`

---

## DEC-008 — Deterministic Mock Payment Simulator with Signed HMAC Webhook Callbacks

### Context
ShopScale is a portfolio-grade demonstration platform. Real payment credentials (Stripe, Adyen) cannot be checked into the repository or required from external reviewers, but the implementation must exercise real payment engineering challenges: idempotency, network timeouts, signed callbacks, and failure compensation.

### Decision
Build a **deterministic mock payment simulator** (`apps/mock-payments`):
1. Emulates payment intents, authorizations, charges, and refunds.
2. Supports configurable deterministic behavior via payload flags (e.g., simulate immediate success, decline, 5-second timeout, or network crash).
3. Delivers asynchronous webhook notifications signed with `HMAC-SHA256` using a shared webhook secret and timestamp header (`X-ShopScale-Signature`).
4. Webhook receiver validates signatures over raw request bytes and deduplicates events using `webhook_events(provider, event_id)`.

### Why
- Allows reviewers to clone the repository, run automated tests, and reproduce all payment failure/retry scenarios with zero external API dependencies.
- Replicates the exact security and architectural constraints of production payment gateways (Stripe/Adyen).

### Alternatives Considered
- **Stripe Test Mode**: Requiring reviewers to register Stripe accounts and supply live API keys.
- **In-Memory Payment Stub**: Simply returning `{ status: 'success' }` synchronously in the checkout endpoint.

### Why Alternatives Were Rejected
- Requiring real API keys prevents automated CI runs and reproducible one-command demo verification.
- In-memory stubs fail to prove asynchronous webhook ingestion, reconciliation, signature verification, and compensation.

### Consequences
- Mock payment service must be maintained as part of the repository codebase.
- Webhook endpoints must be exposed on the local network/container bridge.

### Related Requirements
- G3, OR-1, OR-3, OR-5

### Related Tasks
- `TASK-049`, `TASK-050`, `TASK-051`, `TASK-052`, `TASK-054`

---

## DEC-009 — Resource Profiles and Seed Tiers (S, M, L, XL) for High-Volume Benchmarking

### Context
The PRD mandates verifying performance SLOs against a 100,000-product dataset (Tier L), but running heavy load tests alongside full local services can overwhelm an 8 GB host machine during daily feature development.

### Decision
1. Define four deterministic seed volume tiers:
   - **Tier S (1k products)**: Fast local development, unit, and integration testing (< 30 seconds to seed).
   - **Tier M (10k products)**: Feature validation and unindexed query detection.
   - **Tier L (100k products)**: The headline benchmark tier where all PRD SLOs (p95 < 150ms) are validated.
   - **Tier XL (1M products)**: Stretch scaling and partitioning experiments.
2. Seeder uses PostgreSQL `COPY` via `pg-copy-streams` for bulk loading (Tier L seeds in < 10 minutes).
3. Provide Docker Compose profiles: default minimal profile (Postgres + Redis), and optional profiles for telemetry (`infra/compose.telemetry.yml`) and OpenSearch.

### Why
- Prevents development friction while guaranteeing that performance claims are backed by reproducible large-scale data.
- Bulk `COPY` loading avoids slow row-by-row ORM insertions.

### Alternatives Considered
- **Uniform Seed Script**: A single static fixture file.
- **Row-by-Row ORM Seeding**: Using Drizzle `insert()` statements.

### Why Alternatives Were Rejected
- A single fixture cannot scale between fast local dev and 100k-product benchmarks.
- Row-by-row ORM inserts take hours to load 100k products and millions of order items.

### Consequences
- Seeder must maintain deterministic PRNG generators (`seed=42`) with realistic Zipfian and log-normal distributions.

### Related Requirements
- G1, NFR-001, PRD Section 11

### Related Tasks
- `TASK-004`, `TASK-028`, `TASK-077`, `TASK-078`, `TASK-079`, `TASK-084`

---

## DEC-010 — Seller Catalog Lifecycle Transitions and Console Validation Boundary

### Context
In Milestone 2, products initially created by sellers are saved as `draft` and need a clear lifecycle progression to `active` or `archived`. Furthermore, scoped store routes return generic `404 Not Found` for unauthorized or malformed requests to prevent tenancy oracles, which prevents returning field-specific validation errors from the API.

### Decision
1. Product lifecycle transitions occur via versioned `PATCH /v1/seller/stores/{id}/products/{productId}` with `status: 'draft' | 'active'`. Archival has a dedicated endpoint `POST /.../archive` because it is terminal.
2. Activating a product requires at least one active variant inside the same transaction; `min_price_cents` is refreshed automatically.
3. The Next.js seller console validates form submissions on the Next.js server (Server Actions) against shared `@shopscale/contracts` Zod schemas, returning field-specific errors to the browser before calling the backend API.
4. Seller write routes remain off the public Next.js gateway allowlist; browsers cannot directly invoke raw seller mutation endpoints.

### Why
- Guarantees published products always have active variants and valid prices.
- Preserves the API's uniform 404 security rule while giving sellers immediate, actionable field validation in the UI.

### Alternatives Considered
- **Dedicated `/publish` Endpoint**: Introducing an additional route for publication.
- **Client-Only Validation**: Relying solely on React form validation in the browser.

### Why Alternatives Were Rejected
- `/publish` duplicates existing patch mechanics and creates ambiguity with per-channel publication toggles.
- Client-only validation can be bypassed and violates defense-in-depth principles.

### Consequences
- Next.js server actions act as a secure validation layer between the browser and NestJS API.

### Related Requirements
- CT-1, G4, SEC-003

### Related Tasks
- `TASK-020`, `TASK-027`

---

## DEC-011 — Immediate Seller Suborder Splitting at Checkout with Atomic Reservation

### Context
A marketplace customer basket can contain items from multiple independent sellers. The customer expects a single checkout and payment, while sellers need independent fulfillment, tracking, and payout accounting.

### Decision
1. During checkout initiation, validate all items, reserve all stock across sellers in one atomic transaction, and generate a single parent `orders` record.
2. Immediately generate child `seller_orders` records—one per distinct vendor in the basket.
3. Order items reference their respective `seller_order_id` and snapshot variant title, SKU, price, and commission rate.
4. Parent order fulfillment status is dynamically derived from child suborders: parent is `DELIVERED` only when all child suborders reach `DELIVERED`.

### Why
- Provides a frictionless unified buyer experience while decoupling seller fulfillment workflows.
- Eliminates complex post-payment suborder splitting batches that could fail mid-flight.

### Alternatives Considered
- **Forced Multi-Checkout**: Requiring customers to checkout separately for each seller.
- **Asynchronous Order Splitting**: Creating parent order first, then splitting suborders in a background worker.

### Why Alternatives Were Rejected
- Multi-checkout degrades buyer conversion and violates standard marketplace expectations.
- Asynchronous splitting introduces window-of-vulnerability states where parent order is paid but suborders fail to create.

### Consequences
- Checkout transaction must insert parent order, suborders, and order items atomically.

### Related Requirements
- OR-2, OR-6, REQ-COMM-001

### Related Tasks
- `TASK-046`, `TASK-047`, `TASK-055`, `TASK-056`

---

## DEC-012 — Double-Entry Balanced Financial Ledger for Orders, Refunds, and Settlements

### Context
Financial accounting across multiple sellers, commissions, refunds, and payouts must be mathematically balanced and immune to rounding drift or lost transactions.

### Decision
1. Maintain an immutable, append-only `financial_entries` table.
2. Every financial event (order payment, full/partial refund, dispute, simulated seller settlement) must write balanced debit and credit entries where:
   $$\sum \text{debits} = \sum \text{credits}$$
3. Accounts include `customer_receivable`, `seller_payable`, `platform_commission`, and `payment_gateway_clearing`.
4. Cumulative refunds on an order cannot exceed captured payment; locks on the parent payment record prevent concurrent refund over-allocation.

### Why
- Guarantees financial integrity and auditability.
- Discrepancies immediately fail database insertion or validation tests.
- Reconciles marketplace revenue and seller payout liabilities cleanly.

### Alternatives Considered
- **Mutable Balance Columns**: Storing a running `balance_cents` on the `sellers` or `orders` table.
- **Single-Entry Transaction Log**: Simply recording "seller received $X".

### Why Alternatives Were Rejected
- Mutable balance columns are prone to lost updates under concurrency and provide zero audit trail.
- Single-entry logs make reconciliation and financial error discovery nearly impossible.

### Consequences
- All refund and payout services must construct balanced transaction entries.
- Integration tests must verify the zero-sum ledger balance invariant.

### Related Requirements
- G3, OR-8, AD-1

### Related Tasks
- `TASK-060`, `TASK-062`, `TASK-070`
