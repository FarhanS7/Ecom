def get_tasks():
    return [
        {
            "id": "037",
            "name": "Model Stock Invariants and Movement Ledger",
            "status": "PLANNED",
            "goal": "Author Drizzle schema and migrations for inventory, stock_reservations, and append-only stock_movements ledger with strict SQL check constraints.",
            "why": "Establishes physical database invariants guaranteeing available stock can never become negative and providing complete accounting auditability.",
            "requirements": ["IN-1", "IN-4", "G2", "PRD Section 6.3"],
            "blocked_by": ["TASK-003", "TASK-019"],
            "blocks": ["TASK-038", "TASK-039", "TASK-040", "TASK-044"],
            "architecture": ["ARCHITECTURE.md -> Inventory", "DECISIONS.md -> DEC-005", "docs/modules/inventory.md"],
            "skills": [
                {
                    "name": "domain-modeling",
                    "location": "skills/skills-main/skills/engineering/domain-modeling/SKILL.md",
                    "why": "Governs designing invariant check constraints and append-only ledgers.",
                    "instructions": ["Add CHECK (on_hand >= 0)", "Add CHECK (reserved >= 0 AND reserved <= on_hand)", "Enforce append-only ledger"]
                },
                {
                    "name": "test-driven-development",
                    "location": "skills/agent-skills-main/skills/test-driven-development/SKILL.md",
                    "why": "Ensures database check constraints are tested with failing scenarios first.",
                    "instructions": ["Write test asserting negative stock update throws check_violation", "Assert ledger uniqueness"]
                }
            ],
            "inspect_files": [
                "packages/backend/src/catalog/schema.ts",
                "db/migrations/0006-catalog.sql",
                "docs/architecture/data-model.md"
            ],
            "current_behavior": "Not implemented. Variant records exist without physical inventory tracking, reservations, or ledger history.",
            "required_behavior": "Database schema enforces inventory constraints; available stock is dynamically derived (on_hand - reserved); stock_movements records every delta with unique operation_key.",
            "contracts": "inventory: (variant_id PK, on_hand int, reserved int, version int). stock_movements: (id PK, variant_id FK, delta_on_hand int, delta_reserved int, reason text, operation_key text, ref_id text, created_at timestamptz).",
            "commands": [
                "Author migration db/migrations/0010-inventory.sql creating inventory, stock_reservations, and stock_movements tables.",
                "Add CHECK constraints: 0 <= reserved AND reserved <= on_hand AND on_hand >= 0.",
                "Add unique constraint on stock_movements(operation_key, variant_id, reason).",
                "Define Drizzle schemas in packages/backend/src/inventory/schema.ts.",
                "Write schema constraint integration test tests/integration/inventory-schema.spec.ts."
            ],
            "data_changes": "Creates inventory, stock_reservations, and stock_movements tables in migration 0010-inventory.sql.",
            "security": "Inventory mutations restricted to internal application ports and verified seller/admin workflows.",
            "error_handling": "SQL CHECK violations throw typed InventoryConstraintError (23514 check_violation).",
            "edge_cases": [
                "Attempting to set reserved greater than on_hand via manual adjustment (rejected by DB constraint)"
            ],
            "observability": "Migration log confirmation.",
            "unit_tests": [
                "packages/backend/src/inventory/schema.test.ts (invariants, field definitions)"
            ],
            "integration_tests": [
                "tests/integration/inventory-schema.spec.ts (verify negative stock rejected; verify reserved > on_hand rejected; verify movement ledger uniqueness)"
            ],
            "e2e_tests": ["None."],
            "security_tests": [
                "Verify inventory table cannot be altered without passing through transactional port"
            ],
            "manual_verification": "Execute psql command: INSERT INTO inventory (variant_id, on_hand, reserved) VALUES ('...', 10, 15); verify PostgreSQL rejects with CHECK constraint violation.",
            "risk_level": "HIGH",
            "review_requirements": "Multiple review passes on PostgreSQL CHECK constraints and ledger deduplication keys. Follow PRD_TO_TASKS_FRAMEWORK Phase 2.5.",
            "commit": "feat(inventory): model stock invariants reservations and movement ledger"
        },
        {
            "id": "038",
            "name": "Implement Atomic Basket Reservations",
            "status": "PLANNED",
            "goal": "Build InventoryService.reserve() locking variants in strictly ascending ID order and applying conditional reservation increments with 15-minute TTL.",
            "why": "Prevents deadlocks under multi-item orders and mathematically guarantees overselling is impossible under high concurrency.",
            "requirements": ["IN-2", "IN-3", "G2", "NFR-008", "PRD Section 6.3"],
            "blocked_by": ["TASK-037"],
            "blocks": ["TASK-039", "TASK-044", "TASK-047"],
            "architecture": ["ARCHITECTURE.md -> Core correctness rules", "DECISIONS.md -> DEC-005", "docs/modules/inventory.md"],
            "skills": [
                {
                    "name": "test-driven-development",
                    "location": "skills/agent-skills-main/skills/test-driven-development/SKILL.md",
                    "why": "Enforces testing concurrent reservation race conditions before implementation.",
                    "instructions": ["Simulate concurrent reservations on same variant", "Assert ascending ID locking order"]
                },
                {
                    "name": "api-and-interface-design",
                    "location": "skills/agent-skills-main/skills/api-and-interface-design/SKILL.md",
                    "why": "Governs InventoryPort contract consumed by commerce checkout coordinator.",
                    "instructions": ["Return typed ReserveResult", "Accept UnitOfWorkContext"]
                }
            ],
            "inspect_files": [
                "packages/backend/src/inventory/schema.ts",
                "packages/backend/src/platform/database.ts",
                "docs/modules/inventory.md"
            ],
            "current_behavior": "Not implemented. No reservation service exists; checkout cannot reserve stock.",
            "required_behavior": "reserve(tx, checkoutId, sortedLines, expiresAt) locks variants in ascending ID order, executes single-row conditional update, inserts stock_reservations and ledger rows; returns ReserveResult.",
            "contracts": "ReserveInput: { checkoutId: string, items: Array<{ variantId: string, qty: number }>, ttlSeconds: number }. ReserveResult: { ok: true, reservationIds: string[] } | { ok: false, code: 'INSUFFICIENT_STOCK', variantId: string, available: number }.",
            "commands": [
                "Implement InventoryService in packages/backend/src/inventory/inventory.service.ts.",
                "Sort input items by variantId ASC to guarantee deterministic deadlock-free lock acquisition.",
                "Execute conditional SQL update: UPDATE inventory SET reserved = reserved + :qty, version = version + 1 WHERE variant_id = :id AND (on_hand - reserved) >= :qty.",
                "If rows_updated == 0, abort and return { ok: false, code: 'INSUFFICIENT_STOCK' }.",
                "Insert stock_reservations with expires_at = NOW() + 15 minutes.",
                "Insert stock_movements ledger record with reason = 'CHECKOUT_RESERVATION'.",
                "Write integration tests in tests/integration/inventory-reserve.spec.ts."
            ],
            "data_changes": "Updates inventory.reserved; inserts stock_reservations and stock_movements.",
            "security": "Reservation calls mandate valid UnitOfWorkContext transaction.",
            "error_handling": "Returns typed INSUFFICIENT_STOCK result without throwing unexpected 500.",
            "edge_cases": [
                "Order contains 3 items; 2 have stock, 3rd fails (entire transaction rolls back; 0 partial reservations survive)",
                "Order contains duplicate variant IDs in payload (must aggregate quantities before locking)"
            ],
            "observability": "Logs reservation duration, variant IDs, and failure reasons; records active reservation gauge.",
            "unit_tests": [
                "packages/backend/src/inventory/inventory.service.test.ts (input sorting, payload aggregation, result mapping)"
            ],
            "integration_tests": [
                "tests/integration/inventory-reserve.spec.ts (multi-item atomic reservation; deadlock avoidance under reverse-order concurrent calls; rollback on 3rd item failure)"
            ],
            "e2e_tests": ["None."],
            "security_tests": ["None."],
            "manual_verification": "Execute reserve() on variant with stock=5 requesting qty=6; verify call returns ok: false, code: 'INSUFFICIENT_STOCK'.",
            "risk_level": "HIGH",
            "review_requirements": "Requires two independent review passes on lock ordering and conditional update logic. Documented in docs/reviews/t038-context.md.",
            "commit": "feat(inventory): implement atomic basket reservations with deadlock-free locking"
        },
        {
            "id": "039",
            "name": "Implement Expiry and Stock Adjustments",
            "status": "PLANNED",
            "goal": "Build scheduled BullMQ worker job releasing expired stock reservations and implement seller manual stock adjustment port.",
            "why": "Restores abandoned shopping basket stock to available inventory and allows vendors to restock goods.",
            "requirements": ["IN-2", "G2", "PRD Section 6.3"],
            "blocked_by": ["TASK-038", "TASK-029"],
            "blocks": ["TASK-040", "TASK-044", "TASK-053"],
            "architecture": ["ARCHITECTURE.md -> Synchronous vs Asynchronous", "DECISIONS.md -> DEC-005"],
            "skills": [
                {
                    "name": "test-driven-development",
                    "location": "skills/agent-skills-main/skills/test-driven-development/SKILL.md",
                    "why": "Enforces testing expiry race conditions and manual adjustments.",
                    "instructions": ["Simulate expired reservation", "Verify worker releases reserved counter and writes ledger"]
                }
            ],
            "inspect_files": [
                "packages/backend/src/inventory/inventory.service.ts",
                "apps/worker/src/main.ts",
                "docs/modules/inventory.md"
            ],
            "current_behavior": "Not implemented. Active reservations never expire; abandoned checkouts lock inventory indefinitely.",
            "required_behavior": "BullMQ repeatable job polls expired active reservations every 60 seconds; releases reserved stock; adjusts on_hand on seller restocking; records ledger entries.",
            "contracts": "adjustStock(tx, variantId, deltaOnHand, reason, operationKey) -> AdjustStockResult. ExpiryJob payload.",
            "commands": [
                "Implement InventoryService.releaseExpiredReservations() claiming expired rows with FOR UPDATE SKIP LOCKED.",
                "Execute atomic decrement on inventory.reserved and mark reservation status = 'EXPIRED'.",
                "Record stock_movements entry with reason = 'RESERVATION_EXPIRED'.",
                "Build adjustStock() method validating that on_hand does not fall below currently active reserved count.",
                "Configure BullMQ repeatable job 'inventory-expiry-sweep' in apps/worker/src/schedulers/expiry.scheduler.ts running every minute.",
                "Write integration tests in tests/integration/inventory-expiry.spec.ts."
            ],
            "data_changes": "Updates inventory.reserved / on_hand; updates stock_reservations.status; inserts stock_movements.",
            "security": "Manual stock adjustments require verified seller or admin credentials scoped to variant's store.",
            "error_handling": "Manual adjustment reducing on_hand below reserved throws 409 Conflict (CANNOT_REDUCE_BELOW_RESERVED).",
            "edge_cases": [
                "Payment succeeds at the exact millisecond reservation expires (T053 checkout expiry race condition)"
            ],
            "observability": "Records count of released reservations and total expired quantity per sweep.",
            "unit_tests": [
                "packages/backend/src/inventory/stock-adjustment.test.ts (delta calculation, negative stock guard)"
            ],
            "integration_tests": [
                "tests/integration/inventory-expiry.spec.ts (seed expired reservation; run sweep; verify reserved decrements and available stock increases)"
            ],
            "e2e_tests": ["None."],
            "security_tests": [
                "Assert seller cannot adjust stock for variant belonging to another store"
            ],
            "manual_verification": "Insert reservation with expires_at in the past; trigger sweep job via CLI; verify reservation status updates to EXPIRED.",
            "risk_level": "MEDIUM",
            "review_requirements": "Single thorough review pass focusing on expiry race locks and ledger accuracy. Documented in docs/reviews/t039-context.md.",
            "commit": "feat(inventory): implement reservation expiry sweep and stock adjustment port"
        },
        {
            "id": "040",
            "name": "Build Seller Stock Management UI",
            "status": "PLANNED",
            "goal": "Build Next.js seller console dashboard for inspecting variant inventory, reserved counts, and executing manual stock adjustments.",
            "why": "Enables vendors to monitor available stock, restock products, and review inventory ledger history.",
            "requirements": ["IN-1", "IN-5", "PRD Section 5.1"],
            "blocked_by": ["TASK-027", "TASK-037", "TASK-039"],
            "blocks": ["TASK-067"],
            "architecture": ["ARCHITECTURE.md -> Frontend", "docs/architecture/frontend.md"],
            "skills": [
                {
                    "name": "frontend-ui-engineering",
                    "location": "skills/agent-skills-main/skills/frontend-ui-engineering/SKILL.md",
                    "why": "Governs seller console table layout, modal dialogs, and optimistic UI updates.",
                    "instructions": ["Display on_hand, reserved, and available columns explicitly", "Show ledger history modal"]
                }
            ],
            "inspect_files": [
                "apps/web/src/app/seller/products/page.tsx",
                "packages/backend/src/inventory/inventory.service.ts",
                "apps/web/src/features/seller/actions.ts"
            ],
            "current_behavior": "Seller console allows editing variant price and SKU, but displays no inventory counters or restocking controls.",
            "required_behavior": "Seller console displays variant stock table with On Hand, Reserved, Available; allows restocking via modal; shows movement audit log.",
            "contracts": "StockAdjustmentDto: { deltaOnHand: number, reason: string }. InventoryItemViewDto.",
            "commands": [
                "Build SellerInventoryTable component in apps/web/src/features/seller/inventory-table.tsx.",
                "Build StockAdjustmentModal client component with quantity input and reason selector.",
                "Implement Next.js Server Action adjustStockAction validating input against contracts schema.",
                "Build StockMovementsDrawer displaying variant ledger history.",
                "Write component tests and form validation tests."
            ],
            "data_changes": "None directly from UI; calls backend adjustStock port.",
            "security": "Enforces store scoping: seller can view and adjust only their own store variants.",
            "error_handling": "Displays inline error if seller attempts to adjust stock below active reservations.",
            "edge_cases": [
                "Simultaneous adjustment and checkout reservation (UI reflects fresh version upon modal close)"
            ],
            "observability": "Telemetry on seller manual stock modifications.",
            "unit_tests": [
                "apps/web/src/features/seller/inventory-table.test.tsx (stock calculation, low-stock badge styling)"
            ],
            "integration_tests": [
                "apps/web/src/features/seller/stock-adjustment.test.ts (server action validation, API call)"
            ],
            "e2e_tests": [
                "tests/e2e/seller-inventory.spec.ts (log in as seller, adjust stock from 10 to 25, verify updated table)"
            ],
            "security_tests": [
                "Assert non-seller cannot view or submit stock adjustments"
            ],
            "manual_verification": "Log into /seller/inventory; adjust variant stock by +50; verify available count increments immediately.",
            "risk_level": "LOW",
            "review_requirements": "Single review pass. Documented in docs/reviews/t040-context.md.",
            "commit": "feat(web): build seller stock management table and adjustment dialog"
        },
        {
            "id": "041",
            "name": "Implement Durable Channel Carts",
            "status": "PLANNED",
            "goal": "Build CartService with Redis-backed speed and persistent PostgreSQL sync supporting channel-scoped baskets.",
            "why": "Provides sub-60ms cart mutations while ensuring logged-in customer carts survive Redis restarts.",
            "requirements": ["CA-1", "G1", "NFR-005", "PRD Section 6.4"],
            "blocked_by": ["TASK-003", "TASK-009", "TASK-019"],
            "blocks": ["TASK-042", "TASK-043", "TASK-047"],
            "architecture": ["ARCHITECTURE.md -> Data Ownership", "DECISIONS.md -> DEC-003", "docs/modules/cart.md"],
            "skills": [
                {
                    "name": "test-driven-development",
                    "location": "skills/agent-skills-main/skills/test-driven-development/SKILL.md",
                    "why": "Ensures Redis/PostgreSQL synchronization is tested with restart scenarios.",
                    "instructions": ["Flush Redis and assert cart recovers from PostgreSQL", "Enforce channelKey isolation"]
                },
                {
                    "name": "api-and-interface-design",
                    "location": "skills/agent-skills-main/skills/api-and-interface-design/SKILL.md",
                    "why": "Governs cart REST endpoints under /v1/carts/{channelKey}.",
                    "instructions": ["Validate max quantity (99)", "Separate marketplace and store cart state"]
                }
            ],
            "inspect_files": [
                "packages/backend/src/catalog/read.service.ts",
                "db/migrations/0006-catalog.sql",
                "docs/modules/cart.md"
            ],
            "current_behavior": "Not implemented. No cart tables, Redis keys, or cart management endpoints exist.",
            "required_behavior": "Customers and guests manage channel-scoped carts; mutations write to PostgreSQL and update Redis snapshot; GET /v1/carts/{channelKey} returns current items with live catalog prices.",
            "contracts": "CartDto: { id: string, channelKey: string, items: Array<{ variantId: string, qty: number, title: string, priceCents: string, available: boolean }>, totalCents: string, version: number }.",
            "commands": [
                "Author migration db/migrations/0011-carts.sql creating carts and cart_items tables.",
                "Enforce channel_key = 'marketplace' OR store UUID via partial indexes.",
                "Implement CartService in packages/backend/src/cart/cart.service.ts with add, update, remove, and get.",
                "Sync cart state to Redis key cart:{channelKey}:{ownerId} with 30-day TTL.",
                "Expose GET, POST, PATCH, DELETE endpoints in CartController.",
                "Write integration tests in tests/integration/cart.spec.ts."
            ],
            "data_changes": "Creates carts and cart_items tables in migration 0011-carts.sql.",
            "security": "Enforces cart ownership: user can read/modify only their own cart; store cart cannot contain products from another store.",
            "error_handling": "Returns 400 Bad Request if quantity exceeds 99; 404 if variant does not exist.",
            "edge_cases": [
                "Adding product variant to store cart that belongs to a different store (rejected with 400 STORE_MISMATCH)",
                "Product price changes after adding to cart (cart endpoint dynamically computes totals using live variant prices)"
            ],
            "observability": "Cart modification duration metrics; tracks active cart count.",
            "unit_tests": [
                "packages/backend/src/cart/cart.service.test.ts (quantity bounding, item deduplication, totals calculation)"
            ],
            "integration_tests": [
                "tests/integration/cart.spec.ts (add item, update qty, delete item, verify Redis snapshot, flush Redis and assert DB reload)"
            ],
            "e2e_tests": ["None."],
            "security_tests": [
                "Assert customer cannot read another user's cart"
            ],
            "manual_verification": "Add item to marketplace cart via curl; query Redis CLI GET cart:marketplace:{userId}; verify JSON snapshot matches.",
            "risk_level": "MEDIUM",
            "review_requirements": "Single thorough review pass focusing on dual-write consistency between Redis and PostgreSQL. Documented in docs/reviews/t041-context.md.",
            "commit": "feat(cart): implement durable channel carts with redis caching and postgres persistence"
        },
        {
            "id": "042",
            "name": "Implement Guest Cart Ownership and Merge",
            "status": "PLANNED",
            "goal": "Build guest cart signing with HMAC tokens and atomic merge handler consolidating guest basket into customer cart upon login.",
            "why": "Enables anonymous visitors to shop before authenticating and guarantees zero lost basket items upon sign-in.",
            "requirements": ["CA-2", "PRD Section 6.4"],
            "blocked_by": ["TASK-041", "TASK-010"],
            "blocks": ["TASK-043", "TASK-047"],
            "architecture": ["ARCHITECTURE.md -> Core correctness rules", "DECISIONS.md -> DEC-003", "docs/modules/cart.md"],
            "skills": [
                {
                    "name": "security-and-hardening",
                    "location": "skills/agent-skills-main/skills/security-and-hardening/SKILL.md",
                    "why": "Governs guest token signing and prevents cart tampering.",
                    "instructions": ["Sign guest cart ID with HMAC token", "Prevent replay merge"]
                },
                {
                    "name": "test-driven-development",
                    "location": "skills/agent-skills-main/skills/test-driven-development/SKILL.md",
                    "why": "Enforces testing merge scenarios with duplicate items before writing logic.",
                    "instructions": ["Test merging items already in customer cart", "Assert quantity capping at 99"]
                }
            ],
            "inspect_files": [
                "packages/backend/src/cart/cart.service.ts",
                "packages/backend/src/identity/auth.service.ts",
                "docs/modules/cart.md"
            ],
            "current_behavior": "Carts require authenticated customer; unauthenticated guests receive 401 Unauthorized.",
            "required_behavior": "Guests receive signed cookie cart_guest_token; POST /v1/carts/{channelKey}/merge merges guest items into user cart upon login and marks guest cart merged in cart_merges.",
            "contracts": "POST /v1/carts/{channelKey}/merge -> { mergedCart: CartDto }.",
            "commands": [
                "Author migration db/migrations/0012-cart-merges.sql creating cart_merges table with UNIQUE(guest_cart_id).",
                "Implement GuestTokenService signing and verifying guest cart cookies with HMAC-SHA256.",
                "Build CartService.mergeGuestCart() consolidating line quantities (capped at 99).",
                "Hook AuthService.login() to trigger cart merge if guest token cookie is present.",
                "Write integration tests in tests/integration/cart-merge.spec.ts."
            ],
            "data_changes": "Creates cart_merges table in migration 0012-cart-merges.sql; updates cart_items.",
            "security": "Guest token verification prevents arbitrary cart takeover; repeated merge of same guest cart is rejected.",
            "error_handling": "Returns 400 Bad Request on tampered guest token; 409 if guest cart was already merged.",
            "edge_cases": [
                "Customer already has 5 of Variant A; guest cart has 10 of Variant A (merged quantity equals 15)",
                "Combined quantity exceeds 99 (capped at maximum allowed 99 units)"
            ],
            "observability": "Logs guest-to-customer cart merge events.",
            "unit_tests": [
                "packages/backend/src/cart/guest-merge.test.ts (quantity sum logic, 99 cap, deduplication)"
            ],
            "integration_tests": [
                "tests/integration/cart-merge.spec.ts (add items as guest; log in; verify items merged into user cart; verify guest token deactivated)"
            ],
            "e2e_tests": ["None."],
            "security_tests": [
                "Assert tampered guest cart signature is rejected with 401"
            ],
            "manual_verification": "Add items as guest; log in via /login; verify cart drawer retains items with updated user badge.",
            "risk_level": "MEDIUM",
            "review_requirements": "Single thorough review pass focusing on token signing and duplicate merge idempotency. Documented in docs/reviews/t042-context.md.",
            "commit": "feat(cart): implement guest cart signing and atomic customer cart merge"
        },
        {
            "id": "043",
            "name": "Build Cart and Add-to-Cart Interactions",
            "status": "PLANNED",
            "goal": "Build Next.js cart drawer, item count badge, quantity modification controls, and channel basket separation UI.",
            "why": "Provides shoppers with an interactive, responsive basket experience across marketplace and branded stores.",
            "requirements": ["CA-1", "CA-2", "design.md"],
            "blocked_by": ["TASK-023", "TASK-025", "TASK-026", "TASK-041", "TASK-042"],
            "blocks": ["TASK-048"],
            "architecture": ["ARCHITECTURE.md -> Frontend", "docs/architecture/frontend.md"],
            "skills": [
                {
                    "name": "frontend-ui-engineering",
                    "location": "skills/agent-skills-main/skills/frontend-ui-engineering/SKILL.md",
                    "why": "Governs accessible cart drawer, optimistic UI updates, and focus trapping.",
                    "instructions": ["Use Dialog with focus trap for cart drawer", "Provide optimistic quantity updates"]
                }
            ],
            "inspect_files": [
                "apps/web/src/app/layout.tsx",
                "apps/web/src/features/catalog/product-detail.tsx",
                "apps/web/src/lib/api.ts"
            ],
            "current_behavior": "PDP has disabled 'Add to Cart' button; header has static cart icon with no drawer.",
            "required_behavior": "Clicking 'Add to Cart' on PDP adds item, updates header badge count, and slides open the cart drawer showing item details, subtotal, and Checkout CTA.",
            "contracts": "CartState context and CartDrawerProps in apps/web/src/features/cart/.",
            "commands": [
                "Build CartProvider React context managing active cart state and channelKey.",
                "Build CartDrawer client island with slide-over animation and focus trap.",
                "Build CartItemRow component with quantity increment/decrement buttons and remove icon.",
                "Wire PDP 'Add to Cart' button to CartProvider.addItem().",
                "Write component tests and responsive UI tests."
            ],
            "data_changes": "None.",
            "security": "Enforces CSRF protection on cart mutation calls; sanitizes product titles in drawer.",
            "error_handling": "Displays inline toast error if stock limit is reached when incrementing quantity.",
            "edge_cases": [
                "Rapidly clicking '+' button (debounces mutation call and prevents negative/overflow quantities)"
            ],
            "observability": "Cart add and abandon analytics tracking.",
            "unit_tests": [
                "apps/web/src/features/cart/cart-drawer.test.tsx (drawer open/close, quantity adjustments, empty state)"
            ],
            "integration_tests": [
                "apps/web/src/features/cart/cart-flow.test.ts (add item, verify state, trigger checkout navigation)"
            ],
            "e2e_tests": [
                "tests/e2e/cart-drawer.spec.ts (visit PDP, select variant, click Add to Cart, assert drawer opens with correct price)"
            ],
            "security_tests": ["None."],
            "manual_verification": "Add product to cart; open drawer; change quantity from 1 to 3; verify total updates instantly.",
            "risk_level": "LOW",
            "review_requirements": "Single review pass focusing on accessibility and keyboard focus trapping. Documented in docs/reviews/t043-context.md.",
            "commit": "feat(web): build interactive cart drawer and add-to-cart controls"
        },
        {
            "id": "044",
            "name": "Prove Cross-Channel Stock Contention",
            "status": "PLANNED",
            "goal": "Build automated high-concurrency test suite proving 500 concurrent buyers competing for 50 stock units across marketplace and store channels never oversell.",
            "why": "Provides indisputable portfolio-grade proof of PRD Goal G2 (Never oversell stock under concurrency).",
            "requirements": ["G2", "IN-3", "NFR-008", "PRD Section 1.2"],
            "blocked_by": ["TASK-038", "TASK-039", "TASK-041"],
            "blocks": ["TASK-047", "TASK-079"],
            "architecture": ["ARCHITECTURE.md -> Core correctness rules", "DECISIONS.md -> DEC-005"],
            "skills": [
                {
                    "name": "performance-optimization",
                    "location": "skills/agent-skills-main/skills/performance-optimization/SKILL.md",
                    "why": "Governs high-concurrency load scenario scripting and thread pool analysis.",
                    "instructions": ["Configure 500 concurrent virtual users", "Assert zero database deadlocks"]
                },
                {
                    "name": "test-driven-development",
                    "location": "skills/agent-skills-main/skills/test-driven-development/SKILL.md",
                    "why": "Enforces rigorous validation of stock invariants under race conditions.",
                    "instructions": ["Verify exactly 50 successes", "Verify exactly 450 rejections with 409 Conflict"]
                }
            ],
            "inspect_files": [
                "packages/backend/src/inventory/inventory.service.ts",
                "loadtests/flash-sale.js",
                "01-ecommerce-marketplace-PRD.md"
            ],
            "current_behavior": "Not implemented. No automated multi-threaded load script exists to prove inventory concurrency.",
            "required_behavior": "Load script executes 500 simultaneous reservation calls against a variant with 50 units; exactly 50 succeed; exactly 450 fail with INSUFFICIENT_STOCK; final on_hand - reserved == 0; zero oversold units.",
            "contracts": "k6 scenario script in loadtests/flash-sale.js.",
            "commands": [
                "Author k6 concurrency script in loadtests/flash-sale.js targeting /v1/test/concurrency-reserve.",
                "Seed target product variant with on_hand = 50, reserved = 0.",
                "Execute k6 run with 500 virtual users firing in a 2-second burst.",
                "Assert 50 HTTP 200/201 responses and 450 HTTP 409 responses.",
                "Assert SQL query: SELECT on_hand, reserved FROM inventory WHERE variant_id = '...' yields 50, 50.",
                "Assert sum(delta_reserved) in stock_movements equals exactly 50.",
                "Document execution results and query timings in docs/reviews/t044-context.md."
            ],
            "data_changes": "None in schema; exercises inventory and stock_movements.",
            "security": "Exercises concurrency under unique actor credentials.",
            "error_handling": "Failed reservations must return clean 409 INSUFFICIENT_STOCK without connection pool exhaustion.",
            "edge_cases": [
                "PostgreSQL connection pool saturation under 500 connections (k6 connection pooling configured to match pg pool size)"
            ],
            "observability": "Captures lock wait duration and transaction commit latency.",
            "unit_tests": ["None."],
            "integration_tests": [
                "tests/integration/concurrency-race.spec.ts (Node.js Promise.all concurrency simulation with 50 threads)"
            ],
            "e2e_tests": ["None."],
            "security_tests": ["None."],
            "manual_verification": "Execute 'pnpm exec k6 run loadtests/flash-sale.js'; inspect terminal output; verify checks pass with 0 errors.",
            "risk_level": "HIGH",
            "review_requirements": "Multiple review passes on concurrency evidence and deadlock metrics. Recorded in docs/reviews/t044-context.md.",
            "commit": "test(inventory): prove zero overselling under 500 concurrent buyers"
        }
    ]
