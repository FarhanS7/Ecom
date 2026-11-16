def get_tasks():
    return [
        {
            "id": "063",
            "name": "Build Coupon Management and Redemption UI",
            "status": "PLANNED",
            "goal": "Build coupon creation and management interface in seller/admin consoles and coupon application input in checkout drawer.",
            "why": "Enables vendors and platform operators to offer promotional discounts and allows shoppers to redeem valid discount codes.",
            "requirements": ["OR-9", "design.md", "PRD Section 6.5"],
            "blocked_by": ["TASK-045", "TASK-027"],
            "blocks": ["TASK-075"],
            "architecture": ["ARCHITECTURE.md -> Frontend", "docs/architecture/frontend.md"],
            "skills": [
                {
                    "name": "frontend-ui-engineering",
                    "location": "skills/agent-skills-main/skills/frontend-ui-engineering/SKILL.md",
                    "why": "Governs coupon form input, inline discount breakdown, and error toasts.",
                    "instructions": ["Provide coupon code input in cart and checkout", "Show discount amount inline in price breakdown"]
                }
            ],
            "inspect_files": [
                "apps/web/src/features/checkout/checkout-form.tsx",
                "packages/backend/src/commerce/quote.service.ts",
                "apps/web/src/components/ui/input.tsx"
            ],
            "current_behavior": "Checkout has no coupon code input; seller console cannot author promotional discounts.",
            "required_behavior": "Seller can author percentage/fixed coupons with validity dates; shopper enters coupon code at checkout; discount reflects immediately in quote breakdown.",
            "contracts": "CouponDto: { code: string, kind: 'PERCENT' | 'FIXED', value: number, startsAt: string, endsAt: string, globalLimit: number, perUserLimit: number }.",
            "commands": [
                "Author migration db/migrations/0020-coupons.sql creating coupons, coupon_uses, and coupon_user_counters tables.",
                "Build CouponService with atomic increment on coupon_uses under row lock.",
                "Build CouponManagementTable in apps/web/src/app/seller/coupons/page.tsx.",
                "Add CouponInput component to CartDrawer and CheckoutForm.",
                "Write component tests and redemption integration tests."
            ],
            "data_changes": "Creates coupons, coupon_uses, and coupon_user_counters tables in migration 0020-coupons.sql.",
            "security": "Enforces store scoping: store coupons apply only to products from that specific store; global limits enforced atomically.",
            "error_handling": "Displays inline message if coupon is expired, invalid, or usage limit is exceeded.",
            "edge_cases": [
                "User attempts to redeem coupon twice when perUserLimit = 1 (rejected with 409 COUPON_LIMIT_EXCEEDED)"
            ],
            "observability": "Tracks coupon redemption rate and revenue discount metrics.",
            "unit_tests": [
                "apps/web/src/features/checkout/coupon-input.test.tsx (code submission, active discount badge, removal)"
            ],
            "integration_tests": [
                "tests/integration/coupons.spec.ts (create coupon; redeem in checkout; assert usage count increments; assert second redemption blocked)"
            ],
            "e2e_tests": [
                "tests/e2e/coupons.spec.ts (create coupon as seller, apply coupon at checkout, verify final total decreases)"
            ],
            "security_tests": [
                "Assert store coupon does not discount products from other stores in marketplace basket"
            ],
            "manual_verification": "Create coupon 'SAVE10'; apply at checkout; verify order total decreases by $10.00.",
            "risk_level": "MEDIUM",
            "review_requirements": "Single thorough review pass focusing on atomic usage counting and store-scoped discount boundaries. Documented in docs/reviews/t063-context.md.",
            "commit": "feat(promotions): implement coupon management and checkout redemption interface"
        },
        {
            "id": "064",
            "name": "Implement Verified Reviews and Rating Projection",
            "status": "PLANNED",
            "goal": "Build review submission requiring verified purchaser status, UNIQUE(product_id, user_id) constraint, and asynchronous rating rollup projector.",
            "why": "Eliminates fraudulent reviews and provides shoppers with trustworthy star ratings and customer feedback.",
            "requirements": ["RV-1", "RV-2", "PRD Section 6.6"],
            "blocked_by": ["TASK-019", "TASK-030", "TASK-056"],
            "blocks": ["TASK-075"],
            "architecture": ["ARCHITECTURE.md -> Catalog", "docs/modules/engagement.md"],
            "skills": [
                {
                    "name": "test-driven-development",
                    "location": "skills/agent-skills-main/skills/test-driven-development/SKILL.md",
                    "why": "Enforces testing verified purchaser verification and review deduplication.",
                    "instructions": ["Test unpurchased review rejection (403)", "Test duplicate review on same product (409)"]
                },
                {
                    "name": "api-and-interface-design",
                    "location": "skills/agent-skills-main/skills/api-and-interface-design/SKILL.md",
                    "why": "Governs review submission and listing contracts.",
                    "instructions": ["Validate rating is integer 1 to 5", "Emit ReviewChanged event on write"]
                }
            ],
            "inspect_files": [
                "packages/backend/src/commerce/schema.ts",
                "packages/backend/src/search/projector.ts",
                "docs/modules/engagement.md"
            ],
            "current_behavior": "Not implemented. Products have static placeholder rating counts; customers cannot write reviews.",
            "required_behavior": "Only customers with a DELIVERED order containing the product variant can submit a review; enforced 1 review per user per product; ReviewChanged outbox event asynchronously updates rating_avg and rating_count.",
            "contracts": "CreateReviewDto: { rating: 1 | 2 | 3 | 4 | 5, body: string }. ReviewDto: { id: string, rating: number, body: string, authorName: string, createdAt: string }.",
            "commands": [
                "Author migration db/migrations/0021-reviews.sql creating reviews table with UNIQUE(product_id, user_id).",
                "Implement ReviewService in packages/backend/src/engagement/review.service.ts.",
                "Verify customer has an order_item for this product with seller_orders.fulfillment_status = 'DELIVERED'.",
                "Insert review and write ReviewChanged event to outbox.",
                "Build ReviewProjector worker consumer updating products.rating_sum, rating_count, and search_documents.rating_avg.",
                "Build Next.js reviews list and submission form on PDP.",
                "Write integration tests in tests/integration/reviews.spec.ts."
            ],
            "data_changes": "Creates reviews table in migration 0021-reviews.sql; updates products and search_documents.",
            "security": "Enforces verified purchaser check; fully refunded purchases cannot review.",
            "error_handling": "Returns 403 Forbidden with code NOT_VERIFIED_PURCHASER if user has not purchased item; 409 Conflict if already reviewed.",
            "edge_cases": [
                "Customer bought product twice (still restricted to exactly 1 review for that product)"
            ],
            "observability": "Tracks review submissions and average rating calculation duration.",
            "unit_tests": [
                "packages/backend/src/engagement/review.service.test.ts (purchaser eligibility, rating boundaries, rating average calculation)"
            ],
            "integration_tests": [
                "tests/integration/reviews.spec.ts (unverified customer denied; verified purchaser submits; assert unique constraint; assert rating projected to search_documents)"
            ],
            "e2e_tests": [
                "tests/e2e/reviews.spec.ts (customer delivers order, leaves 5-star review, verifies review appears on PDP)"
            ],
            "security_tests": [
                "Assert user cannot review a product they never purchased"
            ],
            "manual_verification": "Submit 5-star review as customer1; check product PDP; verify new review displays with 'Verified Purchaser' badge.",
            "risk_level": "MEDIUM",
            "review_requirements": "Single thorough review pass focusing on purchaser eligibility checks and denormalized rating math. Documented in docs/reviews/t064-context.md.",
            "commit": "feat(engagement): implement verified purchaser reviews and asynchronous rating projection"
        },
        {
            "id": "065",
            "name": "Implement Shared Customer Wishlist",
            "status": "PLANNED",
            "goal": "Build customer wishlist endpoints, database schema, and Next.js wishlist dashboard (/account/wishlist) with product availability indicators.",
            "why": "Enables shoppers to save favorite items across marketplace and branded stores for future purchase.",
            "requirements": ["REQ-ENG-001", "design.md"],
            "blocked_by": ["TASK-019", "TASK-009"],
            "blocks": ["TASK-075"],
            "architecture": ["ARCHITECTURE.md -> Frontend", "docs/modules/engagement.md"],
            "skills": [
                {
                    "name": "api-and-interface-design",
                    "location": "skills/agent-skills-main/skills/api-and-interface-design/SKILL.md",
                    "why": "Governs wishlist CRUD contracts and customer scoping.",
                    "instructions": ["Scope wishlists to authenticated user", "Render unavailable badge if product is archived"]
                }
            ],
            "inspect_files": [
                "packages/backend/src/catalog/read.service.ts",
                "apps/web/src/features/catalog/product-detail.tsx",
                "docs/modules/engagement.md"
            ],
            "current_behavior": "Heart icons on product cards and PDP are decorative; no wishlist storage exists.",
            "required_behavior": "Clicking heart toggles wishlist membership; GET /v1/wishlist returns saved items; /account/wishlist displays saved products with quick Add-to-Cart buttons.",
            "contracts": "WishlistDto: { items: Array<{ productId: string, title: string, slug: string, priceCents: string, available: boolean }> }.",
            "commands": [
                "Author migration db/migrations/0022-wishlists.sql creating wishlists table with PK(user_id, product_id).",
                "Implement WishlistService in packages/backend/src/engagement/wishlist.service.ts.",
                "Expose GET /v1/wishlist, PUT /v1/wishlist/:productId, and DELETE /v1/wishlist/:productId.",
                "Build WishlistHeartButton component in apps/web/src/features/wishlist/wishlist-button.tsx.",
                "Build WishlistPage in apps/web/src/app/account/wishlist/page.tsx.",
                "Write component and integration tests."
            ],
            "data_changes": "Creates wishlists table in migration 0022-wishlists.sql.",
            "security": "Enforces user ownership: customer can view/modify only their own wishlist.",
            "error_handling": "Gracefully handles adding a non-existent product ID with 404 Not Found.",
            "edge_cases": [
                "Product on wishlist is archived by vendor (renders item with 'Unavailable' badge without crashing wishlist page)"
            ],
            "observability": "Wishlist addition telemetry.",
            "unit_tests": [
                "apps/web/src/features/wishlist/wishlist-button.test.tsx (active state toggle, optimistic update)"
            ],
            "integration_tests": [
                "tests/integration/wishlist.spec.ts (add product, list wishlist, remove product, verify DB state)"
            ],
            "e2e_tests": [
                "tests/e2e/wishlist.spec.ts (save product to wishlist from PDP, navigate to /account/wishlist, assert item present)"
            ],
            "security_tests": [
                "Assert user cannot read another customer's wishlist"
            ],
            "manual_verification": "Click heart on running shoes; navigate to /account/wishlist; verify shoes are listed with price.",
            "risk_level": "LOW",
            "review_requirements": "Single review pass. Documented in docs/reviews/t065-context.md.",
            "commit": "feat(engagement): implement customer wishlist endpoints and account dashboard"
        },
        {
            "id": "066",
            "name": "Implement Scoped Sales Read Models",
            "status": "PLANNED",
            "goal": "Build PostgreSQL materialized views and query services for daily sales, revenue, top sellers, and store performance summaries.",
            "why": "Provides sub-20ms dashboard query performance without executing heavy analytical aggregations against live OLTP order tables.",
            "requirements": ["AD-2", "REQ-ENG-002", "PRD Section 6.7"],
            "blocked_by": ["TASK-046", "TASK-051", "TASK-060"],
            "blocks": ["TASK-067", "TASK-082"],
            "architecture": ["ARCHITECTURE.md -> Operations", "docs/modules/reporting.md"],
            "skills": [
                {
                    "name": "performance-optimization",
                    "location": "skills/agent-skills-main/skills/performance-optimization/SKILL.md",
                    "why": "Governs materialized view design, unique indexes, and CONCURRENTLY refresh scripts.",
                    "instructions": ["Use REFRESH MATERIALIZED VIEW CONCURRENTLY", "Add unique index on view primary keys"]
                }
            ],
            "inspect_files": [
                "packages/backend/src/commerce/schema.ts",
                "packages/backend/src/payments/schema.ts",
                "docs/modules/reporting.md"
            ],
            "current_behavior": "Not implemented. Analytics and reporting require expensive multi-table joins on orders and seller_orders.",
            "required_behavior": "Materialized views aggregate daily GMV, order volume, and top-selling variants; refreshed periodically via worker job; queried with strict store scoping.",
            "contracts": "StoreAnalyticsSummaryDto, PlatformAnalyticsSummaryDto in @shopscale/contracts.",
            "commands": [
                "Author migration db/migrations/0023-reporting-views.sql creating materialized views mv_daily_sales and mv_store_performance.",
                "Add unique index on mv_daily_sales(day, store_id) enabling concurrent refreshes.",
                "Implement AnalyticsQueryService in packages/backend/src/reporting/analytics.service.ts.",
                "Schedule BullMQ repeatable job 'refresh-materialized-views' in apps/worker running hourly.",
                "Write integration tests in tests/integration/reporting-views.spec.ts."
            ],
            "data_changes": "Creates materialized views mv_daily_sales and mv_store_performance in migration 0023-reporting-views.sql.",
            "security": "Enforces store scoping: seller analytics query strictly filters by WHERE store_id = :sessionStoreId.",
            "error_handling": "Falls back to previous view snapshot if concurrent refresh experiences lock contention.",
            "edge_cases": [
                "Refreshing view with zero orders (handles empty set cleanly)"
            ],
            "observability": "Records materialized view refresh duration in Prometheus.",
            "unit_tests": [
                "packages/backend/src/reporting/analytics.service.test.ts (date range bounding, query filter composition)"
            ],
            "integration_tests": [
                "tests/integration/reporting-views.spec.ts (seed 100 orders; refresh view; query store analytics; assert GMV sums match)"
            ],
            "e2e_tests": ["None."],
            "security_tests": [
                "Assert seller cannot view platform-wide GMV or another store's revenue"
            ],
            "manual_verification": "Execute REFRESH MATERIALIZED VIEW mv_daily_sales in psql; verify query SELECT * FROM mv_daily_sales returns formatted daily revenue.",
            "risk_level": "LOW",
            "review_requirements": "Single review pass focusing on unique index creation and concurrent refresh safety. Documented in docs/reviews/t066-context.md.",
            "commit": "feat(reporting): implement materialized sales views and analytics query service"
        },
        {
            "id": "067",
            "name": "Build Seller and Platform Dashboards",
            "status": "PLANNED",
            "goal": "Build Next.js analytics dashboard pages for sellers (/seller/dashboard) and platform administrators (/admin/dashboard) displaying GMV, orders, and top products.",
            "why": "Provides merchants and platform operators with visual business intelligence and operational oversight.",
            "requirements": ["AD-2", "REQ-ENG-002", "design.md"],
            "blocked_by": ["TASK-062", "TASK-066"],
            "blocks": ["TASK-075"],
            "architecture": ["ARCHITECTURE.md -> Frontend", "docs/architecture/frontend.md"],
            "skills": [
                {
                    "name": "frontend-ui-engineering",
                    "location": "skills/agent-skills-main/skills/frontend-ui-engineering/SKILL.md",
                    "why": "Governs dashboard stat cards, responsive charts, and date range filters.",
                    "instructions": ["Use accessible SVG/CSS charts", "Format currency in USD with commas"]
                }
            ],
            "inspect_files": [
                "apps/web/src/app/seller/products/page.tsx",
                "packages/backend/src/reporting/analytics.service.ts",
                "apps/web/src/components/ui/card.tsx"
            ],
            "current_behavior": "No analytics dashboards exist; sellers and admins have only raw entity list views.",
            "required_behavior": "Seller dashboard renders Gross Revenue, Orders Count, Average Order Value, and Top Selling Products; Admin dashboard renders Platform GMV and Merchant leaderboard.",
            "contracts": "DashboardStatsProps and RevenueChartProps in apps/web/src/features/dashboard/.",
            "commands": [
                "Build seller dashboard in apps/web/src/app/seller/dashboard/page.tsx.",
                "Build admin dashboard in apps/web/src/app/admin/dashboard/page.tsx.",
                "Build StatCard component displaying value, trend indicator, and comparison period.",
                "Build RevenueBarChart component rendering monthly and weekly sales data.",
                "Write component tests and data formatting tests."
            ],
            "data_changes": "None.",
            "security": "Enforces strict RBAC: non-admin cannot access /admin/dashboard; seller sees only their store stats.",
            "error_handling": "Displays zero-state placeholders with guidance when no sales data exists for selected period.",
            "edge_cases": [
                "Selecting date range with zero sales (renders flat zero baseline without breaking chart geometry)"
            ],
            "observability": "Dashboard load latency tracking.",
            "unit_tests": [
                "apps/web/src/features/dashboard/stat-card.test.tsx (currency formatting, percentage trend badges)"
            ],
            "integration_tests": [
                "apps/web/src/features/dashboard/dashboard-loader.test.ts (fetch analytics data, render cards)"
            ],
            "e2e_tests": [
                "tests/e2e/seller-dashboard.spec.ts (log in as seller, navigate to dashboard, verify GMV card renders)"
            ],
            "security_tests": [
                "Assert customer account attempting to access /admin/dashboard receives redirect to login or 403"
            ],
            "manual_verification": "Visit /seller/dashboard; verify Gross Revenue card displays formatted revenue matching seeded orders.",
            "risk_level": "LOW",
            "review_requirements": "Single review pass focusing on responsive layout and number formatting. Documented in docs/reviews/t067-context.md.",
            "commit": "feat(web): build seller analytics dashboard and platform admin gmv overview"
        },
        {
            "id": "068",
            "name": "Build Team, Theme and Store-Content Settings",
            "status": "PLANNED",
            "goal": "Build Next.js seller settings console (/seller/settings) managing staff invitations, role permissions, token theme colors, and homepage banner content.",
            "why": "Enables store owners to manage staff access, customize storefront appearance, and configure featured products.",
            "requirements": ["REQ-STORE-003", "ID-5", "PRD Section 5.1"],
            "blocked_by": ["TASK-015", "TASK-016", "TASK-027"],
            "blocks": ["TASK-075"],
            "architecture": ["ARCHITECTURE.md -> Frontend", "docs/modules/stores.md"],
            "skills": [
                {
                    "name": "frontend-ui-engineering",
                    "location": "skills/agent-skills-main/skills/frontend-ui-engineering/SKILL.md",
                    "why": "Governs settings tab layout, color picker inputs, and staff management tables.",
                    "instructions": ["Validate hex colors strictly", "Provide immediate theme preview"]
                }
            ],
            "inspect_files": [
                "apps/web/src/components/theme.ts",
                "packages/backend/src/stores/theme.service.ts",
                "apps/web/src/features/seller/actions.ts"
            ],
            "current_behavior": "Store themes and staff memberships are set via seed scripts; no seller UI exists to adjust settings.",
            "required_behavior": "Store owner can invite staff with roles (manager, editor, fulfillment), edit theme colors with live preview, and update homepage banner text.",
            "contracts": "UpdateStoreThemeDto, InviteStaffDto in @shopscale/contracts.",
            "commands": [
                "Build settings workspace in apps/web/src/app/seller/settings/page.tsx with tabs for General, Team, and Theme.",
                "Build TeamManagementTab with staff list, role badges, and Invite Member modal.",
                "Build ThemeCustomizerTab with primary/secondary color pickers and live storefront preview.",
                "Implement Server Actions for saving theme and dispatching invitations.",
                "Write component tests and form validation tests."
            ],
            "data_changes": "Updates store_themes and store_content; inserts store_invitations.",
            "security": "Enforces store ownership: only store owner or manager can access settings.",
            "error_handling": "Displays inline error if invitation email is already a member.",
            "edge_cases": [
                "Store owner attempting to remove themselves from store ownership (blocked with 400 CANNOT_REMOVE_OWNER)"
            ],
            "observability": "Audit log for theme edits and staff invitations.",
            "unit_tests": [
                "apps/web/src/features/seller/theme-customizer.test.tsx (color validation, preview updates)"
            ],
            "integration_tests": [
                "apps/web/src/features/seller/settings-actions.test.ts (update theme, verify DB persistence)"
            ],
            "e2e_tests": [
                "tests/e2e/seller-settings.spec.ts (update primary theme color, navigate to store homepage, assert CSS variable updated)"
            ],
            "security_tests": [
                "Assert catalog-editor cannot access /seller/settings"
            ],
            "manual_verification": "Change primary color to #0070f3 in /seller/settings; visit /stores/apex-athletics; verify buttons update to blue.",
            "risk_level": "LOW",
            "review_requirements": "Single review pass focusing on color sanitization and staff permission checks. Documented in docs/reviews/t068-context.md.",
            "commit": "feat(web): build seller store settings team management and theme customizer"
        },
        {
            "id": "069",
            "name": "Build Support and Admin Policy Workflows",
            "status": "PLANNED",
            "goal": "Build Next.js platform admin console (/admin) for seller application approvals, category hierarchy management, and support discretionary refunds capped at $200.",
            "why": "Enables platform operators and support staff to execute privileged governance and customer dispute resolutions.",
            "requirements": ["ID-5", "PRD Section 5.1", "PRD Section 6.7"],
            "blocked_by": ["TASK-015", "TASK-058", "TASK-060", "TASK-062"],
            "blocks": ["TASK-074"],
            "architecture": ["ARCHITECTURE.md -> Module boundaries", "docs/modules/reporting.md"],
            "skills": [
                {
                    "name": "security-and-hardening",
                    "location": "skills/agent-skills-main/skills/security-and-hardening/SKILL.md",
                    "why": "Enforces support refund caps and administrative RBAC boundaries.",
                    "instructions": ["Cap support refunds at policy limit ($200)", "Require admin role for seller approval"]
                },
                {
                    "name": "frontend-ui-engineering",
                    "location": "skills/agent-skills-main/skills/frontend-ui-engineering/SKILL.md",
                    "why": "Governs administrative action approval dialogs and category tree management.",
                    "instructions": ["Provide confirmation modal for seller approvals and refunds", "Show audit trail inline"]
                }
            ],
            "inspect_files": [
                "packages/backend/src/stores/store.service.ts",
                "packages/backend/src/payments/refund.service.ts",
                "apps/web/src/app/account/page.tsx"
            ],
            "current_behavior": "Admin approval and support refunds exist as backend services without administrative web interfaces.",
            "required_behavior": "Platform admin can approve/suspend sellers, manage categories; support agents can inspect customer orders and issue refunds up to $200 with audited reasons.",
            "contracts": "AdminSellerApprovalDto, SupportRefundDto.",
            "commands": [
                "Build admin seller management page in apps/web/src/app/admin/sellers/page.tsx with Approve and Suspend action buttons.",
                "Build category tree manager in apps/web/src/app/admin/categories/page.tsx allowing parent/child category creation.",
                "Build support refund modal in apps/web/src/features/support/refund-modal.tsx enforcing $200 max amount.",
                "Implement Server Actions forwarding administrative mutations to backend API.",
                "Write component and permission tests."
            ],
            "data_changes": "Updates stores.status, categories; inserts refunds and audit_logs.",
            "security": "Enforces policy_settings cap: support agent cannot issue refund > 20,000 cents ($200); admin has unlimited refund authority.",
            "error_handling": "Returns 403 Forbidden with POLICY_LIMIT_EXCEEDED if support agent attempts refund > $200.",
            "edge_cases": [
                "Support agent attempts to issue multiple refunds totaling $250 on same order (enforces cumulative $200 cap per support agent)"
            ],
            "observability": "Comprehensive audit log for every administrative approval, category edit, and support refund.",
            "unit_tests": [
                "apps/web/src/features/support/refund-modal.test.tsx (cap validation, reason requirement)"
            ],
            "integration_tests": [
                "tests/integration/admin-workflows.spec.ts (approve seller; verify status transitions; test support refund cap enforcement)"
            ],
            "e2e_tests": [
                "tests/e2e/admin-approval.spec.ts (submit seller application, log in as admin, approve application, verify store active)"
            ],
            "security_tests": [
                "Assert support agent cannot approve seller applications",
                "Assert support refund of $200.01 fails with 403"
            ],
            "manual_verification": "Log in as support@shopscale.dev; issue $50 refund on test order; verify refund succeeds and audit log entry created.",
            "risk_level": "HIGH",
            "review_requirements": "Multiple review passes on administrative permission checks and support policy caps. Documented in docs/reviews/t069-context.md.",
            "commit": "feat(admin): build platform admin seller approval console and support refund workflows"
        },
        {
            "id": "070",
            "name": "Implement Simulated Seller Settlement",
            "status": "PLANNED",
            "goal": "Build periodic settlement accounting service calculating marketplace commission deductions, net seller payouts, and recording settlement ledger entries.",
            "why": "Demonstrates multi-vendor payout accounting, commission splits, and net liability reconciliation without executing actual bank wire transfers.",
            "requirements": ["OR-6", "OR-8", "REQ-COMM-004", "PRD Section 1.3"],
            "blocked_by": ["TASK-060", "TASK-056"],
            "blocks": ["TASK-084"],
            "architecture": ["ARCHITECTURE.md -> Data Model", "DECISIONS.md -> DEC-012", "docs/modules/payments.md"],
            "skills": [
                {
                    "name": "test-driven-development",
                    "location": "skills/agent-skills-main/skills/test-driven-development/SKILL.md",
                    "why": "Enforces testing settlement accounting and commission deduction math with failing tests first.",
                    "instructions": ["Test commission deduction (e.g. 10% commission on $100 = $10 platform, $90 seller)", "Assert balanced financial ledger"]
                }
            ],
            "inspect_files": [
                "packages/backend/src/payments/financial-ledger.service.ts",
                "packages/backend/src/stores/schema.ts",
                "docs/modules/payments.md"
            ],
            "current_behavior": "Not implemented. Seller earnings and platform commissions are not calculated or settled into payout ledgers.",
            "required_behavior": "SettlementService calculates net earnings for delivered orders over a period: Net = Subtotal - Refunds - (Subtotal * CommissionRate); writes seller_payouts record and balanced financial_entries.",
            "contracts": "seller_payouts: (id PK, store_id FK, period_start timestamptz, period_end timestamptz, amount_cents bigint, commission_cents bigint, status text, effect_key text UNIQUE).",
            "commands": [
                "Author migration db/migrations/0024-seller-settlements.sql creating seller_payouts table.",
                "Implement SettlementService in packages/backend/src/payments/settlement.service.ts.",
                "Calculate delivered suborders minus refund adjustments for each store.",
                "Compute platform commission using businesses.commission_bps (default 1000 = 10.00%).",
                "Insert balanced financial_entries: debit seller_payable, credit platform_commission and payment_gateway_clearing.",
                "Schedule periodic settlement CLI or BullMQ worker job.",
                "Write integration tests in tests/integration/settlements.spec.ts."
            ],
            "data_changes": "Creates seller_payouts table in migration 0024-seller-settlements.sql; inserts financial_entries.",
            "security": "Settlement runs with system authority; payout records are immutable; effect keys prevent duplicate payout generation.",
            "error_handling": "Prevents negative payouts if refunds exceed subtotal for a settlement period; carries forward negative balance.",
            "edge_cases": [
                "Store with 10 delivered orders and 1 fully refunded order (deducts refund before computing commission)"
            ],
            "observability": "Logs total settled volume and platform commission earned.",
            "unit_tests": [
                "packages/backend/src/payments/settlement.service.test.ts (commission bps calculation, net payout arithmetic)"
            ],
            "integration_tests": [
                "tests/integration/settlements.spec.ts (seed delivered orders; run settlement; assert seller_payouts and balanced financial_entries created)"
            ],
            "e2e_tests": ["None."],
            "security_tests": ["None."],
            "manual_verification": "Trigger settlement via CLI; query seller_payouts in psql; verify net amount equals 90% of delivered subtotal minus refunds.",
            "risk_level": "MEDIUM",
            "review_requirements": "Single thorough review pass focusing on commission arithmetic and refund carry-forward logic. Documented in docs/reviews/t070-context.md.",
            "commit": "feat(payments): implement simulated seller payout settlement and commission accounting"
        }
    ]
