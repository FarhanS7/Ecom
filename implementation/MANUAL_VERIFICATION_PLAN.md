# User Manual Verification Plan: ShopScale

> **Authoritative User Verification Checkpoints and Feature Acceptance Gates**  
> Every user-facing or operator-facing feature must undergo manual user verification before final acceptance.

---

## 1. Operating Protocol for Manual Verification

1. **Mandatory Acceptance Gate**: Automated unit, integration, and E2E tests are prerequisites, but they do NOT replace human verification. A meaningful feature task cannot be marked completed until the user executes the verification steps and returns `PASS` (or explicitly records `DEFER` with a justified reason).
2. **Defect Protocol on FAIL**: If the user reports `FAIL: [observed problem]`:
   - Do NOT mark the task complete.
   - Diagnose the root cause of the observed failure.
   - Implement the fix and write a regression test reproducing the issue.
   - Request the user to re-execute the verification steps until `PASS` is achieved.
3. **Never Convert DEFER into PASS**: Deferred verifications remain open in the milestone completion tracker.

---

## 2. Verification Environment & Demo Credentials

### 2.1 Local Environment Setup
Before executing manual verification checkpoints:
1. Ensure Docker dependencies are running: `docker compose up -d` (starts PostgreSQL on port 5432 and Redis on port 6379).
2. Apply database migrations: `pnpm db:migrate`.
3. Seed baseline demo fixtures: `pnpm seed --size s --seed 42`.
4. Start development servers: `pnpm dev` (launches Next.js on `http://localhost:3000` and Fastify API on `http://localhost:3001`).

### 2.2 Standard Demo Accounts (Seeded via `SEED=42`)
All accounts share the default development password: `Password123!`

| Role / Persona | Email | Purpose / Permitted Scope |
|---|---|---|
| **Admin** | `admin@shopscale.dev` | Platform superuser; full administrative access. |
| **Support** | `support@shopscale.dev` | Customer support agent; order inspection and refunds up to $200. |
| **Seller 1 (Apex Athletics)** | `seller1@shopscale.dev` | Vendor owner of store `apex-athletics`; owns ~5% of catalog. |
| **Seller 2 (Summit Outdoors)**| `seller2@shopscale.dev` | Vendor owner of store `summit-outdoors`; used to verify cross-store denial. |
| **Customer 1 (Active)** | `customer1@shopscale.dev` | Customer with existing order history, address book, and reviews. |
| **Customer 2 (Clean)** | `customer2@shopscale.dev` | Clean customer account with zero orders for fresh checkout verification. |

---

## 3. Mandatory Feature Verification Checkpoints

---

### Checkpoint MVP-01: Authentication, Session Rotation & Rate Limiting
- **Associated Tasks**: `TASK-010`, `TASK-011`, `TASK-013`, `TASK-017`
- **Environment**: Local browser (`http://localhost:3000`)
- **Prerequisites**: Clean database seed.

#### Test Steps
1. Navigate to `http://localhost:3000/login`.
2. Enter email `customer2@shopscale.dev` and password `Password123!`. Click **Sign In**.
   - *Expected*: Redirects to account dashboard (`/account`); header displays "customer2@shopscale.dev" with avatar; cookies include HttpOnly `shopscale_session`.
3. Open a second browser tab, navigate to `/account`. Click **Sign Out**.
   - *Expected*: Session terminated; cookie cleared; redirects to `/login`. Navigating back to `/account` in tab 1 redirects to `/login`.
4. Return to `/login`. Submit incorrect password `WrongPass123!` five (5) times consecutively.
   - *Expected*: On the 5th attempt, submission is blocked; UI displays "Too many failed login attempts. Please wait 15 minutes before trying again" (`HTTP 429`).

---

### Checkpoint MVP-02: Multi-Store Routing & Themed Storefronts
- **Associated Tasks**: `TASK-016`, `TASK-023`, `TASK-024`
- **Environment**: Local browser (`http://localhost:3000`)
- **Prerequisites**: Seeded stores (`apex-athletics`, `summit-outdoors`).

#### Test Steps
1. Navigate to the marketplace homepage at `http://localhost:3000/`.
   - *Expected*: Renders neutral marketplace theme; header displays marketplace navigation; product grid shows items from multiple vendors.
2. Navigate to `http://localhost:3000/stores/apex-athletics`.
   - *Expected*: Page re-themes dynamically to Apex Athletics colors and banner; catalog displays *only* products authored by Apex Athletics.
3. Navigate to a non-existent store `http://localhost:3000/stores/fake-store-xyz`.
   - *Expected*: Returns custom 404 page: "Store not found. Return to marketplace."

---

### Checkpoint MVP-03: Product Keyset Pagination & Facet Filtering
- **Associated Tasks**: `TASK-021`, `TASK-022`, `TASK-025`
- **Environment**: Local browser (`http://localhost:3000`)
- **Prerequisites**: Tier S seeded catalog.

#### Test Steps
1. Navigate to `http://localhost:3000/products`.
   - *Expected*: Displays first 20 products with pagination controls; URL query string reflects active filters.
2. Select category "Footwear", set price filter to "$50 - $150", and select Sort by "Price: Low to High".
   - *Expected*: Product list updates instantly; every visible item belongs to Footwear with price between $50 and $150; sorted in ascending price order.
3. Click **Next Page**.
   - *Expected*: Next 20 items load seamlessly via keyset cursor (`?cursor=...`); no duplicated products between page 1 and page 2.
4. Manually tamper with the cursor in the browser address bar (e.g., `?cursor=invalid_garbage`).
   - *Expected*: UI displays friendly error: "Invalid pagination state. Resetting to first page" without application crash.

---

### Checkpoint MVP-04: Seller Product Creation, Activation & Tenancy
- **Associated Tasks**: `TASK-020`, `TASK-027`
- **Environment**: Local browser (`http://localhost:3000`)
- **Prerequisites**: Logged in as `seller1@shopscale.dev`.

#### Test Steps
1. Navigate to Seller Console at `http://localhost:3000/seller/products`. Click **Create Product**.
2. Enter Title "Trailblazer Running Shoes", Brand "Apex", Category "Footwear", and Description. Add 2 variants:
   - Variant 1: SKU `APX-SH-01-BLK`, Size `10`, Color `Black`, Price `$120.00`.
   - Variant 2: SKU `APX-SH-01-BLU`, Size `11`, Color `Blue`, Price `$125.00`.
3. Save product in `draft` status.
   - *Expected*: Product saved successfully; listed in seller dashboard as "Draft"; product does NOT appear in public storefront at `/stores/apex-athletics`.
4. In product editor, toggle status to `active` and check "Publish to Marketplace". Click **Update Product**.
   - *Expected*: Product transitions to `active`; open new incognito tab at `/stores/apex-athletics` and verify product is immediately visible.
5. In seller console, attempt to edit a product belonging to Seller 2 (manually change URL to Seller 2's product ID).
   - *Expected*: Returns generic 404 Not Found error (Uniform 404 rule); no product data leaked.

---

### Checkpoint MVP-05: Real-Time Typo-Tolerant Search & Autocomplete
- **Associated Tasks**: `TASK-031`, `TASK-032`
- **Environment**: Local browser (`http://localhost:3000`)
- **Prerequisites**: Seeded search projection.

#### Test Steps
1. Click the header search input on the marketplace.
2. Type `runn` (without pressing Enter).
   - *Expected*: Instant dropdown appears within 50ms displaying matching suggestions (e.g., "Running Shoes", "Trail Running").
3. Type an intentional misspelling: `snakers` and press **Enter**.
   - *Expected*: Navigates to `/search?q=snakers`; search results page displays: "Showing results for *sneakers*"; matching shoes are displayed with facet counts.
4. Filter search results by Brand "Apex".
   - *Expected*: Search results narrow to Apex sneakers; facet counts decrement accurately.

---

### Checkpoint MVP-06: Cart Isolation & Guest-to-Customer Merge
- **Associated Tasks**: `TASK-041`, `TASK-042`, `TASK-043`
- **Environment**: Local browser (incognito session)
- **Prerequisites**: Guest user.

#### Test Steps
1. As an unauthenticated guest, visit `/products`. Add 1 item from Seller 1 to the cart.
   - *Expected*: Cart drawer slides out showing 1 item ($X.XX); cart count badge in header shows "1".
2. Navigate to branded store `/stores/summit-outdoors`. Open cart.
   - *Expected*: Store cart is completely empty (0 items); channel cart isolation is maintained. Add 1 item to store cart.
3. Return to marketplace `/`. Open cart.
   - *Expected*: Marketplace cart still shows its original 1 item from Seller 1.
4. Click **Checkout** from marketplace cart.
   - *Expected*: Prompted to log in or register. Log in as `customer2@shopscale.dev`.
   - *Expected*: After login, redirected to checkout; guest marketplace item is preserved in customer2's cart.

---

### Checkpoint MVP-07: Atomic Stock Reservation & Flash Sale Concurrency
- **Associated Tasks**: `TASK-038`, `TASK-044`, `TASK-047`
- **Environment**: CLI / Terminal execution
- **Prerequisites**: Minimal Docker environment.

#### Test Steps
1. Execute the automated flash-sale concurrency verification script:
   ```powershell
   pnpm exec k6 run loadtests/flash-sale.js
   ```
2. Observe terminal test output.
   - *Expected*: 500 concurrent virtual buyers execute checkouts against a product variant with exactly 50 available units.
   - *Expected Result*:
     - Exactly 50 requests receive `HTTP 201 Created`.
     - Exactly 450 requests receive `HTTP 409 Conflict (INSUFFICIENT_STOCK)`.
     - Zero requests fail with 500 Internal Server Error.
     - Database verification query confirms `inventory.on_hand = 50, inventory.reserved = 50` (or `0 / 0`).
     - Zero instances of negative stock.

---

### Checkpoint MVP-08: Multi-Seller Checkout & Deterministic Mock Payment
- **Associated Tasks**: `TASK-046`, `TASK-047`, `TASK-049`, `TASK-050`, `TASK-051`
- **Environment**: Local browser (`http://localhost:3000`)
- **Prerequisites**: Logged in as `customer2@shopscale.dev`.

#### Test Steps
1. Add 1 item from Seller 1 and 1 item from Seller 2 to your marketplace cart.
2. Proceed to `/checkout`. Select shipping address. Click **Review Order**.
   - *Expected*: Displays unified order summary showing items split by vendor, distinct shipping charges per seller, and total in USD.
3. Click **Place Order & Pay**.
   - *Expected*: Order submitted with `Idempotency-Key`; spinner indicates payment authorization; redirected to `/orders/[id]/confirmation` within 3 seconds.
4. Open PostgreSQL console and query the database:
   ```sql
   SELECT id, status, total_cents FROM orders WHERE user_id = (SELECT id FROM users WHERE email = 'customer2@shopscale.dev');
   SELECT id, store_id, fulfillment_status FROM seller_orders WHERE order_id = '...';
   ```
   - *Expected*: 1 parent order in `PAID` status; exactly 2 child `seller_orders` records (one per seller) in `PAID` status.

---

### Checkpoint MVP-09: Seller Fulfillment Lifecycle & Buyer PII Masking
- **Associated Tasks**: `TASK-055`, `TASK-056`, `TASK-057`
- **Environment**: Local browser (`http://localhost:3000`)
- **Prerequisites**: Order placed in Checkpoint MVP-08.

#### Test Steps
1. Log in as `seller1@shopscale.dev`. Navigate to `/seller/orders`.
   - *Expected*: Seller 1 sees only their suborder lines; items belonging to Seller 2 are completely invisible.
2. Click on the order to view details.
   - *Expected*: Customer name and shipping address are visible (order is `PAID`).
3. Click **Mark Packed**.
   - *Expected*: Suborder status updates to `PACKED`.
4. Click **Mark Shipped**. Enter tracking number `TRACK-12345`.
   - *Expected*: Suborder status updates to `SHIPPED`.
5. Log in as `customer2@shopscale.dev`. Navigate to `/account/orders`.
   - *Expected*: Order details page displays Seller 1's package as `SHIPPED` with tracking `TRACK-12345`, while Seller 2's package remains `PAID / Processing`. Parent order status displays `Partially Shipped`.

---

### Checkpoint MVP-10: Customer Return Request & Double-Entry Refund Ledger
- **Associated Tasks**: `TASK-058`, `TASK-059`, `TASK-060`
- **Environment**: Local browser (`http://localhost:3000`)
- **Prerequisites**: Customer with a delivered order item.

#### Test Steps
1. Log in as `customer1@shopscale.dev`. Navigate to `/account/orders`.
2. Select a delivered order. Click **Request Return** on an item.
3. Select Reason "Item defective / damaged", enter note "Sole detached on first run", and submit.
   - *Expected*: Return request created in `PENDING_INSPECTION` status.
4. Log in as `seller1@shopscale.dev`. Navigate to `/seller/returns`.
5. View the return request. Select Action: **Approve Return with Restock**. Click **Submit Decision**.
   - *Expected*: Return approved; refund processed automatically via payment simulator.
6. Open PostgreSQL console and inspect financial entries:
   ```sql
   SELECT account, debit_cents, credit_cents FROM financial_entries WHERE order_id = '...' ORDER BY id ASC;
   ```
   - *Expected*: Balanced double-entry records created: `seller_payable` debited, `customer_receivable` credited; total debits equal total credits.
   - *Expected*: Inventory ledger shows restock movement; `inventory.on_hand` increments by returned quantity.

---

## 4. Verification Defect Reporting Template

If any manual verification step fails, report the defect in the following format:

```text
VERIFICATION STATUS: FAIL
Checkpoint ID: [e.g., MVP-08: Multi-Seller Checkout]
Step Number: [e.g., Step 3]
Action Performed: [Exact user interaction]
Observed Outcome: [What actually happened, including screenshots or console errors]
Expected Outcome: [What the verification specification required]
Diagnostic Details: [Logs from apps/api, apps/worker, or browser developer tools]
```
