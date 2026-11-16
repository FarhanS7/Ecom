def get_tasks():
    return [
        {
            "id": "019",
            "name": "Model Products and Variants",
            "status": "IMPLEMENTED",
            "goal": "Author Drizzle schema and migrations for categories, products, product_variants, and product_publications.",
            "why": "Provides relational foundation for catalog management, multi-variant products, and channel publication flags.",
            "requirements": ["CT-1", "PRD Section 8"],
            "blocked_by": ["TASK-003", "TASK-014"],
            "blocks": ["TASK-020", "TASK-021", "TASK-022", "TASK-028", "TASK-037"],
            "architecture": ["ARCHITECTURE.md -> Catalog", "DECISIONS.md -> DEC-010"],
            "skills": [
                {
                    "name": "domain-modeling",
                    "location": "skills/skills-main/skills/engineering/domain-modeling/SKILL.md",
                    "why": "Governs designing product variants and composite store keys.",
                    "instructions": ["Use composite FK (store_id, product_id)", "Store prices as integer cents"]
                }
            ],
            "inspect_files": ["packages/backend/src/catalog/schema.ts", "db/migrations/0006-catalog.sql"],
            "current_behavior": "Completed. 0006-catalog.sql applied; products, variants, categories, and publication tables active.",
            "required_behavior": "Enforces UNIQUE(store_id, slug), UNIQUE(store_id, sku), and min_price_cents derivation.",
            "contracts": "Products, ProductVariants, Categories Drizzle schemas in @shopscale/backend.",
            "commands": [
                "Define catalog domain schema in packages/backend/src/catalog/schema.ts.",
                "Author migration 0006-catalog.sql with composite keys and indexes.",
                "Add category tree cycle prevention and path validation."
            ],
            "data_changes": "Creates categories, products, product_variants, product_publications.",
            "security": "Enforces store ownership: variants cannot reference products belonging to another store.",
            "error_handling": "Unique constraint violations on SKU or slug throw typed DuplicateSlugError / DuplicateSkuError.",
            "edge_cases": ["Product with zero active variants", "Category parent self-reference cycle"],
            "observability": "Migration log confirmation.",
            "unit_tests": ["packages/backend/src/catalog/schema.test.ts"],
            "integration_tests": ["Catalog schema constraint tests against live PostgreSQL"],
            "e2e_tests": ["None."],
            "security_tests": ["Verify cross-store product-variant association is rejected by foreign key"],
            "manual_verification": "Inspect PostgreSQL tables: \\d products; verify foreign keys and constraints.",
            "risk_level": "MEDIUM",
            "review_requirements": "Single thorough review pass. Documented in docs/reviews/t019-context.md.",
            "commit": "feat(catalog): model categories products variants and publications"
        },
        {
            "id": "020",
            "name": "Implement Seller Catalog Mutations",
            "status": "IMPLEMENTED",
            "goal": "Build seller catalog service and endpoints for creating, editing, and publishing products with optimistic concurrency.",
            "why": "Enables vendors to manage their catalog items safely without race conditions.",
            "requirements": ["CT-1", "G4", "PRD Section 5.1"],
            "blocked_by": ["TASK-006", "TASK-018", "TASK-019"],
            "blocks": ["TASK-027", "TASK-028", "TASK-029"],
            "architecture": ["ARCHITECTURE.md -> Catalog", "DECISIONS.md -> DEC-010"],
            "skills": [
                {
                    "name": "api-and-interface-design",
                    "location": "skills/agent-skills-main/skills/api-and-interface-design/SKILL.md",
                    "why": "Governs versioned mutation contracts and optimistic locking.",
                    "instructions": ["Require version field on updates", "Enforce uniform 404 on out-of-scope store ID"]
                }
            ],
            "inspect_files": ["packages/backend/src/catalog/seller-catalog.service.ts", "packages/backend/src/catalog/seller-catalog.controller.ts"],
            "current_behavior": "Completed. Scoped POST, PATCH, and publication endpoints fully functional; returns uniform 404 on tenant mismatch.",
            "required_behavior": "Sellers can mutate only their own products; stale version updates return 409 Conflict.",
            "contracts": "CreateProductDto, UpdateProductDto, ProductResponseDto in @shopscale/contracts.",
            "commands": [
                "Build SellerCatalogService with scoped store verification.",
                "Implement versioned optimistic concurrency checks on product update.",
                "Implement ADR-0010: lifecycle transitions (draft -> active) validating active variant existence."
            ],
            "data_changes": "Inserts and updates products, product_variants, product_publications.",
            "security": "Enforces Uniform 404 Rule: modifying a product from another store returns 404 Not Found.",
            "error_handling": "Returns 409 Conflict on version mismatch; 404 on store mismatch.",
            "edge_cases": ["Activating product with 0 variants (rejected by ADR-0010 rule)"],
            "observability": "Audit log for product publication and archival.",
            "unit_tests": ["packages/backend/src/catalog/seller-catalog.service.test.ts"],
            "integration_tests": ["Seller catalog mutation and concurrency tests"],
            "e2e_tests": ["tests/e2e/seller-catalog.spec.ts"],
            "security_tests": ["Assert seller cannot modify product belonging to another store"],
            "manual_verification": "Create and update product via curl with seller session; verify version increments.",
            "risk_level": "MEDIUM",
            "review_requirements": "Thorough review of optimistic locking and ADR-0010 activation rules. Recorded in docs/reviews/t020-context.md.",
            "commit": "feat(catalog): implement seller catalog mutations with optimistic locking"
        },
        {
            "id": "021",
            "name": "Implement Channel-Aware Catalog Reads",
            "status": "IMPLEMENTED",
            "goal": "Build public catalog read endpoints filtering products by channel publication flags and active status.",
            "why": "Ensures shoppers view only active, published products appropriate to their browsing channel.",
            "requirements": ["CT-2", "REQ-STORE-001", "PRD Section 6.2"],
            "blocked_by": ["TASK-019", "TASK-016"],
            "blocks": ["TASK-024", "TASK-025", "TASK-026"],
            "architecture": ["ARCHITECTURE.md -> Catalog", "DECISIONS.md -> DEC-003"],
            "skills": [
                {
                    "name": "api-and-interface-design",
                    "location": "skills/agent-skills-main/skills/api-and-interface-design/SKILL.md",
                    "why": "Governs public read contracts and channel scoping.",
                    "instructions": ["Filter by products.status = 'active'", "Respect channel publication flags"]
                }
            ],
            "inspect_files": ["packages/backend/src/catalog/read.service.ts", "packages/backend/src/catalog/catalog.controller.ts"],
            "current_behavior": "Completed. GET /v1/products and GET /v1/stores/{slug}/products filter by channel visibility.",
            "required_behavior": "Marketplace reads require marketplace_enabled=true; store reads require store_enabled=true and active status.",
            "contracts": "PublicProductDto, CatalogListResponseDto.",
            "commands": [
                "Build CatalogReadService enforcing VISIBILITY_WHERE clause.",
                "Expose marketplace listing and store-scoped catalog routes.",
                "Ensure min_price_cents is serialized as decimal string."
            ],
            "data_changes": "None.",
            "security": "Draft, archived, or unpublished products are completely hidden from public queries.",
            "error_handling": "Returns 404 Not Found if store slug or product slug does not exist.",
            "edge_cases": ["Store suspended by admin (must hide all store products immediately)"],
            "observability": "Structured read latency logs.",
            "unit_tests": ["packages/backend/src/catalog/read.service.test.ts"],
            "integration_tests": ["Channel-filtered catalog read integration tests"],
            "e2e_tests": ["tests/e2e/product-list.spec.ts"],
            "security_tests": ["Assert draft product is never returned in public catalog query"],
            "manual_verification": "Fetch /v1/products; verify only active products with marketplace_enabled=true appear.",
            "risk_level": "LOW",
            "review_requirements": "Single review pass. Documented in docs/reviews/t021-context.md.",
            "commit": "feat(catalog): implement channel-aware public catalog read endpoints"
        },
        {
            "id": "022",
            "name": "Add Stable Keyset Pagination",
            "status": "IMPLEMENTED",
            "goal": "Build keyset (cursor-based) pagination on (created_at DESC, id DESC) and price/sort tuples.",
            "why": "Eliminates deep pagination performance cliffs and guarantees sub-150ms list queries on 100k products.",
            "requirements": ["CT-2", "G1", "NFR-001", "NFR-002"],
            "blocked_by": ["TASK-019"],
            "blocks": ["TASK-025", "TASK-078"],
            "architecture": ["ARCHITECTURE.md -> API Structure", "DECISIONS.md -> DEC-002"],
            "skills": [
                {
                    "name": "performance-optimization",
                    "location": "skills/agent-skills-main/skills/performance-optimization/SKILL.md",
                    "why": "Governs keyset pagination encoding and index alignment.",
                    "instructions": ["Ban OFFSET/LIMIT pagination", "Tie-break every sort with unique id"]
                }
            ],
            "inspect_files": ["packages/backend/src/catalog/cursor.ts", "packages/backend/src/catalog/cursor.test.ts"],
            "current_behavior": "Completed. Opaque base64 cursor encodes sort tuple, filter hash, and schema version; unit tests passing.",
            "required_behavior": "Querying with nextCursor returns the next page of items without shifting or duplicates.",
            "contracts": "CursorPayload schema and encodeCursor/decodeCursor utilities.",
            "commands": [
                "Implement base64url cursor encoder/decoder with checksum.",
                "Build SQL tuple comparisons: (created_at, id) < (:cursor_created_at, :cursor_id).",
                "Add tamper detection rejecting modified or mismatched cursors with 400 INVALID_CURSOR."
            ],
            "data_changes": "Verifies composite indexes on (category_id, created_at DESC, id DESC).",
            "security": "Validates cursor integrity; rejects arbitrary SQL injection through cursor strings.",
            "error_handling": "Returns 400 Bad Request with code INVALID_CURSOR on tampered tokens.",
            "edge_cases": ["Identical created_at timestamps (tie-broken by UUID id)"],
            "observability": "Logs pagination depth and cursor decode failures.",
            "unit_tests": ["packages/backend/src/catalog/cursor.test.ts"],
            "integration_tests": ["Deep keyset pagination test against 1,000 seeded products"],
            "e2e_tests": ["tests/e2e/product-list.spec.ts"],
            "security_tests": ["Assert tampered base64 cursor returns 400 instead of crashing"],
            "manual_verification": "Fetch page 1, extract nextCursor, fetch page 2; verify zero overlapping product IDs.",
            "risk_level": "MEDIUM",
            "review_requirements": "Single thorough review pass. Documented in docs/reviews/t022-context.md.",
            "commit": "feat(catalog): implement stable keyset cursor pagination"
        },
        {
            "id": "023",
            "name": "Build the Token-Based Component Foundation",
            "status": "IMPLEMENTED",
            "goal": "Build accessible UI primitive components (Button, Input, Badge, Card, Modal, Dropdown) styled with CSS tokens.",
            "why": "Provides reusable, accessible design token components for storefront and console pages.",
            "requirements": ["design.md", "PRD Section 3"],
            "blocked_by": ["TASK-007", "TASK-016"],
            "blocks": ["TASK-024", "TASK-025", "TASK-026", "TASK-027"],
            "architecture": ["ARCHITECTURE.md -> Frontend", "docs/architecture/frontend.md"],
            "skills": [
                {
                    "name": "design-system-compliance",
                    "location": "skills/reticle-main/skills/design-system-compliance/SKILL.md",
                    "why": "Ensures components strictly adhere to design.md tokens and WCAG 2.1 AA.",
                    "instructions": ["Use CSS variables for colors and spacing", "Ensure visible keyboard focus states"]
                }
            ],
            "inspect_files": ["apps/web/src/components/ui/button.tsx", "apps/web/src/components/ui/input.tsx", "apps/web/src/components/ui.test.tsx"],
            "current_behavior": "Completed. Accessible component primitives fully tested with 16 unit tests passing.",
            "required_behavior": "Components support disabled states, loading spinners, ARIA attributes, and token colors.",
            "contracts": "UI Component Props interfaces in apps/web/src/components/ui/.",
            "commands": [
                "Build Button, Input, Select, Badge, Card, and Modal components.",
                "Apply CSS module styles consuming design tokens.",
                "Add keyboard navigation and ARIA accessibility roles."
            ],
            "data_changes": "None.",
            "security": "Sanitizes input attributes; prevents DOM XSS.",
            "error_handling": "Gracefully handles missing optional props.",
            "edge_cases": ["Button double-click handling in loading state"],
            "observability": "None.",
            "unit_tests": ["apps/web/src/components/ui.test.tsx"],
            "integration_tests": ["Component rendering tests in jsdom"],
            "e2e_tests": ["tests/e2e/design-system.spec.ts"],
            "security_tests": ["Assert XSS payload in input label is safely escaped"],
            "manual_verification": "Inspect components in browser; verify clean focus rings on keyboard tab navigation.",
            "risk_level": "LOW",
            "review_requirements": "Single review pass. Documented in docs/reviews/t023-context.md.",
            "commit": "feat(web): build token-based accessible ui component library"
        },
        {
            "id": "024",
            "name": "Build Connected Storefront Home Pages",
            "status": "IMPLEMENTED",
            "goal": "Build Server-Rendered homepages for marketplace (/) and branded vendor stores (/stores/[slug]).",
            "why": "Provides primary landing pages displaying featured categories, hero banner, and new arrivals.",
            "requirements": ["REQ-STORE-001", "PRD Section 4", "design.md"],
            "blocked_by": ["TASK-016", "TASK-021", "TASK-023"],
            "blocks": ["TASK-025", "TASK-026"],
            "architecture": ["ARCHITECTURE.md -> Frontend", "docs/architecture/frontend.md"],
            "skills": [
                {
                    "name": "frontend-ui-engineering",
                    "location": "skills/agent-skills-main/skills/frontend-ui-engineering/SKILL.md",
                    "why": "Governs Next.js SSR data fetching and error boundaries.",
                    "instructions": ["Render product grids as Server Components", "Handle missing store content gracefully"]
                }
            ],
            "inspect_files": ["apps/web/src/app/page.tsx", "apps/web/src/app/stores/[slug]/page.tsx", "apps/web/src/features/storefront/home.test.tsx"],
            "current_behavior": "Completed. Server-rendered homepages with store themes, hero banners, and category tiles operational.",
            "required_behavior": "Marketplace renders global products; store route renders vendor-specific products and branding.",
            "contracts": "HomePageProps, StorePageProps.",
            "commands": [
                "Implement marketplace home page in apps/web/src/app/page.tsx.",
                "Implement store home page in apps/web/src/app/stores/[slug]/page.tsx.",
                "Connect server fetchers to /v1/products and /v1/stores/{slug}."
            ],
            "data_changes": "None.",
            "security": "Public pages are read-only; no customer PII rendered.",
            "error_handling": "Returns 404 on unknown store slug; shows graceful empty state if store has no products.",
            "edge_cases": ["Store has zero active products (shows 'Catalog coming soon')"],
            "observability": "Next.js SSR render metrics.",
            "unit_tests": ["apps/web/src/features/storefront/home.test.tsx"],
            "integration_tests": ["Storefront data loading tests"],
            "e2e_tests": ["tests/e2e/storefront-home.spec.ts"],
            "security_tests": ["Verify suspended store returns 404"],
            "manual_verification": "Visit / and /stores/apex-athletics; verify distinct titles and product collections.",
            "risk_level": "LOW",
            "review_requirements": "Single review pass. Documented in docs/reviews/t024-context.md.",
            "commit": "feat(web): build server-rendered marketplace and store homepages"
        },
        {
            "id": "025",
            "name": "Build Product Listing and Filters",
            "status": "IMPLEMENTED",
            "goal": "Build Product Listing Page (/products) with category navigation, sort controls, and URL-driven filter panel.",
            "why": "Enables shoppers to discover, filter, and paginate through catalog items.",
            "requirements": ["CT-2", "PRD Section 6.2"],
            "blocked_by": ["TASK-021", "TASK-022", "TASK-023", "TASK-024"],
            "blocks": ["TASK-032", "TASK-043"],
            "architecture": ["ARCHITECTURE.md -> Frontend", "docs/architecture/frontend.md"],
            "skills": [
                {
                    "name": "frontend-ui-engineering",
                    "location": "skills/agent-skills-main/skills/frontend-ui-engineering/SKILL.md",
                    "why": "Governs URL query state synchronization and client component islands.",
                    "instructions": ["Keep URL as single source of truth for filters", "Debounce filter changes"]
                }
            ],
            "inspect_files": ["apps/web/src/app/products/page.tsx", "apps/web/src/features/catalog/product-list.tsx", "apps/web/src/features/catalog/query-state.ts"],
            "current_behavior": "Completed. URL-driven filter panel, sort dropdown, and keyset cursor pagination functional.",
            "required_behavior": "Filters synchronize with URL search params; back/forward navigation preserves active filters.",
            "contracts": "CatalogQueryParams schema and ProductListProps.",
            "commands": [
                "Implement query-state manager parsing and updating URL search params.",
                "Build FilterPanel client island with category tree and price slider.",
                "Build ProductGrid component rendering responsive product cards."
            ],
            "data_changes": "None.",
            "security": "Sanitizes URL query parameters; prevents script injection via search queries.",
            "error_handling": "Displays empty search results banner with clear-filters button when no items match.",
            "edge_cases": ["Min price greater than max price (automatically swaps or clamps values)"],
            "observability": "Filter interaction analytics events.",
            "unit_tests": ["apps/web/src/features/catalog/query-state.test.ts", "apps/web/src/features/catalog/product-list.test.tsx"],
            "integration_tests": ["Filter and sort parameter composition test"],
            "e2e_tests": ["tests/e2e/product-list.spec.ts"],
            "security_tests": ["Assert malicious query params do not cause SSR crash or XSS"],
            "manual_verification": "Filter by price and category; reload page; verify active filters remain intact.",
            "risk_level": "LOW",
            "review_requirements": "Single review pass. Documented in docs/reviews/t025-context.md.",
            "commit": "feat(web): build product listing page with url-driven filter panel"
        },
        {
            "id": "026",
            "name": "Build Product Detail and Variant Selection",
            "status": "IMPLEMENTED",
            "goal": "Build Product Detail Page (/products/[slug]) with variant selection, price updates, and SSR metadata.",
            "why": "Enables customers to inspect product details, select variants (size/color), and inspect stock availability.",
            "requirements": ["CT-1", "CT-5", "PRD Section 6.2"],
            "blocked_by": ["TASK-021", "TASK-023", "TASK-024"],
            "blocks": ["TASK-033", "TASK-043"],
            "architecture": ["ARCHITECTURE.md -> Frontend", "docs/architecture/frontend.md"],
            "skills": [
                {
                    "name": "frontend-ui-engineering",
                    "location": "skills/agent-skills-main/skills/frontend-ui-engineering/SKILL.md",
                    "why": "Governs SSR product detail rendering and interactive variant selection.",
                    "instructions": ["Render product details via Server Components", "Store variant selection in ?variant= URL param"]
                }
            ],
            "inspect_files": ["apps/web/src/app/products/[slug]/page.tsx", "apps/web/src/features/catalog/product-detail.tsx", "apps/web/src/features/catalog/variants.ts"],
            "current_behavior": "Completed. SSR product detail page with variant selector and active variant price updates functional.",
            "required_behavior": "Selecting variant updates displayed price, SKU, and Add to Cart availability.",
            "contracts": "ProductDetailDto with variants array in @shopscale/contracts.",
            "commands": [
                "Build Server Component loading product detail by slug.",
                "Build VariantSelector client island synchronizing with ?variant= query param.",
                "Add stock availability badges (In Stock, Low Stock, Sold Out)."
            ],
            "data_changes": "None.",
            "security": "Enforces store scoping on branded PDP routes (/stores/{slug}/products/{productSlug}).",
            "error_handling": "Returns 404 on non-existent product slug or unpublished item.",
            "edge_cases": ["Product has only 1 variant (automatically pre-selects variant)"],
            "observability": "PDP view duration and bounce tracking.",
            "unit_tests": ["apps/web/src/features/catalog/variants.test.ts", "apps/web/src/features/catalog/product-detail.test.tsx"],
            "integration_tests": ["Product detail data loader test"],
            "e2e_tests": ["tests/e2e/product-detail.spec.ts"],
            "security_tests": ["Assert draft product returns 404 to public shoppers"],
            "manual_verification": "Visit /products/running-shoes; switch between size 10 and 11; verify price updates.",
            "risk_level": "LOW",
            "review_requirements": "Single review pass. Documented in docs/reviews/t026-context.md.",
            "commit": "feat(web): build product detail page with variant selection and stock badges"
        },
        {
            "id": "027",
            "name": "Build Seller Catalog Editing Screens",
            "status": "IMPLEMENTED",
            "goal": "Build Next.js seller console for creating products, editing variants, and managing channel publication.",
            "why": "Provides merchants with intuitive management interface enforcing ADR-0010 validation rules.",
            "requirements": ["CT-1", "G4", "PRD Section 5.1"],
            "blocked_by": ["TASK-020", "TASK-023"],
            "blocks": ["TASK-028", "TASK-036", "TASK-040"],
            "architecture": ["ARCHITECTURE.md -> Frontend", "DECISIONS.md -> DEC-010"],
            "skills": [
                {
                    "name": "frontend-ui-engineering",
                    "location": "skills/agent-skills-main/skills/frontend-ui-engineering/SKILL.md",
                    "why": "Governs Next.js Server Actions and complex form workspaces.",
                    "instructions": ["Validate via Server Actions using shared contracts", "Handle 409 version conflicts gracefully"]
                }
            ],
            "inspect_files": ["apps/web/src/app/seller/products/page.tsx", "apps/web/src/features/seller/product-workspace.tsx", "apps/web/src/features/seller/actions.ts"],
            "current_behavior": "Completed. Seller product editor supports variant table, draft-active toggle, and server action validation.",
            "required_behavior": "Sellers can author products and variants; server actions validate against Zod schemas; 409 triggers reload option.",
            "contracts": "Seller product workspace props and Server Action schemas.",
            "commands": [
                "Build Seller ProductWorkspace component with tabs for Details, Variants, and Publication.",
                "Implement Next.js Server Actions validating payloads before forwarding to API.",
                "Build optimistic concurrency conflict handler offering 'reload latest' prompt."
            ],
            "data_changes": "None.",
            "security": "Seller write routes stay off public gateway allowlist; called server-to-server.",
            "error_handling": "Displays inline field errors returned by Server Actions.",
            "edge_cases": ["Concurrent edits by two managers in the same store (handled via 409 flow)"],
            "observability": "Seller product mutation audit log.",
            "unit_tests": ["apps/web/src/features/seller/actions.test.ts", "apps/web/src/features/seller/validation.test.ts"],
            "integration_tests": ["Seller workspace server action integration test"],
            "e2e_tests": ["tests/e2e/seller-catalog.spec.ts"],
            "security_tests": ["Assert non-seller cannot access /seller routes"],
            "manual_verification": "Create product in /seller/products; add variant; toggle active; verify product publishes.",
            "risk_level": "MEDIUM",
            "review_requirements": "Thorough review of ADR-0010 validation boundary. Documented in docs/reviews/t027-context.md.",
            "commit": "feat(web): build seller catalog editing screens with variant management"
        },
        {
            "id": "028",
            "name": "Seed a Deterministic Catalog Skeleton",
            "status": "IMPLEMENTED",
            "goal": "Build deterministic seed script populating Tier S and Tier M catalog fixtures with realistic distributions.",
            "why": "Provides repeatable, referentially valid data for automated integration tests and local demos.",
            "requirements": ["PRD Section 11", "ARCH-003"],
            "blocked_by": ["TASK-019", "TASK-020", "TASK-027"],
            "blocks": ["TASK-029", "TASK-030", "TASK-077"],
            "architecture": ["ARCHITECTURE.md -> Database", "DECISIONS.md -> DEC-009"],
            "skills": [
                {
                    "name": "test-driven-development",
                    "location": "skills/agent-skills-main/skills/test-driven-development/SKILL.md",
                    "why": "Ensures seed generator is deterministic and referentially valid.",
                    "instructions": ["Use seeded PRNG (seed=42)", "Validate FK integrity on exit"]
                }
            ],
            "inspect_files": ["packages/backend/src/db/seed.ts", "packages/backend/src/db/seed/catalog.ts", "packages/backend/src/db/seed/verify.ts"],
            "current_behavior": "Completed. pnpm seed --size s generates deterministic products, stores, users, and themes with checksum verification.",
            "required_behavior": "Running seed with identical SEED=42 yields identical database state and checksums.",
            "contracts": "SeedOptions: { size: 's' | 'm' | 'l', seed: number }.",
            "commands": [
                "Implement deterministic pseudo-random generator in packages/backend/src/db/seed/random.ts.",
                "Build catalog fixture generators with power-law popularity and realistic price bands.",
                "Add seed verification script asserting row counts and foreign key integrity."
            ],
            "data_changes": "Inserts users, stores, categories, products, product_variants, store_themes.",
            "security": "Fixed demo account passwords documented for local use only.",
            "error_handling": "Seed script fails loudly if foreign key constraint is violated.",
            "edge_cases": ["Re-running seed on dirty database (must truncate or clean tables first)"],
            "observability": "Seed execution summary showing row counts and duration.",
            "unit_tests": ["packages/backend/src/db/seed.test.ts", "packages/backend/src/db/seed/verify.test.ts"],
            "integration_tests": ["Live PostgreSQL seed run and checksum verification"],
            "e2e_tests": ["None."],
            "security_tests": ["Assert demo accounts have distinct UUIDs and hashed passwords"],
            "manual_verification": "Run pnpm seed --size s --seed 42; verify terminal prints verified counts.",
            "risk_level": "LOW",
            "review_requirements": "Single review pass. Documented in docs/reviews/t028-context.md.",
            "commit": "feat(db): build deterministic catalog seed script and verification harness"
        }
    ]
