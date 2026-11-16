# Canonical Test Strategy: ShopScale

> **Authoritative Verification Architecture and Quality Gates**  
> Every task must adhere to the testing standards, frameworks, and coverage targets specified here.

---

## 1. Testing Philosophy & Principles

1. **Tests Are Proof, Not Documentation**: No feature or bug fix is complete without automated test proof. "Seems right" is rejected.
2. **Real Databases for Integration Tests**: Database tests execute against a **real PostgreSQL container** (no SQLite or in-memory mocks). Mocks cannot verify index scans, foreign key cascades, transaction locks (`FOR UPDATE`), or PostgreSQL-specific extensions (`pg_trgm`, `tsvector`).
3. **Red-Green-Refactor Cycle**: Implementation agents must write or update a failing test *first*, execute it to confirm RED, implement the minimal logic to make it GREEN, and refactor.
4. **Test Pyramid**:
   - **Unit Tests (Fast, High Volume)**: Pure domain logic, state machines, DTO validation, mathematical calculations (discounts, commissions), and error mapping.
   - **Integration Tests (Medium Volume, Real I/O)**: Database repositories, transaction coordinators, outbox relays, and BullMQ worker consumers.
   - **Contract Tests**: Zod schema round-trips and OpenAPI specification drift validation.
   - **E2E Tests (Focused, Critical Journeys)**: Playwright browser tests covering complete shopper and seller flows.
   - **Concurrency & Chaos Tests (Proof-of-Scale)**: k6 load scripts proving inventory invariants and idempotency under load.

---

## 2. Test Frameworks & Execution Commands

| Test Layer | Framework / Tool | Scope | Command |
|---|---|---|---|
| **Backend Unit & Integration** | Vitest (`packages/backend`) | Domain services, Drizzle repositories, transaction ports. | `pnpm --filter=@shopscale/backend test` |
| **API Endpoints** | Vitest (`apps/api`) | Fastify controllers, guards, filters, route contracts. | `pnpm --filter=@shopscale/api test` |
| **Contracts & Config** | Vitest (`packages/contracts`, `packages/config`) | Zod schemas, environment variable parsing. | `pnpm --filter=@shopscale/contracts test` |
| **Frontend Components** | Vitest + React Testing Library (`apps/web`) | Next.js UI components, client islands, form hooks. | `pnpm --filter=@shopscale/web test` |
| **End-to-End (E2E)** | Playwright (`tests/e2e`) | Browser user journeys, cookie sessions, navigation. | `pnpm test:e2e` |
| **Concurrency & Load** | k6 (`loadtests/`) | Flash sales, browse mix, search stress, idempotency. | `k6 run loadtests/[scenario].js` |

---

## 3. Detailed Testing Levels

### 3.1 Unit Testing
- **Location**: Co-located with source files (e.g., `src/commerce/quote.service.test.ts`).
- **Focus**:
  - Pure calculation functions (e.g., proportional discount allocation, sales tax placeholders).
  - State machine transitions (e.g., `order.transitionTo('PAID')`).
  - Error condition mappings and typed error codes (`INSUFFICIENT_STOCK`, `PRICE_CHANGED`).
  - Edge cases: boundary values, negative numbers, empty arrays, null/undefined inputs.
- **Rules**: Must execute in < 10ms per test file; zero network or database dependencies.

### 3.2 Database & Integration Testing
- **Location**: `tests/integration/` and module-specific `.spec.ts` files.
- **Focus**:
  - Drizzle schema validation and migration execution against PostgreSQL.
  - Transaction rollbacks: verify that throwing an error inside a `UnitOfWorkContext` rolls back all participating module writes.
  - Row locking: verify `FOR UPDATE` lock acquisition order prevents deadlocks.
  - Outbox relay polling and `consumer_receipts` deduplication.
- **Setup**: Tests run against a dedicated test database (`shopscale_test`). Migrations are applied in `beforeAll`; test tables are truncated or wrapped in transaction rollbacks between runs.

### 3.3 Contract & Schema Testing
- **Location**: `packages/contracts/src/**/*.test.ts`.
- **Focus**:
  - Zod request schemas reject unknown or malformed properties.
  - Response serializations correctly format monetary values as decimal strings.
  - Event payloads adhere to declared `schemaVersion`.
  - **OpenAPI Drift Test**: Verifies that generated Fastify Swagger output matches `docs/openapi.json`. Any route addition without contract documentation fails CI.

### 3.4 Frontend Component Testing
- **Location**: `apps/web/src/**/*.test.tsx`.
- **Focus**:
  - Component accessibility (ARIA roles, accessible labels, keyboard navigation).
  - Client component states: loading skeletons, empty data states, validation error messages.
  - Form interactions: submitting valid data triggers server action mock; invalid inputs show inline field errors.
  - Theme token application: verifies CSS custom property variables attach to root container.

### 3.5 End-to-End (E2E) Browser Journeys
Playwright tests in `tests/e2e/` cover the four critical business journeys:
1. **Journey 1: Anonymous Discovery to Customer Purchase**:
   - Guest visits marketplace `/`, searches for a product, views PDP, adds variant to cart.
   - Registers for a new customer account; asserts guest cart is preserved upon login.
   - Enters shipping address, proceeds to checkout, reviews signed quote, submits order.
   - Observes payment confirmation and lands on order summary page.
2. **Journey 2: Multi-Seller Fulfillment**:
   - Customer purchases items from Seller 1 and Seller 2 in a single checkout.
   - Seller 1 logs into seller console (`/seller`), views suborder, marks it `PACKED` then `SHIPPED`.
   - Seller 2 logs in; verifies they cannot see Seller 1's suborder; marks their own suborder `PACKED`.
   - Customer views order tracking page; observes independent shipping statuses per seller.
3. **Journey 3: Seller Product Authoring & Publishing Lifecycle**:
   - Seller logs in, creates a new product in `draft` status, adds 2 variants with SKUs and prices.
   - Verifies product is NOT visible in public marketplace or store catalog.
   - Activates product; verifies product instantly appears in store catalog.
   - Toggles marketplace publication; verifies product appears in global search.
4. **Journey 4: Customer Return Request & Seller Inspection**:
   - Customer views delivered order, requests return on one line item with reason.
   - Seller inspects return request, approves it with "restock item" flag.
   - Verifies stock is restored to `on_hand` and refund ledger row is created.

---

## 4. Security & Concurrency Test Scenarios

### 4.1 Route Authorization Matrix Test (`TASK-018`, `TASK-074`)
- Automatically inspects all declared API routes.
- Exercises each route with 6 actor credentials:
  1. `Anonymous (Guest)`
  2. `Customer`
  3. `Seller 1 (Store A Owner)`
  4. `Seller 2 (Store B Owner)`
  5. `Support Agent`
  6. `Platform Administrator`
- Asserts that every single endpoint enforces exact allow/deny expectations.
- Asserts that accessing another store's resource returns uniform `404 Not Found`.

### 4.2 High-Concurrency Flash Sale Suite (`TASK-044`, `TASK-079`)
- Tool: **k6**.
- Setup: 1 product variant initialized with `on_hand = 50, reserved = 0`.
- Load Profile: 500 concurrent virtual users submit simultaneous checkout requests using unique accounts.
- Invariants Checked:
  - Exactly 50 checkouts succeed (`HTTP 201`).
  - Exactly 450 checkouts receive `HTTP 409 Conflict (INSUFFICIENT_STOCK)`.
  - Database `inventory` record ends with `on_hand = 50, reserved = 50` (or `0 / 0` post-confirmation).
  - Sum of `stock_movements` deltas equals current stock.
  - Zero negative stock or oversold units.

### 4.3 Idempotency Replay Storm (`TASK-054`)
- Fire 20 identical checkout requests concurrently using the **same** `Idempotency-Key` and user token.
- Invariants Checked:
  - Exactly 1 order record created in `orders`.
  - Exactly 1 charge executed in `payment_attempts`.
  - Exactly 1 set of inventory reservations.
  - All 20 HTTP requests receive identical `HTTP 201` responses and payload checksums.

### 4.4 Chaos Recovery mid-Flow (`TASK-073`)
- Initiate a batch of 50 orders.
- Send `SIGKILL` to the worker process mid-batch.
- Restart the worker process.
- Invariants Checked:
  - Zero lost orders.
  - Outbox relay re-polls unacknowledged records.
  - All 50 orders reach terminal `PAID` state within 60 seconds of worker restart.

---

## 5. Definition of Done & Quality Gates

A task cannot be marked completed or merged into `dev` unless:
1. **Tests Written First**: Unit and integration tests cover happy path, edge cases, and error states.
2. **100% Green Test Suite**: `pnpm test` passes across all workspace packages.
3. **Static Analysis Passes**: `pnpm lint` and `pnpm typecheck` exit with code 0.
4. **Coverage Floor Maintained**: Domain logic coverage in `packages/backend` does not drop below 80%.
5. **Independent Adversarial Review Completed**: According to task risk level (`LOW`, `MEDIUM`, or `HIGH`).
6. **Manual Verification Completed**: Exact user verification steps executed and confirmed with `PASS`.
