# Project Risk Register: ShopScale

> **Authoritative Technical Risk Analysis and Mitigation Protocols**  
> Focuses on real concurrency, multi-tenancy, transactional, and performance pitfalls.

---

## RISK-001: Cross-Channel Stock Contention and Inventory Overselling

### Risk
When high volumes of concurrent shoppers attempt to purchase the same popular item across multiple channels (the shared marketplace and branded store pages), race conditions could cause the available inventory to drop below zero, resulting in unfulfillable orders.

### Impact
**CRITICAL**. Breaches core portfolio goal G2 and damages platform credibility. Requires expensive manual customer cancellations and financial chargebacks.

### Likelihood
**HIGH** during flash sale promotions or automated load testing.

### Affected Requirements
- G2, IN-1, IN-2, IN-3, NFR-008

### Affected Tasks
- `TASK-037`, `TASK-038`, `TASK-044`, `TASK-053`

### Mitigation
1. Enforce atomic single-row conditional database updates:
   ```sql
   UPDATE inventory 
   SET reserved = reserved + :qty, version = version + 1 
   WHERE variant_id = :id AND (on_hand - reserved) >= :qty;
   ```
2. When an order contains multiple line items, sort all variant IDs in ascending alphanumeric order before acquiring row locks, eliminating database deadlocks.
3. Database `CHECK (on_hand >= 0 AND reserved >= 0 AND reserved <= on_hand)` constraints make negative stock impossible at the engine level.

### Validation
Run `TASK-044` concurrency load suite: 500 concurrent virtual users competing for 50 stock units. Assert exactly 50 successful checkouts and 0 negative stock incidents.

### Fallback
If PostgreSQL lock contention creates excessive queueing on hot items, place a lightweight Redis Lua script pre-decrement gate in front of checkout initiation, while keeping PostgreSQL as the final transactional authority.

---

## RISK-002: Multi-Tenant Data Leakage and Cross-Store Resource Probing

### Risk
Store staff or malicious third parties could alter URL IDs or request parameters to access or mutate another seller's private products, orders, revenue figures, or customer PII. Furthermore, returning a `403 Forbidden` error on out-of-scope store IDs acts as a security oracle, allowing attackers to enumerate valid store resources.

### Impact
**CRITICAL**. Data breach, tenant isolation collapse, and regulatory compliance failure.

### Likelihood
**MEDIUM** without systematic query scoping.

### Affected Requirements
- G4, ID-5, CT-1, OR-6, SEC-003

### Affected Tasks
- `TASK-014`, `TASK-018`, `TASK-020`, `TASK-056`, `TASK-074`

### Mitigation
1. Every store-scoped table enforces composite keys `(store_id, resource_id)`.
2. Query repositories must derive `store_id` strictly from verified session tokens, never from unauthenticated request payloads.
3. Enforce the **Uniform 404 Rule**: Any request targeting a resource outside the actor's verified store membership returns generic `404 Not Found` (indistinguishable from a non-existent resource), completely eliminating existence oracles.

### Validation
Run `TASK-074` authorization matrix test: iterates every HTTP verb and route across every role (`Guest`, `Customer`, `Seller 1`, `Seller 2`, `Support`, `Admin`), asserting that cross-store access is rejected with uniform 404.

### Fallback
Implement a global NestJS interceptor that validates route parameter `{storeId}` against `request.user.storeMemberships` prior to controller handler execution.

---

## RISK-003: Payment Outcome Uncertainty and Late Webhook After Expiry

### Risk
A customer initiates checkout, reserving stock with a 15-minute TTL. The payment provider experiences network latency and takes 16 minutes to authorize the charge. In the interim, the reservation expiry worker releases the stock and sells it to another buyer. When the payment webhook arrives, the order is confirmed without available inventory.

### Impact
**HIGH**. Causes post-payment overselling or dangling charges.

### Likelihood
**MEDIUM** during real-world network degradations.

### Affected Requirements
- G2, G3, OR-2, OR-3, OR-5

### Affected Tasks
- `TASK-039`, `TASK-050`, `TASK-051`, `TASK-052`, `TASK-053`

### Mitigation
1. Payment webhook consumer acquires a transactional row lock on both the `orders` record and the `stock_reservations` record before transitioning state.
2. If the reservation is found to be in `EXPIRED` status when a successful payment webhook arrives, the transaction:
   - Does NOT transition the order to `PAID`.
   - Transitions the order to `CANCELLED_EXPIRED`.
   - Dispatches an automated compensation refund request to the payment simulator.
   - Emits an `OrderPaymentCompensated` outbox event to notify the customer.

### Validation
Execute `TASK-053` race condition test: artificially trigger reservation expiry, then deliver a `payment.succeeded` webhook for that checkout ID. Verify order is marked `CANCELLED_EXPIRED` and an automated refund entry is created in `financial_entries`.

### Fallback
Manual support queue dashboard flagging all expired-paid collision events for staff inspection.

---

## RISK-004: Dual-Write Failure and Event Loss Between DB and Message Broker

### Risk
If the API server updates order status in PostgreSQL and then attempts to publish an event directly to Redis/RabbitMQ, a network partition, process crash, or broker restart between the two steps will result in the event being permanently lost. Downstream search projections, customer notifications, and invoices will never trigger.

### Impact
**HIGH**. Inconsistent state between read models, search, and core database.

### Likelihood
**HIGH** under standard deployment lifecycles or worker restarts.

### Affected Requirements
- G5, CT-6, OR-4, AD-3

### Affected Tasks
- `TASK-029`, `TASK-030`, `TASK-073`

### Mitigation
1. Implement the **Transactional Outbox Pattern**: domain mutations and outbox event records are inserted inside the **exact same ACID database transaction**.
2. A resilient relay worker polls outbox records using `SELECT ... FOR UPDATE SKIP LOCKED` and publishes to BullMQ.
3. Consumers record completion in `consumer_receipts(consumer_name, event_id)` within the projection transaction, guaranteeing idempotent at-least-once processing.

### Validation
Run `TASK-073` chaos recovery test: abruptly terminate the relay worker (`SIGKILL`) between message dequeue and acknowledgment. Verify that upon restart, all committed events are re-enqueued with zero loss or corruption.

### Fallback
Daily outbox reconciliation job scanning for `outbox` records with `published_at IS NULL` older than 5 minutes.

---

## RISK-005: Keyset Pagination Tuple Drift at 100k+ Scale

### Risk
High-volume catalog listing endpoints sorted by multiple attributes (e.g., `(category_id, min_price_cents, id)`) can experience severe index scan degradation if composite indexes do not exactly match the query's sort and filter columns. Furthermore, traditional `OFFSET` pagination causes $O(N)$ query scans that exceed the 150ms p95 latency target.

### Impact
**HIGH**. Breaches core portfolio goal G1 and degrades browse performance.

### Likelihood
**HIGH** when dataset exceeds Tier M (10k products).

### Affected Requirements
- G1, CT-2, NFR-001, NFR-002

### Affected Tasks
- `TASK-021`, `TASK-022`, `TASK-077`, `TASK-078`

### Mitigation
1. Ban `OFFSET / LIMIT` pagination across all public listing routes.
2. Implement keyset cursor pagination encoding the tuple:
   ```sql
   WHERE (created_at, id) < (:cursor_created_at, :cursor_id)
   ORDER BY created_at DESC, id DESC
   LIMIT :limit;
   ```
3. Add dedicated composite indexes matching exact cursor ordering:
   - `products (category_id, min_price_cents, id)`
   - `products (category_id, created_at DESC, id DESC)`
   - Partial index: `products (category_id, sales_count DESC) WHERE status = 'active'`

### Validation
Run `TASK-078` benchmark on Tier L (100,000 products): compare `OFFSET 50000` (typically > 800ms) against Keyset cursor navigation (p95 < 25ms) documented with `EXPLAIN ANALYZE`.

### Fallback
Cap maximum allowed category pagination depth to 1,000 items if non-indexed facet queries are introduced.

---

## RISK-006: Laptop Host Resource Exhaustion (OOM) on 8 GB RAM

### Risk
Running full Docker containers (PostgreSQL 16, Redis 7, MinIO, OpenSearch 8, Jaeger, Prometheus, Grafana, Next.js, Fastify API, BullMQ Worker) simultaneously on an 8 GB development laptop will exhaust physical RAM, causing aggressive swap thrashing or Docker daemon termination.

### Impact
**HIGH** for developer velocity and demonstration reproducibility.

### Likelihood
**HIGH** if heavy infrastructure containers are booted together.

### Affected Requirements
- PRD Section 3, Section 7, Milestone 0

### Affected Tasks
- `TASK-004`, `TASK-009`, `TASK-081`, `TASK-084`

### Mitigation
1. Default local environment boots **only minimal containers**: PostgreSQL 16 and Redis 7 (total footprint < 500 MB RAM).
2. API, Web, and Worker processes run as native host Node.js processes rather than containers during development.
3. Primary search uses PostgreSQL FTS (`search_documents`) rather than heavy Java-based OpenSearch.
4. Heavy profiles (OpenSearch in `compose.search.yml` and Telemetry in `compose.telemetry.yml`) are strictly optional and run isolated for specific benchmarking tasks.

### Validation
Inspect `docker stats` during standard local operation; assert total memory consumption remains below 1.5 GB.

### Fallback
Run performance benchmarks in headless CI runners or an isolated cloud virtual machine if host hardware is constrained.

---

## RISK-007: Cache Stampede on Hot Product Detail Pages

### Risk
When a popular product is promoted (or cache TTL expires during high traffic), thousands of concurrent requests miss the cache simultaneously, overloading PostgreSQL with identical queries and causing connection pool starvation.

### Impact
**MEDIUM**. Temporary latency spike or HTTP 504 Gateway Timeouts.

### Likelihood
**MEDIUM** during marketing events or load test spikes.

### Affected Requirements
- G1, CT-5, NFR-003

### Affected Tasks
- `TASK-033`, `TASK-079`

### Mitigation
1. Implement Redis single-flight mutex lock (`SET lock:pdp:{id} 1 EX 5 NX`): only the first request hitting a cache miss queries PostgreSQL.
2. Concurrent requests either wait with exponential backoff (up to 200ms) or receive the previous cached payload with `stale-while-revalidate` semantics.
3. Apply randomized TTL jitter (e.g., 300s $\pm$ 30s) to prevent bulk synchronized expirations.

### Validation
Run `TASK-033` stampede test: fire 100 concurrent requests on an uncached PDP; assert exactly 1 SQL query reaches PostgreSQL.

### Fallback
Serve pre-rendered static HTML from Next.js ISR cache if Redis becomes unreachable.

---

## RISK-008: Outbox Relay Crash Mid-Batch Causing Duplicate Delivery

### Risk
The outbox relay worker claims 50 unpublished records, enqueues them into BullMQ, and crashes immediately before updating `published_at = NOW()` in PostgreSQL. Upon restart, the relay re-claims the same 50 records and enqueues them a second time.

### Impact
**MEDIUM**. Duplicate customer emails, redundant PDF generations, or duplicate stock notifications.

### Likelihood
**MEDIUM** during container restarts or deployments.

### Affected Requirements
- G5, OR-4, AD-3

### Affected Tasks
- `TASK-029`, `TASK-030`, `TASK-061`, `TASK-073`

### Mitigation
1. Enqueue BullMQ jobs with deterministic `jobId = eventId + ":" + consumerName`. BullMQ natively deduplicates duplicate job IDs within the retention window.
2. Database consumers track completion in `consumer_receipts(consumer_name, event_id)` inside their write transaction.
3. External effect workers (e.g., mock email dispatch) derive idempotency keys from `eventId`.

### Validation
Run `TASK-073` chaos test: kill worker process immediately after BullMQ enqueue; verify that re-running relay produces zero duplicate side effects.

### Fallback
Periodic deduplication audit script identifying any anomalous duplicate receipt entries.
