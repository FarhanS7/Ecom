def get_tasks():
    return [
        {
            "id": "055",
            "name": "Implement Scoped Order History and Detail",
            "status": "PLANNED",
            "goal": "Build customer order history endpoints and seller-scoped order queries with PII masking for unfulfilled orders.",
            "why": "Enables customers to review purchases and gives vendors fulfillment views while protecting customer privacy.",
            "requirements": ["OR-2", "G4", "PRD Section 5.2", "PRD Section 6.5"],
            "blocked_by": ["TASK-046", "TASK-051", "TASK-091"],
            "blocks": ["TASK-057", "TASK-058"],
            "architecture": ["ARCHITECTURE.md -> Authorization", "docs/modules/commerce.md"],
            "skills": [
                {
                    "name": "api-and-interface-design",
                    "location": "skills/agent-skills-main/skills/api-and-interface-design/SKILL.md",
                    "why": "Governs customer and seller order response DTOs and keyset pagination.",
                    "instructions": ["Mask PII until order status is PAID", "Scope seller orders strictly to their items"]
                },
                {
                    "name": "security-and-hardening",
                    "location": "skills/agent-skills-main/skills/security-and-hardening/SKILL.md",
                    "why": "Enforces ABAC privacy masking and tenancy scoping.",
                    "instructions": ["Mask street and phone for unpaid orders", "Enforce user ownership on customer routes"]
                }
            ],
            "inspect_files": [
                "packages/backend/src/commerce/schema.ts",
                "packages/contracts/src/identity.ts",
                "docs/modules/commerce.md"
            ],
            "current_behavior": "Not implemented. No endpoints exist to view customer orders or seller suborders.",
            "required_behavior": "GET /v1/orders returns customer's orders; GET /v1/seller/stores/{id}/orders returns only suborders belonging to that store; customer PII is masked until status is PAID.",
            "contracts": "CustomerOrderDto, SellerOrderDto in @shopscale/contracts.",
            "commands": [
                "Implement OrderQueryService in packages/backend/src/commerce/order-query.service.ts.",
                "Build customer order listing with keyset cursor pagination on (created_at DESC, id DESC).",
                "Build seller suborder query joining seller_orders and order_items strictly scoped by store_id.",
                "Implement PIIMasker utility masking recipient name and street address for unpaid orders.",
                "Expose GET /v1/orders, GET /v1/orders/:id, and GET /v1/seller/stores/:id/orders in CommerceController.",
                "Write integration tests in tests/integration/order-query.spec.ts."
            ],
            "data_changes": "None.",
            "security": "Enforces store scoping: seller cannot see other vendors' order items or totals.",
            "error_handling": "Returns 404 Not Found if customer attempts to view another user's order ID.",
            "edge_cases": [
                "Customer has 200+ orders (keyset cursor pagination prevents slow deep queries)"
            ],
            "observability": "Order history query duration metrics.",
            "unit_tests": [
                "packages/backend/src/commerce/pii-masker.test.ts (PII masking rules based on payment status)"
            ],
            "integration_tests": [
                "tests/integration/order-query.spec.ts (customer views own orders; seller views only their suborder items; assert cross-seller isolation)"
            ],
            "e2e_tests": ["None."],
            "security_tests": [
                "Assert seller querying another store's suborders receives 404 Not Found"
            ],
            "manual_verification": "Fetch /v1/seller/stores/{seller1StoreId}/orders; verify order items from Seller 2 are completely absent.",
            "risk_level": "MEDIUM",
            "review_requirements": "Single thorough review pass focusing on cross-seller data isolation. Documented in docs/reviews/t055-context.md.",
            "commit": "feat(commerce): implement customer order history and seller suborder query with pii masking"
        },
        {
            "id": "056",
            "name": "Implement Seller Fulfillment Transitions",
            "status": "PLANNED",
            "goal": "Build seller fulfillment state machine transitioning suborders from PAID -> PACKED -> SHIPPED -> DELIVERED, updating tracking numbers and emitting SuborderTransitioned outbox events.",
            "why": "Enables independent vendor fulfillment without coupling shipping statuses across multiple sellers in a shared basket.",
            "requirements": ["OR-2", "OR-6", "G4", "PRD Section 6.5"],
            "blocked_by": ["TASK-046", "TASK-051", "TASK-018"],
            "blocks": ["TASK-057", "TASK-058", "TASK-060"],
            "architecture": ["ARCHITECTURE.md -> Module boundaries", "DECISIONS.md -> DEC-011", "docs/modules/commerce.md"],
            "skills": [
                {
                    "name": "test-driven-development",
                    "location": "skills/agent-skills-main/skills/test-driven-development/SKILL.md",
                    "why": "Enforces testing illegal state transitions before implementation.",
                    "instructions": ["Test jumping from PAID directly to DELIVERED", "Assert illegal transition throws 400 Bad Request"]
                },
                {
                    "name": "api-and-interface-design",
                    "location": "skills/agent-skills-main/skills/api-and-interface-design/SKILL.md",
                    "why": "Governs seller fulfillment API endpoint under /v1/seller/stores/{id}/orders/{suborderId}/transitions.",
                    "instructions": ["Require trackingRef when status is SHIPPED", "Derive parent order status dynamically"]
                }
            ],
            "inspect_files": [
                "packages/backend/src/commerce/schema.ts",
                "packages/backend/src/platform/outbox.service.ts",
                "docs/modules/commerce.md"
            ],
            "current_behavior": "Not implemented. Seller suborders remain permanently in initial status; no transitions can occur.",
            "required_behavior": "Seller transitions suborder through strict FSM; provides trackingRef on SHIPPED; parent order status is derived dynamically (DELIVERED only when all suborders reach DELIVERED); emits SuborderTransitioned event.",
            "contracts": "FulfillmentTransitionDto: { toStatus: 'PACKED' | 'SHIPPED' | 'DELIVERED', trackingRef?: string }. SuborderTransitionedEvent.",
            "commands": [
                "Author migration db/migrations/0016-fulfillment.sql creating fulfillment_events table.",
                "Implement FulfillmentFSM in packages/backend/src/commerce/fulfillment-fsm.ts enforcing legal transitions.",
                "Implement FulfillmentService with scoped store verification.",
                "Update seller_orders and append row to fulfillment_events in single transaction.",
                "Re-evaluate and update parent orders.fulfillment_status (e.g. PARTIALLY_SHIPPED vs SHIPPED).",
                "Write SuborderTransitioned event to transactional outbox.",
                "Write integration tests in tests/integration/fulfillment.spec.ts."
            ],
            "data_changes": "Creates fulfillment_events table in migration 0016-fulfillment.sql; updates seller_orders and orders; inserts outbox.",
            "security": "Enforces store ownership: seller can transition only suborders belonging to their own store.",
            "error_handling": "Returns 400 Bad Request on illegal state transition (e.g. PAID -> DELIVERED).",
            "edge_cases": [
                "Seller 1 ships suborder, Seller 2 suborder is still PACKED (parent order fulfillment status must show PARTIALLY_SHIPPED)"
            ],
            "observability": "Audit log for fulfillment state transitions with tracking number.",
            "unit_tests": [
                "packages/backend/src/commerce/fulfillment-fsm.test.ts (state machine validation, illegal transition rejection)"
            ],
            "integration_tests": [
                "tests/integration/fulfillment.spec.ts (multi-seller order; seller 1 marks packed/shipped; assert parent order reflects partially shipped; seller 2 ships; assert parent order reflects shipped)"
            ],
            "e2e_tests": ["None."],
            "security_tests": [
                "Assert seller cannot transition suborder belonging to another vendor"
            ],
            "manual_verification": "Execute fulfillment transition via curl; verify seller_orders status updates to SHIPPED with tracking number in database.",
            "risk_level": "MEDIUM",
            "review_requirements": "Single thorough review pass focusing on parent order status derivation and FSM rules. Documented in docs/reviews/t056-context.md.",
            "commit": "feat(commerce): implement seller fulfillment state machine and suborder transitions"
        },
        {
            "id": "057",
            "name": "Build Customer and Seller Order Screens",
            "status": "PLANNED",
            "goal": "Build Next.js customer order tracking portal (/account/orders/[id]) and seller fulfillment management console (/seller/orders).",
            "why": "Provides visual interfaces for shoppers to track packages and for merchants to manage fulfillment.",
            "requirements": ["OR-2", "OR-6", "design.md"],
            "blocked_by": ["TASK-048", "TASK-055", "TASK-056"],
            "blocks": ["TASK-059"],
            "architecture": ["ARCHITECTURE.md -> Frontend", "docs/architecture/frontend.md"],
            "skills": [
                {
                    "name": "frontend-ui-engineering",
                    "location": "skills/agent-skills-main/skills/frontend-ui-engineering/SKILL.md",
                    "why": "Governs order timeline visual steps, tracking badges, and seller fulfillment action dialogs.",
                    "instructions": ["Render horizontal visual progress stepper", "Show tracking number with carrier lookup placeholder"]
                }
            ],
            "inspect_files": [
                "apps/web/src/app/account/page.tsx",
                "apps/web/src/features/seller/actions.ts",
                "apps/web/src/components/ui/badge.tsx"
            ],
            "current_behavior": "Customer account order list and seller order management consoles do not exist.",
            "required_behavior": "Customer can view order tracking with visual progress stepper; seller can inspect customer shipping details and advance fulfillment states via action buttons.",
            "contracts": "CustomerOrderDetailProps and SellerOrderManagementProps in apps/web/src/features/orders/.",
            "commands": [
                "Build customer order history and detail pages in apps/web/src/app/account/orders/.",
                "Build visual OrderProgressStepper component (Pending -> Paid -> Packed -> Shipped -> Delivered).",
                "Build seller order dashboard in apps/web/src/app/seller/orders/.",
                "Implement fulfillment transition action modal (Pack Order, Enter Tracking & Ship).",
                "Write component tests and interaction tests."
            ],
            "data_changes": "None.",
            "security": "Enforces session authorization; seller console requires valid store membership.",
            "error_handling": "Displays inline toast error if fulfillment transition fails on backend.",
            "edge_cases": [
                "Customer viewing multi-seller order with mixed fulfillment statuses (renders separate tracking cards per seller)"
            ],
            "observability": "Order detail page views and action tracking.",
            "unit_tests": [
                "apps/web/src/features/orders/progress-stepper.test.tsx (active step highlighting, status color coding)"
            ],
            "integration_tests": [
                "apps/web/src/features/orders/fulfillment-action.test.ts (seller action advances suborder state)"
            ],
            "e2e_tests": [
                "tests/e2e/order-fulfillment.spec.ts (customer places order; seller logs in, ships order; customer views updated tracking status)"
            ],
            "security_tests": ["None."],
            "manual_verification": "Advance suborder to SHIPPED in /seller/orders; open /account/orders in customer tab; verify tracking number displays with Shipped status.",
            "risk_level": "LOW",
            "review_requirements": "Single review pass focusing on responsive layout and stepper accessibility. Documented in docs/reviews/t057-context.md.",
            "commit": "feat(web): build customer order tracking view and seller fulfillment management screens"
        },
        {
            "id": "058",
            "name": "Implement Cancellation and Return Requests",
            "status": "PLANNED",
            "goal": "Build cancellation for unshipped order lines and customer return request workflow with return reasons, items, and physical inspection states.",
            "why": "Enables customers to cancel unshipped items or request returns on delivered goods, protecting inventory and financial records.",
            "requirements": ["OR-2", "REQ-COMM-003", "PRD Section 6.5"],
            "blocked_by": ["TASK-055", "TASK-056"],
            "blocks": ["TASK-059", "TASK-060"],
            "architecture": ["ARCHITECTURE.md -> Core correctness rules", "docs/modules/commerce.md"],
            "skills": [
                {
                    "name": "api-and-interface-design",
                    "location": "skills/agent-skills-main/skills/api-and-interface-design/SKILL.md",
                    "why": "Governs cancellation and return request DTOs and state machines.",
                    "instructions": ["Disallow cancelling already-shipped items", "Enforce return quantity <= purchased quantity"]
                },
                {
                    "name": "test-driven-development",
                    "location": "skills/agent-skills-main/skills/test-driven-development/SKILL.md",
                    "why": "Enforces testing return limits and status constraints with failing tests first.",
                    "instructions": ["Test requesting return on cancelled order", "Test returning more items than purchased"]
                }
            ],
            "inspect_files": [
                "packages/backend/src/commerce/schema.ts",
                "packages/backend/src/commerce/order-query.service.ts",
                "docs/modules/commerce.md"
            ],
            "current_behavior": "Not implemented. Orders cannot be cancelled; returns are not modeled.",
            "required_behavior": "Customers can cancel unshipped order lines (triggers automated refund); customers can submit return requests on delivered items with reasons; returns require seller inspection.",
            "contracts": "CreateReturnRequestDto: { orderItemId: string, qty: number, reason: string }. ReturnRequestDto: { id: string, status: 'PENDING_INSPECTION' | 'APPROVED' | 'REJECTED', inspectionResult?: string }.",
            "commands": [
                "Author migration db/migrations/0017-returns.sql creating return_requests table.",
                "Implement CancellationService: verifies suborder is unshipped; cancels lines; triggers refund; releases/restocks inventory.",
                "Implement ReturnService: verifies order is DELIVERED; checks cumulative returned quantity; creates return request.",
                "Expose POST /v1/orders/:id/cancel and POST /v1/orders/:id/returns in CommerceController.",
                "Write integration tests in tests/integration/returns.spec.ts."
            ],
            "data_changes": "Creates return_requests table in migration 0017-returns.sql; updates orders and seller_orders.",
            "security": "Enforces customer ownership: user can cancel or return only items from their own orders.",
            "error_handling": "Returns 400 Bad Request if order is already SHIPPED during cancellation attempt; 409 if return quantity exceeds purchased count.",
            "edge_cases": [
                "Customer purchased 3 units, previously returned 1, attempts to return 3 more (rejected: max returnable is 2)"
            ],
            "observability": "Audit log for order cancellation and return submissions.",
            "unit_tests": [
                "packages/backend/src/commerce/return.service.test.ts (quantity cap logic, status validation)"
            ],
            "integration_tests": [
                "tests/integration/returns.spec.ts (cancel unshipped order; submit return on delivered order; assert return request persisted)"
            ],
            "e2e_tests": ["None."],
            "security_tests": [
                "Assert user cannot cancel or return an order belonging to another customer"
            ],
            "manual_verification": "Submit return request via curl for delivered item; verify return_requests row created with PENDING_INSPECTION status.",
            "risk_level": "MEDIUM",
            "review_requirements": "Single thorough review pass focusing on cumulative return quantity caps. Documented in docs/reviews/t058-context.md.",
            "commit": "feat(commerce): implement order cancellation and customer return request workflows"
        },
        {
            "id": "059",
            "name": "Build After-Sales Request Screens",
            "status": "PLANNED",
            "goal": "Build Next.js screens for customer return requests (/account/orders/[id]/return) and seller return inspection/approval console (/seller/returns).",
            "why": "Provides shoppers with self-service return workflows and merchants with physical return inspection controls.",
            "requirements": ["REQ-COMM-003", "design.md"],
            "blocked_by": ["TASK-057", "TASK-058"],
            "blocks": ["TASK-069"],
            "architecture": ["ARCHITECTURE.md -> Frontend", "docs/architecture/frontend.md"],
            "skills": [
                {
                    "name": "frontend-ui-engineering",
                    "location": "skills/agent-skills-main/skills/frontend-ui-engineering/SKILL.md",
                    "why": "Governs after-sales form controls, reason selectors, and seller decision modals.",
                    "instructions": ["Provide reason dropdown with text area for notes", "Include 'Restock Item' checkbox on seller approval"]
                }
            ],
            "inspect_files": [
                "apps/web/src/app/account/orders/[id]/page.tsx",
                "apps/web/src/features/seller/actions.ts",
                "apps/web/src/components/ui/modal.tsx"
            ],
            "current_behavior": "No UI exists for customer return requests or seller return approvals.",
            "required_behavior": "Customer can select items to return with reasons; seller can review pending returns, approve with restocking option, or reject with reason note.",
            "contracts": "ReturnFormProps and SellerReturnReviewProps in apps/web/src/features/returns/.",
            "commands": [
                "Build customer return request page in apps/web/src/app/account/orders/[id]/return/page.tsx.",
                "Build ReturnReasonSelector component with preset options (Defective, Wrong Item, Changed Mind).",
                "Build seller return queue dashboard in apps/web/src/app/seller/returns/page.tsx.",
                "Build SellerInspectionModal component allowing approval with restock toggle or rejection.",
                "Write component tests and form interaction tests."
            ],
            "data_changes": "None.",
            "security": "Enforces store scoping: seller can inspect only returns for items sold by their store.",
            "error_handling": "Displays inline error if return window has expired.",
            "edge_cases": [
                "Customer re-submitting return request while previous request is pending (form indicates existing active return)"
            ],
            "observability": "Return request submission telemetry.",
            "unit_tests": [
                "apps/web/src/features/returns/return-form.test.tsx (reason selection, quantity validation)"
            ],
            "integration_tests": [
                "apps/web/src/features/returns/seller-approval.test.ts (seller action submits approval decision)"
            ],
            "e2e_tests": [
                "tests/e2e/returns.spec.ts (customer submits return; seller approves with restock; verify status updates)"
            ],
            "security_tests": ["None."],
            "manual_verification": "Submit return request in customer view; open /seller/returns; approve return; verify return status is APPROVED.",
            "risk_level": "LOW",
            "review_requirements": "Single review pass focusing on customer usability and seller decision audit trails. Documented in docs/reviews/t059-context.md.",
            "commit": "feat(web): build customer return request screens and seller inspection console"
        },
        {
            "id": "060",
            "name": "Implement Partial Refunds and Balanced Ledger",
            "status": "PLANNED",
            "goal": "Build double-entry financial ledger service and refund engine supporting full/partial refunds, cumulative cap enforcement, and restocking.",
            "why": "Guarantees that all financial money movements balance to zero and prevents refunding more than captured payments.",
            "requirements": ["OR-8", "G3", "REQ-COMM-004", "PRD Section 6.5"],
            "blocked_by": ["TASK-051", "TASK-056", "TASK-058"],
            "blocks": ["TASK-069", "TASK-070"],
            "architecture": ["ARCHITECTURE.md -> Data Model", "DECISIONS.md -> DEC-012", "docs/modules/payments.md"],
            "skills": [
                {
                    "name": "test-driven-development",
                    "location": "skills/agent-skills-main/skills/test-driven-development/SKILL.md",
                    "why": "Enforces testing double-entry ledger balance and concurrent refund race conditions.",
                    "instructions": ["Assert sum(debit_cents) == sum(credit_cents)", "Test two concurrent partial refunds exceeding total"]
                },
                {
                    "name": "security-and-hardening",
                    "location": "skills/agent-skills-main/skills/security-and-hardening/SKILL.md",
                    "why": "Governs financial locks and cumulative refund caps.",
                    "instructions": ["Lock parent payment record FOR UPDATE during refund allocation", "Reject cumulative refund > captured amount"]
                }
            ],
            "inspect_files": [
                "packages/backend/src/payments/payment.service.ts",
                "packages/backend/src/inventory/inventory.service.ts",
                "docs/modules/payments.md"
            ],
            "current_behavior": "Not implemented. No financial ledger tables exist; refunds cannot be issued.",
            "required_behavior": "RefundService locks parent payment; calculates remaining refundable balance; executes mock refund; writes balanced debits and credits to financial_entries; restocks inventory if approved; writes RefundCompleted outbox event.",
            "contracts": "financial_entries: (id PK, operation_key text, order_id FK, refund_id FK nullable, store_id FK nullable, account text, debit_cents bigint, credit_cents bigint, created_at timestamptz).",
            "commands": [
                "Author migration db/migrations/0018-financial-ledger.sql creating refunds, refund_items, and financial_entries tables.",
                "Implement FinancialLedgerService in packages/backend/src/payments/financial-ledger.service.ts with balanced entry validator.",
                "Implement RefundService in packages/backend/src/payments/refund.service.ts locking payment attempt with SELECT ... FOR UPDATE.",
                "Ensure: sum(prior_refunds) + current_refund <= payment_attempt.amount_cents.",
                "Insert balanced financial_entries: debit seller_payable, credit customer_receivable.",
                "If restock requested: call InventoryService.adjustStock(tx, variantId, qty, 'RETURN_RESTOCK').",
                "Write RefundCompleted event to transactional outbox.",
                "Write integration tests in tests/integration/refund-ledger.spec.ts."
            ],
            "data_changes": "Creates refunds, refund_items, and financial_entries tables in migration 0018-financial-ledger.sql.",
            "security": "Refund operations require authorized seller, support, or admin actor; payment row locking prevents concurrent double-refunds.",
            "error_handling": "Returns 409 Conflict with code REFUND_EXCEEDS_PAYMENT if requested amount exceeds captured total.",
            "edge_cases": [
                "Two support agents issue partial refunds of $60 on a $100 order simultaneously (row lock ensures second call is rejected for exceeding $100)"
            ],
            "observability": "Audit log for every refund with actor ID, reason, and amount; records total_refunded_cents metric.",
            "unit_tests": [
                "packages/backend/src/payments/financial-ledger.service.test.ts (balanced debit/credit validation, account balance assertions)"
            ],
            "integration_tests": [
                "tests/integration/refund-ledger.spec.ts (issue partial refund; verify financial ledger balances; issue second refund exceeding remaining balance; assert rejection)"
            ],
            "e2e_tests": ["None."],
            "security_tests": [
                "Verify support agent cannot refund more than configured policy cap ($200.00)"
            ],
            "manual_verification": "Execute partial refund of $25.00 via API; query financial_entries; assert sum(debit_cents) - sum(credit_cents) == 0.",
            "risk_level": "HIGH",
            "review_requirements": "Multiple review passes on row-level locking, cumulative cap arithmetic, and double-entry balance. Documented in docs/reviews/t060-context.md.",
            "commit": "feat(payments): implement partial refunds with balanced double-entry financial ledger"
        },
        {
            "id": "061",
            "name": "Implement Invoices and Demo Notifications",
            "status": "PLANNED",
            "goal": "Build asynchronous worker jobs generating PDF invoices stored in MinIO and delivering simulated order confirmation emails/SMS.",
            "why": "Provides professional post-purchase documents and notifications without blocking the checkout HTTP thread.",
            "requirements": ["OR-7", "AD-3", "PRD Section 6.5", "PRD Section 6.7"],
            "blocked_by": ["TASK-029", "TASK-051"],
            "blocks": ["TASK-073"],
            "architecture": ["ARCHITECTURE.md -> Synchronous vs Asynchronous", "docs/modules/notifications.md"],
            "skills": [
                {
                    "name": "api-and-interface-design",
                    "location": "skills/agent-skills-main/skills/api-and-interface-design/SKILL.md",
                    "why": "Governs invoice document generation and notification delivery ledger schemas.",
                    "instructions": ["Store invoices in MinIO/S3", "Record notification deliveries in local ledger"]
                },
                {
                    "name": "test-driven-development",
                    "location": "skills/agent-skills-main/skills/test-driven-development/SKILL.md",
                    "why": "Enforces testing background worker consumer execution and PDF generation.",
                    "instructions": ["Test OrderPaid event triggers invoice generation", "Verify retry backoff on MinIO failure"]
                }
            ],
            "inspect_files": [
                "packages/backend/src/platform/storage.service.ts",
                "apps/worker/src/main.ts",
                "docs/modules/notifications.md"
            ],
            "current_behavior": "Not implemented. Paid orders do not produce invoices or trigger customer notification deliveries.",
            "required_behavior": "On OrderPaid event, worker generates PDF invoice using PDFKit, uploads to MinIO, records notification in notification_deliveries, and provides secure download URL.",
            "contracts": "notification_deliveries: (id PK, effect_key text UNIQUE, user_id FK, channel text, template text, status text, attempts int, created_at timestamptz).",
            "commands": [
                "Author migration db/migrations/0019-notifications.sql creating notification_deliveries and invoices tables.",
                "Implement PDFInvoiceGenerator in apps/worker/src/documents/invoice.generator.ts using pdfkit.",
                "Upload generated PDF stream to MinIO under invoices/{orderId}.pdf.",
                "Build NotificationService recording simulated email/SMS delivery in notification_deliveries table.",
                "Wire BullMQ consumer in apps/worker/src/consumers/order-paid.consumer.ts.",
                "Expose GET /v1/orders/:id/invoice issuing presigned download URL.",
                "Write integration tests in tests/integration/invoice-worker.spec.ts."
            ],
            "data_changes": "Creates notification_deliveries and invoices tables in migration 0019-notifications.sql.",
            "security": "Invoice downloads require verified order owner credentials; URLs expire after 15 minutes.",
            "error_handling": "Storage upload failures trigger BullMQ exponential retry up to 5 attempts before routing to dead-letter queue.",
            "edge_cases": [
                "Order with 10 line items across 3 sellers (PDF layout renders clean multi-page invoice without text clipping)"
            ],
            "observability": "Tracks PDF generation duration and MinIO upload latency.",
            "unit_tests": [
                "apps/worker/src/documents/invoice.generator.test.ts (PDF generation, line item totals formatting)"
            ],
            "integration_tests": [
                "tests/integration/invoice-worker.spec.ts (publish OrderPaid event; worker runs; verify PDF exists in MinIO and delivery logged in DB)"
            ],
            "e2e_tests": ["None."],
            "security_tests": [
                "Assert customer cannot download invoice belonging to another user"
            ],
            "manual_verification": "Complete checkout; download PDF invoice via browser; open PDF and verify order items, seller details, and totals.",
            "risk_level": "LOW",
            "review_requirements": "Single review pass focusing on PDF formatting and storage presigned URL security. Documented in docs/reviews/t061-context.md.",
            "commit": "feat(worker): implement pdf invoice generation and local notification dispatch"
        },
        {
            "id": "062",
            "name": "Audit All Privileged Business Mutations",
            "status": "PLANNED",
            "goal": "Build global AuditWriter port capturing actor_id, store_id, action, entity_type, entity_id, and redacted before/after JSON for all privileged mutations.",
            "why": "Guarantees complete regulatory auditability for vendor, support, and administrative actions.",
            "requirements": ["AD-1", "G4", "PRD Section 6.7"],
            "blocked_by": ["TASK-003", "TASK-015", "TASK-020", "TASK-056", "TASK-060"],
            "blocks": ["TASK-067", "TASK-069", "TASK-082"],
            "architecture": ["ARCHITECTURE.md -> Module boundaries", "docs/architecture/conventions.md"],
            "skills": [
                {
                    "name": "security-and-hardening",
                    "location": "skills/agent-skills-main/skills/security-and-hardening/SKILL.md",
                    "why": "Governs privileged mutation auditing and automatic PII redaction.",
                    "instructions": ["Redact passwords and session tokens", "Make audit_logs append-only with no UPDATE/DELETE grants"]
                },
                {
                    "name": "observability-and-instrumentation",
                    "location": "skills/agent-skills-main/skills/observability-and-instrumentation/SKILL.md",
                    "why": "Governs structured audit logs and compliance tracking.",
                    "instructions": ["Capture actor IP and request ID", "Record before and after state diffs"]
                }
            ],
            "inspect_files": [
                "db/migrations/0003-audit.sql",
                "packages/backend/src/platform/security.ts",
                "docs/modules/platform.md"
            ],
            "current_behavior": "0003-audit.sql exists with audit_logs table, but mutations across stores, catalog, fulfillment, and refunds do not invoke audit logging systematically.",
            "required_behavior": "All privileged mutations (seller approvals, product archival, fulfillment transitions, manual stock adjustments, refunds, policy edits) write append-only records to audit_logs.",
            "contracts": "AuditEntry: { actorId: string, storeId?: string, action: string, entityType: string, entityId: string, before?: Record<string, any>, after?: Record<string, any>, ip: string, requestId: string }.",
            "commands": [
                "Implement AuditWriterPort in packages/backend/src/platform/audit.service.ts.",
                "Build state sanitizer redacting passwords, session tokens, and credit card numbers from before/after payloads.",
                "Wire AuditWriter into: StoreService.approveStore, SellerCatalogService.archiveProduct, InventoryService.adjustStock, FulfillmentService.transition, RefundService.issueRefund.",
                "Expose GET /v1/admin/audit-logs restricted strictly to platform administrators.",
                "Write integration tests in tests/integration/audit.spec.ts."
            ],
            "data_changes": "Inserts append-only rows into audit_logs table.",
            "security": "audit_logs table has no UPDATE or DELETE application paths; read access restricted strictly to admin and support roles.",
            "error_handling": "Audit write failures must abort the enclosing business transaction to prevent un-audited state mutations.",
            "edge_cases": [
                "Large JSON before/after payloads (truncates unbounded string fields to 1000 characters to prevent database bloat)"
            ],
            "observability": "Audit log emission metrics.",
            "unit_tests": [
                "packages/backend/src/platform/audit-sanitizer.test.ts (token redaction, password stripping, JSON truncation)"
            ],
            "integration_tests": [
                "tests/integration/audit.spec.ts (perform seller approval, stock adjustment, and refund; verify audit_logs table contains matching rows with IP and requestId)"
            ],
            "e2e_tests": ["None."],
            "security_tests": [
                "Assert non-admin cannot access GET /v1/admin/audit-logs"
            ],
            "manual_verification": "Perform stock adjustment in seller console; query audit_logs table in psql; verify actor, old stock, and new stock recorded.",
            "risk_level": "MEDIUM",
            "review_requirements": "Single thorough review pass focusing on redaction of sensitive data and transaction coupling. Documented in docs/reviews/t062-context.md.",
            "commit": "feat(platform): implement privileged mutation audit logging across all domain services"
        }
    ]
