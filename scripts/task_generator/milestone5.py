def get_tasks():
    return [
        {
            "id": "045",
            "name": "Implement Totals and Coupon Allocation Contracts",
            "status": "PLANNED",
            "goal": "Build canonical quote calculation engine computing seller-subtotals, fixed shipping ($5.00/seller), proportional coupon allocation, and price-change verification.",
            "why": "Guarantees shoppers receive immutable signed price quotes and prevents checkout on unreviewed price changes.",
            "requirements": ["CA-3", "OR-9", "REQ-COMM-002", "PRD Section 6.5"],
            "blocked_by": ["TASK-019", "TASK-041"],
            "blocks": ["TASK-047", "TASK-048", "TASK-063"],
            "architecture": ["ARCHITECTURE.md -> Core correctness rules", "docs/modules/commerce.md"],
            "skills": [
                {
                    "name": "api-and-interface-design",
                    "location": "skills/agent-skills-main/skills/api-and-interface-design/SKILL.md",
                    "why": "Governs quote request and response DTO schemas.",
                    "instructions": ["Use integer cents arithmetic exclusively", "Sign quote token with HMAC"]
                },
                {
                    "name": "test-driven-development",
                    "location": "skills/agent-skills-main/skills/test-driven-development/SKILL.md",
                    "why": "Enforces testing penny-rounding and proportional coupon splits with failing tests first.",
                    "instructions": ["Test 3-way odd penny coupon split", "Assert sum of line totals equals parent total"]
                }
            ],
            "inspect_files": [
                "packages/backend/src/cart/cart.service.ts",
                "packages/backend/src/catalog/schema.ts",
                "docs/modules/commerce.md"
            ],
            "current_behavior": "Not implemented. No price quote service exists; cart has no fixed shipping or coupon discount calculations.",
            "required_behavior": "POST /v1/checkout/quote validates items against current catalog, splits items by seller, adds $5.00 (500 cents) shipping per seller, allocates discounts proportionally, and issues signed expiring quote token.",
            "contracts": "QuoteRequestDto, QuoteResponseDto: { quoteToken: string, expiresAt: string, currency: 'USD', subtotalCents: string, shippingCents: string, discountCents: string, totalCents: string, sellers: Array<{ storeId: string, subtotalCents: string, shippingCents: string, discountCents: string, totalCents: string, items: Array<{ variantId: string, qty: number, unitPriceCents: string, totalCents: string }> }> }.",
            "commands": [
                "Implement QuoteService in packages/backend/src/commerce/quote.service.ts.",
                "Implement proportional discount allocator distributing coupon cents without losing fractional pennies.",
                "Enforce fixed demo shipping of 500 cents ($5.00) per unique seller suborder.",
                "Sign quote payload with HMAC-SHA256 producing acceptedQuoteToken with 15-minute expiration.",
                "Expose POST /v1/checkout/quote in CommerceController.",
                "Write unit and integration tests covering rounding and price shifts."
            ],
            "data_changes": "None in database; issues cryptographically signed JWT/HMAC token.",
            "security": "Quote tokens are signed with server secret; prevents client tampering with totals or prices.",
            "error_handling": "Returns 409 Conflict with code PRICE_CHANGED if catalog price moved since cart display.",
            "edge_cases": [
                "Coupon discount of $10.00 across 3 items ($3.33, $3.33, $3.34 - must sum exactly to 1000 cents)",
                "Cart contains products from 3 distinct sellers (shipping equals exactly 1500 cents)"
            ],
            "observability": "Quote calculation latency metrics.",
            "unit_tests": [
                "packages/backend/src/commerce/quote.service.test.ts (integer arithmetic, proportional allocation, penny rounding, shipping per seller)"
            ],
            "integration_tests": [
                "tests/integration/quote.spec.ts (request quote, alter DB price, request second quote, assert PRICE_CHANGED detected)"
            ],
            "e2e_tests": ["None."],
            "security_tests": [
                "Assert modified quote token is rejected with 401 INVALID_QUOTE"
            ],
            "manual_verification": "Request quote with 2 items from 2 sellers; verify total equals subtotal + $10.00 shipping.",
            "risk_level": "MEDIUM",
            "review_requirements": "Single thorough review pass focusing on integer arithmetic and penny-rounding edge cases. Documented in docs/reviews/t045-context.md.",
            "commit": "feat(commerce): implement canonical quote calculation and coupon allocation engine"
        },
        {
            "id": "046",
            "name": "Model Orders and Seller Suborders",
            "status": "PLANNED",
            "goal": "Author Drizzle schema and migrations for orders, seller_orders, order_items, and payment_attempts with immutable historical snapshots.",
            "why": "Provides relational foundation for multi-seller checkout, independent vendor fulfillment, and payment tracking.",
            "requirements": ["OR-2", "OR-6", "PRD Section 8", "REQ-COMM-001"],
            "blocked_by": ["TASK-003", "TASK-014", "TASK-019"],
            "blocks": ["TASK-047", "TASK-051", "TASK-055", "TASK-056"],
            "architecture": ["ARCHITECTURE.md -> Data Model", "DECISIONS.md -> DEC-011", "docs/architecture/data-model.md"],
            "skills": [
                {
                    "name": "domain-modeling",
                    "location": "skills/skills-main/skills/engineering/domain-modeling/SKILL.md",
                    "why": "Governs multi-tenant order hierarchy and immutable snapshotting.",
                    "instructions": ["Snapshot variant title, SKU, price, address", "FKs must use ON DELETE RESTRICT"]
                }
            ],
            "inspect_files": [
                "db/migrations/0002-stores.sql",
                "db/migrations/0006-catalog.sql",
                "docs/architecture/data-model.md"
            ],
            "current_behavior": "Not implemented. No order tables exist; customer checkout cannot be stored.",
            "required_behavior": "PostgreSQL schema models parent orders, child seller_orders (one per vendor), order_items, and payment_attempts with status constraints and RESTRICT foreign keys.",
            "contracts": "orders, seller_orders, order_items, payment_attempts Drizzle schemas in @shopscale/backend.",
            "commands": [
                "Author migration db/migrations/0013-orders.sql creating orders, seller_orders, order_items, and payment_attempts tables.",
                "Enforce status ENUMs: payment_status (PENDING, PAID, FAILED, REFUNDED), fulfillment_status (PENDING, PACKED, SHIPPED, DELIVERED, CANCELLED).",
                "Add composite foreign key: seller_orders(order_id, store_id).",
                "Add indexes on (user_id, created_at DESC) and (store_id, created_at DESC).",
                "Write schema constraint integration test tests/integration/orders-schema.spec.ts."
            ],
            "data_changes": "Creates orders, seller_orders, order_items, and payment_attempts tables in migration 0013-orders.sql.",
            "security": "Enforces ON DELETE RESTRICT: historical order records cannot be deleted even if products or stores are archived.",
            "error_handling": "Schema check constraints prevent invalid order totals or negative prices.",
            "edge_cases": [
                "Order containing 1 seller (exactly 1 parent order, 1 seller suborder created)",
                "Order containing 5 sellers (1 parent order, 5 distinct seller suborders created)"
            ],
            "observability": "Migration log confirmation.",
            "unit_tests": [
                "packages/backend/src/commerce/schema.test.ts (relations, status transitions, snapshot fields)"
            ],
            "integration_tests": [
                "tests/integration/orders-schema.spec.ts (insert parent order and suborders; verify composite FK; verify delete restriction)"
            ],
            "e2e_tests": ["None."],
            "security_tests": ["None."],
            "manual_verification": "Inspect PostgreSQL schema via psql: \\d orders; verify foreign keys and status constraints.",
            "risk_level": "MEDIUM",
            "review_requirements": "Single thorough review pass focusing on immutable snapshot fields and suborder relationships. Documented in docs/reviews/t046-context.md.",
            "commit": "feat(commerce): model orders seller suborders and payment attempts"
        },
        {
            "id": "047",
            "name": "Implement Idempotent Checkout Creation",
            "status": "PLANNED",
            "goal": "Build atomic checkout coordinator: verifies quote, requires Idempotency-Key, reserves inventory, creates parent order and seller suborders, and emits CheckoutReserved outbox event in one transaction.",
            "why": "Provides rock-solid transactional checkout creation immune to network retries, race conditions, and overselling.",
            "requirements": ["OR-1", "OR-4", "IN-2", "G2", "G3", "PRD Section 6.5"],
            "blocked_by": ["TASK-038", "TASK-041", "TASK-045", "TASK-046", "TASK-091", "TASK-029"],
            "blocks": ["TASK-048", "TASK-050", "TASK-051", "TASK-054"],
            "architecture": ["ARCHITECTURE.md -> Core correctness rules", "DECISIONS.md -> DEC-005", "DEC-011", "docs/modules/commerce.md"],
            "skills": [
                {
                    "name": "test-driven-development",
                    "location": "skills/agent-skills-main/skills/test-driven-development/SKILL.md",
                    "why": "Enforces testing retry storm and atomic rollback before implementation.",
                    "instructions": ["Test sending duplicate Idempotency-Key", "Assert one transaction for order, reservation, and outbox"]
                },
                {
                    "name": "security-and-hardening",
                    "location": "skills/agent-skills-main/skills/security-and-hardening/SKILL.md",
                    "why": "Governs idempotency key validation and request hashing.",
                    "instructions": ["Hash request payload with SHA-256", "Reject key reuse with modified body as 409 Conflict"]
                }
            ],
            "inspect_files": [
                "packages/backend/src/inventory/inventory.service.ts",
                "packages/backend/src/commerce/quote.service.ts",
                "packages/backend/src/platform/outbox.service.ts",
                "packages/backend/src/platform/database.ts"
            ],
            "current_behavior": "Not implemented. POST /v1/checkout route does not exist; shoppers cannot initiate orders.",
            "required_behavior": "POST /v1/checkout validates Idempotency-Key header; checks existing requests; validates quote token; reserves stock; snapshots address; inserts order, suborders, and outbox event; returns 201 Created with order ID and payment effect key.",
            "contracts": "CheckoutRequestDto: { channelKey: string, cartVersion: number, addressId: string, acceptedQuoteToken: string }. Header: Idempotency-Key: UUID. Response: CheckoutAcceptedDto: { orderId: string, status: 'PENDING', paymentEffectKey: string, totalCents: string, expiresAt: string }.",
            "commands": [
                "Author migration db/migrations/0014-idempotency.sql creating idempotency_requests table with UNIQUE(user_id, operation, channel_key, key).",
                "Implement CheckoutCoordinator in packages/backend/src/commerce/checkout.service.ts.",
                "Execute single UnitOfWorkContext transaction containing: idempotency check, InventoryService.reserve(), address snapshot, order & suborders insert, and OutboxWriter.write(CheckoutReserved).",
                "Expose POST /v1/checkout in CommerceController with Fastify idempotency guard.",
                "Write comprehensive integration tests in tests/integration/checkout.spec.ts."
            ],
            "data_changes": "Inserts idempotency_requests, orders, seller_orders, order_items, stock_reservations, and outbox in single ACID transaction.",
            "security": "Mandates authenticated customer session; validates addressId belongs to current user; verifies quote token signature.",
            "error_handling": "Returns 400 on missing Idempotency-Key; 409 Conflict on payload mismatch or INSUFFICIENT_STOCK; 401 on expired quote.",
            "edge_cases": [
                "Client retries exact request 5 seconds later (idempotency table returns original 201 response without re-executing reservation)",
                "Stock fails on item 2 of 4 (entire transaction rolls back; 0 orders or partial reservations created)"
            ],
            "observability": "Logs checkout initiation duration and order ID; records checkout_requests_total metric.",
            "unit_tests": [
                "packages/backend/src/commerce/checkout.service.test.ts (input validation, suborder grouping, idempotency key hashing)"
            ],
            "integration_tests": [
                "tests/integration/checkout.spec.ts (full atomic checkout; assert order + suborders + reservations + outbox committed together; assert duplicate key returns cached response)"
            ],
            "e2e_tests": ["None."],
            "security_tests": [
                "Assert reusing idempotency key with modified addressId returns 409 Conflict"
            ],
            "manual_verification": "Submit POST /v1/checkout via curl with Idempotency-Key header; inspect database; verify 1 order, suborders, and outbox record created.",
            "risk_level": "HIGH",
            "review_requirements": "Requires two independent review passes on ACID transaction boundaries and idempotency hashing. Documented in docs/reviews/t047-context.md.",
            "commit": "feat(commerce): implement idempotent atomic checkout creation with stock reservation"
        },
        {
            "id": "048",
            "name": "Build Checkout Review and Pending-Order UI",
            "status": "PLANNED",
            "goal": "Build Next.js checkout flow: address selector, quote summary, place-order submission with client-generated idempotency key, and pending payment status screen.",
            "why": "Provides shoppers with an intuitive, accessible multi-step checkout interface.",
            "requirements": ["OR-1", "REQ-STORE-004", "design.md"],
            "blocked_by": ["TASK-043", "TASK-045", "TASK-047"],
            "blocks": ["TASK-057"],
            "architecture": ["ARCHITECTURE.md -> Frontend", "docs/architecture/frontend.md"],
            "skills": [
                {
                    "name": "frontend-ui-engineering",
                    "location": "skills/agent-skills-main/skills/frontend-ui-engineering/SKILL.md",
                    "why": "Governs multi-step checkout state, accessible form controls, and loading spinners.",
                    "instructions": ["Generate UUID Idempotency-Key in client", "Disable submit button on click to prevent double submits"]
                }
            ],
            "inspect_files": [
                "apps/web/src/features/cart/cart-drawer.tsx",
                "apps/web/src/features/account/address-book.tsx",
                "apps/web/src/lib/api.ts"
            ],
            "current_behavior": "Checkout CTA in cart drawer is a dead link; no checkout pages exist in apps/web.",
            "required_behavior": "Navigating to /checkout guides user through Address Selection -> Review Quote -> Submit Order with spinner -> Redirects to /orders/[id]/pending status view.",
            "contracts": "CheckoutFormState and OrderReviewProps in apps/web/src/features/checkout/.",
            "commands": [
                "Build checkout page in apps/web/src/app/checkout/page.tsx.",
                "Build AddressSelector step reusing saved customer addresses.",
                "Build OrderSummary step displaying suborders, shipping fees, and total.",
                "Generate crypto.randomUUID() for Idempotency-Key header on form submit.",
                "Build OrderPendingScreen polling or waiting for payment confirmation.",
                "Write component tests and form interaction tests."
            ],
            "data_changes": "None.",
            "security": "Enforces HTTPS transport; prevents submission if quote token is expired.",
            "error_handling": "Displays reviewable banner if backend returns 409 PRICE_CHANGED or INSUFFICIENT_STOCK with link back to cart.",
            "edge_cases": [
                "User has zero saved addresses (prompts inline new address form without leaving checkout)"
            ],
            "observability": "Checkout funnel step drop-off analytics.",
            "unit_tests": [
                "apps/web/src/features/checkout/checkout-form.test.tsx (step navigation, address selection, submission button disabled state)"
            ],
            "integration_tests": [
                "apps/web/src/features/checkout/checkout-flow.test.ts (fetch quote, submit checkout, assert redirect)"
            ],
            "e2e_tests": [
                "tests/e2e/checkout.spec.ts (complete purchase from cart to pending order confirmation screen)"
            ],
            "security_tests": ["None."],
            "manual_verification": "Complete checkout in browser; verify order summary displays split seller items and redirects to confirmation screen.",
            "risk_level": "LOW",
            "review_requirements": "Single review pass focusing on double-click submission prevention and mobile layout. Documented in docs/reviews/t048-context.md.",
            "commit": "feat(web): build multi-step checkout review and pending order confirmation screens"
        },
        {
            "id": "049",
            "name": "Implement Persistent Mock Payment Provider",
            "status": "PLANNED",
            "goal": "Build standalone/co-located mock payment HTTP simulator supporting charges, deterministic delays, simulated declines, and HMAC-SHA256 signed webhook callbacks.",
            "why": "Enables completely realistic payment integration, webhook testing, and failure compensation without requiring live third-party accounts.",
            "requirements": ["OR-3", "G3", "PRD Section 1.3", "PRD Section 6.5"],
            "blocked_by": ["TASK-002", "TASK-005"],
            "blocks": ["TASK-050", "TASK-052"],
            "architecture": ["ARCHITECTURE.md -> Integrations", "DECISIONS.md -> DEC-008", "docs/modules/payments.md"],
            "skills": [
                {
                    "name": "api-and-interface-design",
                    "location": "skills/agent-skills-main/skills/api-and-interface-design/SKILL.md",
                    "why": "Governs payment intent contracts and signed webhook payloads.",
                    "instructions": ["Simulate asynchronous payment outcomes", "Sign callbacks with HMAC-SHA256"]
                },
                {
                    "name": "security-and-hardening",
                    "location": "skills/agent-skills-main/skills/security-and-hardening/SKILL.md",
                    "why": "Enforces cryptographic signing over raw bytes with timestamp headers.",
                    "instructions": ["Include X-ShopScale-Timestamp", "Compute signature over timestamp + '.' + rawBody"]
                }
            ],
            "inspect_files": [
                "packages/config/src/env.ts",
                "packages/contracts/src/errors.ts",
                "docs/modules/payments.md"
            ],
            "current_behavior": "Not implemented. No payment simulator service exists; no signed webhooks can be generated.",
            "required_behavior": "POST /mock-payments/charges accepts charge requests; records attempt in mock ledger; asynchronously fires POST /v1/webhooks/payments signed with HMAC-SHA256 after configurable delay.",
            "contracts": "MockChargeRequestDto: { effectKey: string, amountCents: string, currency: 'USD', returnUrl: string, simulateOutcome?: 'SUCCESS' | 'DECLINED' | 'TIMEOUT' }. WebhookPayload: { eventId: string, type: 'payment.succeeded' | 'payment.failed', effectKey: string, amountCents: string, providerRef: string, timestamp: number }.",
            "commands": [
                "Implement mock payment simulator in apps/mock-payments/ (or nested Nest module).",
                "Build persistent ledger in memory or SQLite/PG tracking effect keys.",
                "Implement WebhookDispatcher signing raw JSON body with HMAC-SHA256 using WEBHOOK_SECRET.",
                "Support deterministic simulation flags in request body or headers.",
                "Write integration tests in tests/integration/mock-payments.spec.ts."
            ],
            "data_changes": "None in primary database; maintains standalone mock payment ledger.",
            "security": "Webhook signing secret validated at boot; signatures generated using crypto.createHmac.",
            "error_handling": "Returns 400 on missing effectKey; 409 on reused effectKey with conflicting amount.",
            "edge_cases": [
                "Simulated network timeout (simulator delays webhook by 10 seconds to test reconciliation)"
            ],
            "observability": "Simulator access logs detailing dispatched webhook events and status codes.",
            "unit_tests": [
                "apps/mock-payments/src/signer.test.ts (HMAC signature calculation, timestamp concatenation)"
            ],
            "integration_tests": [
                "tests/integration/mock-payments.spec.ts (submit charge, receive signed webhook, assert valid signature)"
            ],
            "e2e_tests": ["None."],
            "security_tests": [
                "Assert tampering with webhook payload invalidates signature check"
            ],
            "manual_verification": "Trigger test charge via curl; verify simulator logs print dispatched webhook with 200 OK acknowledgment.",
            "risk_level": "MEDIUM",
            "review_requirements": "Single thorough review pass focusing on webhook signature generation and delay handling. Documented in docs/reviews/t049-context.md.",
            "commit": "feat(payments): implement persistent mock payment simulator with hmac signing"
        },
        {
            "id": "050",
            "name": "Implement Payment Dispatch and Webhook Ingestion",
            "status": "PLANNED",
            "goal": "Build payment-dispatch worker consuming CheckoutReserved outbox events, and implement POST /v1/webhooks/payments validating HMAC signatures and deduplicating events.",
            "why": "Completes the asynchronous payment processing pipeline while guaranteeing zero duplicate processing of webhook retries.",
            "requirements": ["OR-3", "G3", "PRD Section 6.5"],
            "blocked_by": ["TASK-029", "TASK-047", "TASK-049"],
            "blocks": ["TASK-051", "TASK-052", "TASK-054"],
            "architecture": ["ARCHITECTURE.md -> Synchronous vs Asynchronous", "DECISIONS.md -> DEC-008", "docs/modules/payments.md"],
            "skills": [
                {
                    "name": "security-and-hardening",
                    "location": "skills/agent-skills-main/skills/security-and-hardening/SKILL.md",
                    "why": "Enforces timing-safe HMAC signature verification over raw request buffers.",
                    "instructions": ["Use crypto.timingSafeEqual", "Validate timestamp tolerance (5 min)", "Capture raw body buffer"]
                },
                {
                    "name": "test-driven-development",
                    "location": "skills/agent-skills-main/skills/test-driven-development/SKILL.md",
                    "why": "Enforces testing invalid signatures and duplicate webhook replays before writing handler.",
                    "instructions": ["Test expired webhook timestamp", "Test modified body signature failure"]
                }
            ],
            "inspect_files": [
                "apps/api/src/main.ts",
                "packages/backend/src/platform/security.ts",
                "docs/modules/payments.md"
            ],
            "current_behavior": "Not implemented. CheckoutReserved events are unconsumed; webhook endpoint does not exist.",
            "required_behavior": "Worker calls payment provider for CheckoutReserved events; POST /v1/webhooks/payments validates signature, deduplicates in webhook_events, and writes PaymentObserved outbox event in single transaction.",
            "contracts": "webhook_events: (provider text, event_id text, payload_hash text, payload JSONB, received_at timestamptz, processed_at timestamptz, status text, PRIMARY KEY(provider, event_id)).",
            "commands": [
                "Author migration db/migrations/0015-webhooks.sql creating webhook_events table.",
                "Configure Fastify raw body parsing plugin on /v1/webhooks/payments.",
                "Implement WebhookSignatureGuard validating X-ShopScale-Timestamp and X-ShopScale-Signature.",
                "Build WebhookService deduplicating events against webhook_events table.",
                "Write PaymentObserved event to transactional outbox.",
                "Build PaymentDispatchWorker in apps/worker/src/consumers/payment-dispatch.consumer.ts.",
                "Write integration tests in tests/integration/payment-webhooks.spec.ts."
            ],
            "data_changes": "Creates webhook_events table in migration 0015-webhooks.sql; inserts outbox.",
            "security": "Rejects webhook calls with invalid signatures (401) or expired timestamps > 5 min (400); timing attack resistant.",
            "error_handling": "Duplicate webhook event ID with identical payload returns 200 OK without re-processing; duplicate ID with altered payload is quarantined with 409 Conflict.",
            "edge_cases": [
                "Webhook arrives before payment-dispatch worker finishes recording payment_attempt (attempt is lazily created or upserted)"
            ],
            "observability": "Logs webhook receipts; records payment_webhook_latency_seconds.",
            "unit_tests": [
                "packages/backend/src/payments/signature-validator.test.ts (timing-safe comparison, timestamp window, signature mismatch)"
            ],
            "integration_tests": [
                "tests/integration/payment-webhooks.spec.ts (valid webhook processed; duplicate webhook deduped; invalid signature rejected)"
            ],
            "e2e_tests": ["None."],
            "security_tests": [
                "Replay webhook with timestamp > 10 minutes old; assert 400 TIMESTAMP_EXPIRED",
                "Modify 1 character of webhook JSON; assert 401 INVALID_SIGNATURE"
            ],
            "manual_verification": "Deliver signed webhook via curl; verify webhook_events row inserted and outbox contains PaymentObserved event.",
            "risk_level": "HIGH",
            "review_requirements": "Multiple review passes on raw buffer capturing, HMAC verification, and deduplication logic. Documented in docs/reviews/t050-context.md.",
            "commit": "feat(payments): implement hmac webhook verification and event deduplication"
        },
        {
            "id": "051",
            "name": "Confirm Paid Orders and Compensate Failures",
            "status": "PLANNED",
            "goal": "Build payment completion saga: on successful PaymentObserved event, transition order & suborders to PAID, confirm inventory decrements (on_hand -= qty, reserved -= qty); on failure, release reserved stock and mark CANCELLED.",
            "why": "Guarantees that paid orders commit stock permanently and failed/declined orders cleanly release inventory without manual intervention.",
            "requirements": ["OR-2", "OR-5", "IN-1", "G2", "PRD Section 6.5"],
            "blocked_by": ["TASK-046", "TASK-047", "TASK-050"],
            "blocks": ["TASK-055", "TASK-056", "TASK-060"],
            "architecture": ["ARCHITECTURE.md -> Core correctness rules", "DECISIONS.md -> DEC-005", "docs/modules/commerce.md"],
            "skills": [
                {
                    "name": "test-driven-development",
                    "location": "skills/agent-skills-main/skills/test-driven-development/SKILL.md",
                    "why": "Enforces testing stock confirmation and compensation rollbacks.",
                    "instructions": ["Test successful payment confirms on_hand -= qty and reserved -= qty", "Test declined payment releases reserved stock"]
                },
                {
                    "name": "api-and-interface-design",
                    "location": "skills/agent-skills-main/skills/api-and-interface-design/SKILL.md",
                    "why": "Governs OrderPaid and OrderCancelled event emissions.",
                    "instructions": ["Emit OrderPaid event with seller suborder IDs", "Write append-only stock movement ledger"]
                }
            ],
            "inspect_files": [
                "packages/backend/src/inventory/inventory.service.ts",
                "packages/backend/src/commerce/checkout.service.ts",
                "apps/worker/src/main.ts",
                "docs/architecture/events.md"
            ],
            "current_behavior": "Not implemented. PaymentObserved events do not update order status or finalize inventory.",
            "required_behavior": "OrderPaidHandler transitions orders and seller_orders to PAID; confirms inventory; writes stock_movements (CHECKOUT_CONFIRM); emits OrderPaid outbox event. On payment failure, releases reservation, transitions to CANCELLED.",
            "contracts": "OrderPaidEvent: { orderId: string, sellerOrderIds: string[], totalCents: string, currency: 'USD' }.",
            "commands": [
                "Implement OrderCompletionHandler in packages/backend/src/commerce/order-completion.ts.",
                "On payment.succeeded: execute transaction updating orders.payment_status = 'PAID', seller_orders.fulfillment_status = 'PAID'.",
                "Call InventoryService.confirmReservation(tx, checkoutId) executing: UPDATE inventory SET on_hand = on_hand - reserved, reserved = 0.",
                "Insert stock_movements entry with reason = 'CHECKOUT_CONFIRMED'.",
                "On payment.failed: call InventoryService.releaseReservation(tx, checkoutId, 'PAYMENT_FAILED') and update order to CANCELLED.",
                "Wire worker consumer in apps/worker/src/consumers/order-completion.consumer.ts.",
                "Write comprehensive saga integration tests in tests/integration/order-saga.spec.ts."
            ],
            "data_changes": "Updates orders, seller_orders, inventory (on_hand, reserved); updates stock_reservations; inserts stock_movements and outbox.",
            "security": "Order confirmation transactions run internally with system authority; cannot be triggered directly by public HTTP endpoints.",
            "error_handling": "Failed saga steps trigger BullMQ retry; unrecoverable errors alert support queue without dropping order record.",
            "edge_cases": [
                "Late payment webhook for order whose reservation already expired (handled in T053 compensation refund flow)"
            ],
            "observability": "Logs order confirmation latency; records orders_paid_total metric.",
            "unit_tests": [
                "packages/backend/src/commerce/order-completion.test.ts (state machine transitions, compensation logic)"
            ],
            "integration_tests": [
                "tests/integration/order-saga.spec.ts (full flow: PaymentObserved -> order PAID -> stock on_hand & reserved decremented -> OrderPaid event emitted)"
            ],
            "e2e_tests": ["None."],
            "security_tests": ["None."],
            "manual_verification": "Deliver successful webhook; check database orders table; verify status is PAID and inventory on_hand is decremented.",
            "risk_level": "HIGH",
            "review_requirements": "Multiple review passes on inventory decrement arithmetic and failure compensation logic. Documented in docs/reviews/t051-context.md.",
            "commit": "feat(commerce): implement order confirmation saga and inventory settlement"
        },
        {
            "id": "052",
            "name": "Reconcile Uncertain Payment Outcomes",
            "status": "PLANNED",
            "goal": "Build scheduled reconciliation worker querying the payment provider for abandoned or timed-out checkout sessions.",
            "why": "Recovers orders where client timed out or webhook was delayed, guaranteeing no customer is charged without an order.",
            "requirements": ["G3", "OR-5", "PRD Section 1.2"],
            "blocked_by": ["TASK-049", "TASK-050", "TASK-051"],
            "blocks": ["TASK-073"],
            "architecture": ["ARCHITECTURE.md -> Synchronous vs Asynchronous", "docs/modules/payments.md"],
            "skills": [
                {
                    "name": "test-driven-development",
                    "location": "skills/agent-skills-main/skills/test-driven-development/SKILL.md",
                    "why": "Enforces testing reconciliation against timed-out simulator responses.",
                    "instructions": ["Simulate dropped webhook", "Assert reconciliation job discovers charge and confirms order"]
                }
            ],
            "inspect_files": [
                "packages/backend/src/payments/payment.service.ts",
                "apps/worker/src/main.ts",
                "docs/modules/payments.md"
            ],
            "current_behavior": "Not implemented. If a webhook fails to deliver or client times out, order remains in PENDING status forever.",
            "required_behavior": "Reconciliation worker runs every 5 minutes; finds PENDING orders older than 10 minutes; queries payment provider by effectKey; confirms order if provider charged, or cancels order if abandoned.",
            "contracts": "lookupEffect(effectKey) -> { status: 'CAPTURED' | 'FAILED' | 'NOT_FOUND', amountCents: string, providerRef: string }.",
            "commands": [
                "Implement PaymentReconciliationService in packages/backend/src/payments/reconciliation.service.ts.",
                "Build query scanning orders WHERE payment_status = 'PENDING' AND created_at < NOW() - INTERVAL '10 minutes'.",
                "Query PaymentPort.lookupEffect(paymentEffectKey) to determine true provider state.",
                "If CAPTURED: synthesize PaymentObserved event to confirm order.",
                "If NOT_FOUND or FAILED: cancel order and release reservation.",
                "Schedule BullMQ repeatable job 'payment-reconciliation' in apps/worker.",
                "Write integration tests in tests/integration/payment-reconciliation.spec.ts."
            ],
            "data_changes": "Updates orders, inventory; inserts outbox.",
            "security": "Reconciliation job uses internal system credentials with rate-limited provider queries.",
            "error_handling": "Provider network errors back off and retry on subsequent scheduled run without altering order state.",
            "edge_cases": [
                "Provider charge is still in 'processing' status (leaves order in PENDING to retry next cycle)"
            ],
            "observability": "Records count of reconciled orders and discrepancies resolved.",
            "unit_tests": [
                "packages/backend/src/payments/reconciliation.service.test.ts (lookup dispatch, resolution branching)"
            ],
            "integration_tests": [
                "tests/integration/payment-reconciliation.spec.ts (seed pending order with captured charge in simulator; run job; verify order transitions to PAID)"
            ],
            "e2e_tests": ["None."],
            "security_tests": ["None."],
            "manual_verification": "Create pending order without webhook; run reconciliation CLI; verify order updates to PAID automatically.",
            "risk_level": "MEDIUM",
            "review_requirements": "Single thorough review pass focusing on idempotent reconciliation outcomes. Documented in docs/reviews/t052-context.md.",
            "commit": "feat(payments): implement payment reconciliation worker for timed-out sessions"
        },
        {
            "id": "053",
            "name": "Prove the Checkout Expiry Race",
            "status": "PLANNED",
            "goal": "Build integration test suite proving late payment arrival after reservation expiry triggers automated compensation refund without overselling.",
            "why": "Proves the most dangerous commerce race condition is safely resolved without corrupted inventory counters.",
            "requirements": ["G2", "G3", "IN-2", "OR-5"],
            "blocked_by": ["TASK-039", "TASK-051"],
            "blocks": ["TASK-079"],
            "architecture": ["ARCHITECTURE.md -> Core correctness rules", "docs/modules/commerce.md"],
            "skills": [
                {
                    "name": "test-driven-development",
                    "location": "skills/agent-skills-main/skills/test-driven-development/SKILL.md",
                    "why": "Governs precise reproduction of race conditions using interleaved test steps.",
                    "instructions": ["Artificially expire reservation", "Deliver successful webhook and assert refund triggered"]
                }
            ],
            "inspect_files": [
                "packages/backend/src/commerce/order-completion.ts",
                "packages/backend/src/inventory/inventory.service.ts",
                "docs/modules/inventory.md"
            ],
            "current_behavior": "Not implemented. No automated test proves the late-payment-after-expiry compensation flow.",
            "required_behavior": "When payment webhook arrives for an order whose reservation was already EXPIRED, system detects expired reservation, transitions order to CANCELLED_EXPIRED, triggers payment refund, and leaves inventory untouched.",
            "contracts": "Test scenario in tests/integration/checkout-expiry-race.spec.ts.",
            "commands": [
                "Author integration test tests/integration/checkout-expiry-race.spec.ts.",
                "Initiate checkout for variant with stock = 1; reservation created.",
                "Artificially trigger expiry sweep: reservation transitions to EXPIRED, stock available restored to 1.",
                "Simulate a second customer purchasing the now-available unit; second order confirmed.",
                "Deliver payment.succeeded webhook for first order.",
                "Assert first order is marked CANCELLED_EXPIRED, refund compensation initiated, and inventory on_hand remains exactly 0 (no negative stock).",
                "Document execution proof in docs/reviews/t053-context.md."
            ],
            "data_changes": "None in schema; exercises orders, reservations, refunds, and financial ledgers.",
            "security": "Ensures customer whose payment arrived late receives full automated refund without manual dispute.",
            "error_handling": "System must never crash or silently accept late payment when stock is gone.",
            "edge_cases": [
                "Item restocked before late payment arrives (must still refund; never silently resurrect expired order)"
            ],
            "observability": "Records expired_payment_compensated_total counter.",
            "unit_tests": ["None."],
            "integration_tests": [
                "tests/integration/checkout-expiry-race.spec.ts (exact step-by-step race condition execution)"
            ],
            "e2e_tests": ["None."],
            "security_tests": ["None."],
            "manual_verification": "Run 'pnpm exec vitest run tests/integration/checkout-expiry-race.spec.ts'; assert test passes 100%.",
            "risk_level": "HIGH",
            "review_requirements": "Multiple review passes on compensation refund trigger and stock invariant safety. Documented in docs/reviews/t053-context.md.",
            "commit": "test(commerce): prove automated compensation refund on late payment after reservation expiry"
        },
        {
            "id": "054",
            "name": "Prove Retry and Duplicate-Webhook Safety",
            "status": "PLANNED",
            "goal": "Build automated concurrency test suite proving that 20 duplicate checkout requests and duplicate payment webhooks produce exactly 1 order, 1 charge, and 1 stock decrement.",
            "why": "Provides indisputable proof of PRD Goal G3 (Payments are safe to retry; duplicate webhook tests).",
            "requirements": ["G3", "OR-1", "OR-3", "NFR-009", "PRD Section 1.2"],
            "blocked_by": ["TASK-047", "TASK-050", "TASK-051"],
            "blocks": ["TASK-079"],
            "architecture": ["ARCHITECTURE.md -> Core correctness rules", "DECISIONS.md -> DEC-008"],
            "skills": [
                {
                    "name": "performance-optimization",
                    "location": "skills/agent-skills-main/skills/performance-optimization/SKILL.md",
                    "why": "Governs concurrent HTTP replay storm scripting.",
                    "instructions": ["Fire 20 identical checkout requests simultaneously", "Assert exactly 1 charge executed"]
                },
                {
                    "name": "test-driven-development",
                    "location": "skills/agent-skills-main/skills/test-driven-development/SKILL.md",
                    "why": "Enforces strict validation of idempotency invariants under concurrent bursts.",
                    "instructions": ["Verify all 20 responses return identical orderId", "Assert zero duplicate database rows"]
                }
            ],
            "inspect_files": [
                "packages/backend/src/commerce/checkout.service.ts",
                "packages/backend/src/payments/webhook.service.ts",
                "loadtests/retry-storm.js"
            ],
            "current_behavior": "Not implemented. No automated suite fires concurrent replays to prove single-effect idempotency.",
            "required_behavior": "20 concurrent identical checkout requests produce 1 order, 1 payment attempt, and identical 201 responses; 20 concurrent duplicate webhook callbacks produce 1 payment confirmation.",
            "contracts": "k6 scenario script in loadtests/retry-storm.js.",
            "commands": [
                "Author loadtests/retry-storm.js firing 20 concurrent POST /v1/checkout requests sharing the same Idempotency-Key and user session.",
                "Assert all 20 responses return HTTP 201 with identical orderId and payload hashes.",
                "Query database: assert count(orders) == 1, count(payment_attempts) == 1.",
                "Fire 20 duplicate webhook events with identical eventId to POST /v1/webhooks/payments simultaneously.",
                "Assert exactly 1 webhook_events entry processed and 1 OrderPaid event generated.",
                "Document execution proof in docs/reviews/t054-context.md."
            ],
            "data_changes": "None in schema; exercises idempotency_requests and webhook_events.",
            "security": "Proves protection against double-charging and race exploitation.",
            "error_handling": "All concurrent duplicate calls must resolve cleanly without deadlock or 500 error.",
            "edge_cases": [
                "All 20 requests hit the server at the exact same microsecond (PostgreSQL UNIQUE constraint on idempotency key enforces exactly one winner)"
            ],
            "observability": "Idempotency cache hit rate metrics.",
            "unit_tests": ["None."],
            "integration_tests": [
                "tests/integration/idempotency-concurrency.spec.ts (Promise.all simultaneous replay verification)"
            ],
            "e2e_tests": ["None."],
            "security_tests": ["None."],
            "manual_verification": "Execute 'pnpm exec k6 run loadtests/retry-storm.js'; verify terminal outputs 0 failures and exactly 1 order created.",
            "risk_level": "HIGH",
            "review_requirements": "Multiple review passes on idempotency uniqueness locks and replay proof. Documented in docs/reviews/t054-context.md.",
            "commit": "test(commerce): prove idempotency replay storm produces exactly one order and charge"
        }
    ]
