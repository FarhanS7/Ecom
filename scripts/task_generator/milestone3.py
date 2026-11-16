def get_tasks():
    return [
        {
            "id": "029",
            "name": "Implement Transactional Outbox and Relay",
            "status": "PLANNED",
            "goal": "Build outbox schema, transactional outbox writer port, and background relay worker polling with FOR UPDATE SKIP LOCKED.",
            "why": "Eliminates dual-write inconsistencies between PostgreSQL and BullMQ queues, ensuring zero lost events on failure.",
            "requirements": ["OR-4", "CT-6", "G5", "PRD Section 4"],
            "blocked_by": ["TASK-003", "TASK-020", "TASK-028"],
            "blocks": ["TASK-030", "TASK-034", "TASK-047", "TASK-071", "TASK-073"],
            "architecture": ["ARCHITECTURE.md -> Synchronous vs Asynchronous", "DECISIONS.md -> DEC-006", "docs/architecture/events.md"],
            "skills": [
                {
                    "name": "test-driven-development",
                    "location": "skills/agent-skills-main/skills/test-driven-development/SKILL.md",
                    "why": "Ensures transaction boundary and outbox relay are verified with failing tests first.",
                    "instructions": ["Write outbox rollback test first", "Verify FOR UPDATE SKIP LOCKED concurrency"]
                },
                {
                    "name": "observability-and-instrumentation",
                    "location": "skills/agent-skills-main/skills/observability-and-instrumentation/SKILL.md",
                    "why": "Governs outbox queue lag metrics and relay polling telemetry.",
                    "instructions": ["Track oldest unconsumed event age", "Include correlation IDs in event envelopes"]
                }
            ],
            "inspect_files": [
                "packages/backend/src/platform/database.ts",
                "packages/backend/src/catalog/seller-catalog.service.ts",
                "apps/worker/src/main.ts",
                "docs/architecture/events.md"
            ],
            "current_behavior": "Not implemented. Domain mutations commit to PostgreSQL directly without recording outbox events or notifying workers.",
            "required_behavior": "Every domain mutation writes an event into the outbox table inside its database transaction; relay worker polls unpublished events and enqueues BullMQ jobs with stable IDs.",
            "contracts": "OutboxRecord: { id: UUID, aggregateType: string, aggregateId: UUID, aggregateVersion: number, type: string, schemaVersion: number, payload: JSONB, createdAt: Date, publishedAt: Date | null, leaseUntil: Date | null, attempts: number }.",
            "commands": [
                "Author migration db/migrations/0007-outbox.sql creating outbox table with partial index on (created_at, id) WHERE published_at IS NULL.",
                "Implement OutboxWriterPort in packages/backend/src/platform/outbox.service.ts accepting UnitOfWorkContext and domain event.",
                "Wire OutboxWriterPort into Catalog mutations (ProductChanged, PublicationChanged).",
                "Build OutboxRelay service in apps/worker/src/relay/outbox-relay.ts polling with SELECT ... FOR UPDATE SKIP LOCKED.",
                "Publish claimed events into BullMQ queue 'domain-events' with jobId = eventId.",
                "Update outbox record with published_at = NOW() upon queue acknowledgment.",
                "Add integration test tests/integration/outbox.spec.ts verifying transactional rollback and duplicate relay safety."
            ],
            "data_changes": "Creates outbox table in migration 0007-outbox.sql with partial index.",
            "security": "Outbox payloads must never store raw session tokens, passwords, or customer payment card data.",
            "error_handling": "Relay handles BullMQ connection loss by releasing leases and backing off with exponential jitter.",
            "edge_cases": [
                "Relay crashes immediately after enqueuing to BullMQ but before updating published_at (deterministic jobId prevents duplicate queue execution)",
                "Outbox polling under empty table (must sleep 200ms without busy-waiting CPU)"
            ],
            "observability": "Logs outbox batch counts; records Prometheus gauge outbox_queue_lag_seconds.",
            "unit_tests": [
                "packages/backend/src/platform/outbox.service.test.ts (envelope validation, JSON serialization)",
                "apps/worker/src/relay/outbox-relay.test.ts (batch claiming, lease expiry)"
            ],
            "integration_tests": [
                "tests/integration/outbox.spec.ts (verify business write + outbox commit atomically; verify rollback rolls back both; verify relay worker claims and marks published)"
            ],
            "e2e_tests": ["None."],
            "security_tests": [
                "Verify outbox payload redacts sensitive user fields"
            ],
            "manual_verification": "Trigger product edit via API; inspect outbox table in PostgreSQL; verify published_at updates to non-null timestamp within 1 second.",
            "risk_level": "HIGH",
            "review_requirements": "Requires two independent review passes on transactional boundaries and lease concurrency. Follow PRD_TO_TASKS_FRAMEWORK Phase 2.5.",
            "commit": "feat(platform): implement transactional outbox and worker relay with skip locked"
        },
        {
            "id": "030",
            "name": "Implement Idempotent Projection Consumers",
            "status": "PLANNED",
            "goal": "Build worker consumer framework with consumer_receipts deduplication table and versioned search_documents projection handler.",
            "why": "Guarantees that replayed, duplicate, or out-of-order domain events cannot regress read models or cause duplicate side effects.",
            "requirements": ["CT-6", "G5", "PRD Section 4", "docs/architecture/events.md"],
            "blocked_by": ["TASK-029"],
            "blocks": ["TASK-031", "TASK-034", "TASK-044", "TASK-064"],
            "architecture": ["ARCHITECTURE.md -> Synchronous vs Asynchronous", "DECISIONS.md -> DEC-006", "DEC-007"],
            "skills": [
                {
                    "name": "test-driven-development",
                    "location": "skills/agent-skills-main/skills/test-driven-development/SKILL.md",
                    "why": "Enforces testing out-of-order event delivery before writing projection handlers.",
                    "instructions": ["Test v3 arriving before v2", "Verify duplicate receipt rejection"]
                },
                {
                    "name": "api-and-interface-design",
                    "location": "skills/agent-skills-main/skills/api-and-interface-design/SKILL.md",
                    "why": "Governs consumer contract and idempotent handler interfaces.",
                    "instructions": ["Commit consumer receipt inside handler transaction", "Enforce version monotonicity"]
                }
            ],
            "inspect_files": [
                "apps/worker/src/main.ts",
                "packages/backend/src/catalog/schema.ts",
                "docs/architecture/events.md"
            ],
            "current_behavior": "Not implemented. BullMQ worker does not consume domain events or update search projections.",
            "required_behavior": "Worker consumes 'domain-events' from BullMQ; checks consumer_receipts; projects product changes into search_documents; ignores stale versions.",
            "contracts": "consumer_receipts: (consumer_name PK, event_id PK, processed_at). search_documents projection schema.",
            "commands": [
                "Author migration db/migrations/0008-search-projection.sql creating search_documents and consumer_receipts tables.",
                "Implement ConsumerReceiptPort in packages/backend/src/platform/consumer.ts.",
                "Implement ProductProjector in packages/backend/src/search/projector.ts handling ProductChanged and PublicationChanged events.",
                "Implement version check: reject update if event.aggregateVersion <= search_documents.source_version.",
                "Wire BullMQ worker in apps/worker/src/consumers/domain-events.consumer.ts.",
                "Write integration test tests/integration/projection.spec.ts delivering v3 before v2 and replaying identical events."
            ],
            "data_changes": "Creates search_documents and consumer_receipts tables in migration 0008-search-projection.sql.",
            "security": "Search projection contains only public, non-PII catalog attributes.",
            "error_handling": "Failed projection transactions throw and trigger BullMQ exponential retry; duplicate receipts return success without re-processing.",
            "edge_cases": [
                "Event v3 arrives before v2; v2 must be ignored when it later arrives",
                "Product archived/deleted: search document receives tombstone (visibility=false) so stale events cannot resurrect it"
            ],
            "observability": "Logs event processing duration and version comparison outcomes; records consumer lag metrics.",
            "unit_tests": [
                "packages/backend/src/search/projector.test.ts (version guard logic, tombstone handling)"
            ],
            "integration_tests": [
                "tests/integration/projection.spec.ts (assert receipt committed with projection; assert duplicate event ignored; assert v2 ignored after v3)"
            ],
            "e2e_tests": ["None."],
            "security_tests": [
                "Verify unpublished product is excluded from search_documents"
            ],
            "manual_verification": "Update product title in seller console; verify search_documents table in PostgreSQL reflects new title and incremented version.",
            "risk_level": "MEDIUM",
            "review_requirements": "Single thorough review pass focusing on version monotonicity and crash recovery. Recorded in docs/reviews/t030-context.md.",
            "commit": "feat(search): implement idempotent event consumer and search projection"
        },
        {
            "id": "031",
            "name": "Implement Text Search, Typo Fallback and Facets",
            "status": "PLANNED",
            "goal": "Build full-text search query service on search_documents using tsvector GIN, pg_trgm similarity, category filtering, and facet counts.",
            "why": "Provides sub-150ms typo-tolerant search and rich facet navigation across 100k products without external cluster overhead.",
            "requirements": ["CT-3", "G1", "NFR-004", "PRD Section 6.2"],
            "blocked_by": ["TASK-030"],
            "blocks": ["TASK-032", "TASK-034", "TASK-079", "TASK-081"],
            "architecture": ["ARCHITECTURE.md -> Search", "DECISIONS.md -> DEC-007", "docs/modules/search.md"],
            "skills": [
                {
                    "name": "performance-optimization",
                    "location": "skills/agent-skills-main/skills/performance-optimization/SKILL.md",
                    "why": "Governs GIN index query planning and sub-150ms search execution.",
                    "instructions": ["Use ts_rank_cd for relevance", "Combine GIN and trigram similarity safely"]
                },
                {
                    "name": "api-and-interface-design",
                    "location": "skills/agent-skills-main/skills/api-and-interface-design/SKILL.md",
                    "why": "Governs search request DTOs and facet response shapes.",
                    "instructions": ["Return facet counts alongside items", "Sanitize user query terms"]
                }
            ],
            "inspect_files": [
                "packages/backend/src/search/schema.ts",
                "packages/backend/src/catalog/read.service.ts",
                "docs/modules/search.md"
            ],
            "current_behavior": "Not implemented. Marketplace has only category browse; no keyword search or facet aggregation.",
            "required_behavior": "GET /v1/search?q=... returns matching products ranked by relevance, handles typos with pg_trgm fallback, and computes category/brand/price facet counts.",
            "contracts": "SearchQueryDto: { q: string, categoryId?: string, minPrice?: number, maxPrice?: number, brand?: string, cursor?: string, limit?: number }. SearchResponseDto: { items: [...], facets: { brands: [...], categories: [...], priceRanges: [...] }, nextCursor: string | null }.",
            "commands": [
                "Implement SearchQueryService in packages/backend/src/search/query.service.ts.",
                "Build tsquery parser stripping special characters and applying prefix matching (':*').",
                "Implement pg_trgm similarity fallback when full-text match returns fewer than 3 results.",
                "Build facet count aggregation queries using GROUP BY within current filter scope.",
                "Expose GET /v1/search in SearchController.",
                "Write integration tests in tests/integration/search.spec.ts covering typos, facets, and channel filtering."
            ],
            "data_changes": "Adds GIN index on search_documents.tsv and GIN trigram index on search_documents.title.",
            "security": "Sanitizes search query inputs; prevents SQL injection via tsquery manipulation.",
            "error_handling": "Returns empty results with 200 OK on empty query or no matches; 400 Bad Request on malformed filters.",
            "edge_cases": [
                "Query with single quote, backslash, or boolean operators (must be sanitized into valid tsquery tokens)",
                "Store-only product searched from global marketplace (must be excluded from results)"
            ],
            "observability": "Records query execution duration; warns if search query plan exceeds 100ms.",
            "unit_tests": [
                "packages/backend/src/search/query-parser.test.ts (query sanitization, prefix conversion)"
            ],
            "integration_tests": [
                "tests/integration/search.spec.ts (test exact match, typo fallback, facet count accuracy, store scoping)"
            ],
            "e2e_tests": ["None."],
            "security_tests": [
                "Assert tsquery injection attempts do not throw SQL syntax errors"
            ],
            "manual_verification": "Execute curl 'http://localhost:3001/v1/search?q=hedphone'; verify 'Headphones' returned with category facet counts.",
            "risk_level": "MEDIUM",
            "review_requirements": "Single thorough review pass focusing on GIN index utilization and query plan safety. Documented in docs/reviews/t031-context.md.",
            "commit": "feat(search): implement full-text search typo fallback and facet aggregation"
        },
        {
            "id": "032",
            "name": "Implement Autocomplete and Search UI",
            "status": "PLANNED",
            "goal": "Build sub-50ms autocomplete suggestion API and interactive search bar component with debounced query dropdown.",
            "why": "Provides shoppers with fast search discovery directly from the header navigation.",
            "requirements": ["CT-4", "design.md", "PRD Section 6.2"],
            "blocked_by": ["TASK-025", "TASK-031"],
            "blocks": ["TASK-075", "TASK-079"],
            "architecture": ["ARCHITECTURE.md -> Frontend", "docs/architecture/frontend.md"],
            "skills": [
                {
                    "name": "frontend-ui-engineering",
                    "location": "skills/agent-skills-main/skills/frontend-ui-engineering/SKILL.md",
                    "why": "Governs client-side debounce, keyboard navigation, and ARIA combobox accessibility.",
                    "instructions": ["Debounce user input by 150ms", "Support ArrowUp/ArrowDown/Escape navigation"]
                },
                {
                    "name": "performance-optimization",
                    "location": "skills/agent-skills-main/skills/performance-optimization/SKILL.md",
                    "why": "Ensures autocomplete endpoint returns in < 50ms p95.",
                    "instructions": ["Limit suggestions to 6 items", "Select minimal columns (id, title, slug, thumbnail)"]
                }
            ],
            "inspect_files": [
                "apps/web/src/app/layout.tsx",
                "packages/backend/src/search/query.service.ts",
                "apps/web/src/components/ui/input.tsx"
            ],
            "current_behavior": "Header search input is static and navigates directly on Enter without live suggestions.",
            "required_behavior": "Typing 2+ characters displays a live dropdown within 50ms showing top matching products and categories with keyboard navigation.",
            "contracts": "GET /v1/search/suggest?q=... -> { suggestions: [{ type: 'product' | 'category', text: string, slug: string, priceCents?: string }] }.",
            "commands": [
                "Implement AutocompleteService in packages/backend/src/search/autocomplete.service.ts querying trigram prefix index.",
                "Expose GET /v1/search/suggest in SearchController.",
                "Build SearchAutocomplete client island component in apps/web/src/features/search/search-bar.tsx.",
                "Add keyboard event handlers (ArrowDown, ArrowUp, Enter, Escape).",
                "Write component tests and browser interaction tests."
            ],
            "data_changes": "None.",
            "security": "Enforces rate limiting on suggest route (100 req/min per IP); sanitizes dropdown HTML output.",
            "error_handling": "Gracefully closes dropdown on network failure without interrupting user typing.",
            "edge_cases": [
                "Rapid backspacing to 0 characters (instantly dismisses dropdown and aborts pending fetch)",
                "Clicking outside the search dropdown (closes menu via click-outside hook)"
            ],
            "observability": "Suggest endpoint response time histogram.",
            "unit_tests": [
                "apps/web/src/features/search/search-bar.test.tsx (debouncing, keyboard navigation, selection)"
            ],
            "integration_tests": [
                "tests/integration/autocomplete.spec.ts (verify sub-50ms query response on seeded catalog)"
            ],
            "e2e_tests": [
                "tests/e2e/search-flow.spec.ts (type in header, navigate suggestions with keyboard, press Enter)"
            ],
            "security_tests": [
                "Assert XSS payloads in query string do not render unescaped in suggestion dropdown"
            ],
            "manual_verification": "Type 'sho' into search bar; verify dropdown appears instantly with shoe suggestions; navigate with arrow keys.",
            "risk_level": "LOW",
            "review_requirements": "Single review pass focusing on accessibility and debounce cancellation. Documented in docs/reviews/t032-context.md.",
            "commit": "feat(web): build sub-50ms autocomplete endpoint and search bar component"
        },
        {
            "id": "033",
            "name": "Add Scoped Product Caching and Stampede Control",
            "status": "PLANNED",
            "goal": "Build Redis cache-aside layer for Product Detail Pages with single-flight mutex lock, stale-while-revalidate, and event-driven invalidation.",
            "why": "Protects PostgreSQL from traffic spikes on hot products while guaranteeing sub-80ms PDP responses.",
            "requirements": ["CT-5", "G1", "NFR-003", "PRD Section 6.2"],
            "blocked_by": ["TASK-021", "TASK-026", "TASK-030"],
            "blocks": ["TASK-079"],
            "architecture": ["ARCHITECTURE.md -> Caching Strategy", "DECISIONS.md -> DEC-007"],
            "skills": [
                {
                    "name": "performance-optimization",
                    "location": "skills/agent-skills-main/skills/performance-optimization/SKILL.md",
                    "why": "Governs Redis cache-aside implementation and stampede mutex pattern.",
                    "instructions": ["Use SET lock:{key} 1 EX 5 NX", "Apply TTL jitter"]
                },
                {
                    "name": "test-driven-development",
                    "location": "skills/agent-skills-main/skills/test-driven-development/SKILL.md",
                    "why": "Enforces testing concurrent cache misses before writing cache logic.",
                    "instructions": ["Simulate 50 concurrent requests", "Assert exactly 1 DB query executed"]
                }
            ],
            "inspect_files": [
                "packages/backend/src/catalog/read.service.ts",
                "packages/backend/src/catalog/catalog.controller.ts",
                "packages/backend/src/search/projector.ts"
            ],
            "current_behavior": "Every PDP request executes relational queries against PostgreSQL without caching.",
            "required_behavior": "PDP reads check Redis first; on miss, acquires single-flight lock to query DB; caches payload with 5-minute TTL; ProductChanged events invalidate key immediately.",
            "contracts": "CacheKey: cache:pdp:{channelKey}:{productSlug}. CachePayload: CachedProductDetailDto.",
            "commands": [
                "Implement RedisCacheService in packages/backend/src/platform/cache.service.ts with getOrSet() and distributed mutex lock.",
                "Wrap CatalogReadService.getProductBySlug() with cache-aside layer.",
                "Add TTL jitter (300s +/- 30s) to prevent synchronized cache expiration.",
                "Hook outbox consumer to invalidate cache:pdp:* on ProductChanged and PublicationChanged events.",
                "Write concurrency test tests/integration/cache-stampede.spec.ts."
            ],
            "data_changes": "None in PostgreSQL; stores JSON keys in Redis DB 0.",
            "security": "Cache keys are strictly scoped by channel and store slug; private customer data is never cached.",
            "error_handling": "Redis failure gracefully falls back to direct PostgreSQL query without throwing 500.",
            "edge_cases": [
                "Redis connection drop (must log error and bypass cache transparently)",
                "Process crashes while holding mutex lock (NX lock TTL of 5s guarantees automatic release)"
            ],
            "observability": "Emits cache_hits_total and cache_misses_total metrics.",
            "unit_tests": [
                "packages/backend/src/platform/cache.service.test.ts (mutex lock acquisition, release, TTL jitter)"
            ],
            "integration_tests": [
                "tests/integration/cache-stampede.spec.ts (50 concurrent requests execute exactly 1 SQL query; outbox event invalidates key)"
            ],
            "e2e_tests": ["None."],
            "security_tests": [
                "Verify cache key does not leak across distinct channel scopes"
            ],
            "manual_verification": "Load product PDP twice; check Redis CLI KEYS cache:pdp:*; observe second request latency drops to < 10ms.",
            "risk_level": "MEDIUM",
            "review_requirements": "Single thorough review pass focusing on fallback behavior when Redis is down. Documented in docs/reviews/t033-context.md.",
            "commit": "feat(catalog): add redis product caching with single-flight stampede mutex"
        },
        {
            "id": "034",
            "name": "Implement Safe Full Reindex",
            "status": "PLANNED",
            "goal": "Build zero-downtime full reindex CLI command that rebuilds the search_documents projection from primary catalog tables in bounded batches.",
            "why": "Enables operators to recover search projections after schema changes, database migrations, or corruption without taking search offline.",
            "requirements": ["CT-6", "G5", "PRD Section 6.2"],
            "blocked_by": ["TASK-029", "TASK-030", "TASK-031"],
            "blocks": ["TASK-077", "TASK-087"],
            "architecture": ["ARCHITECTURE.md -> Operations", "docs/modules/search.md"],
            "skills": [
                {
                    "name": "performance-optimization",
                    "location": "skills/agent-skills-main/skills/performance-optimization/SKILL.md",
                    "why": "Governs cursor batching and zero-downtime projection swaps.",
                    "instructions": ["Process in batches of 500 using keyset cursor", "Do not lock primary tables during reindex"]
                }
            ],
            "inspect_files": [
                "packages/backend/src/search/projector.ts",
                "packages/backend/src/search/schema.ts",
                "apps/worker/src/main.ts"
            ],
            "current_behavior": "Not implemented. If search_documents becomes corrupt or out of sync, there is no mechanism to regenerate it.",
            "required_behavior": "Running 'pnpm search:reindex' processes all active products in bounded batches (500 items), updates search documents, and reports progress with zero search downtime.",
            "contracts": "CLI command: pnpm search:reindex [--batch-size=500] [--store=slug].",
            "commands": [
                "Build ReindexService in packages/backend/src/search/reindex.service.ts.",
                "Implement keyset batch pagination over products and variants.",
                "Use INSERT ... ON CONFLICT (product_id) DO UPDATE to atomically refresh documents without deleting active index.",
                "Add CLI script in scripts/reindex.ts with progress bar and timing summary.",
                "Add integration test verifying reindex restores missing search documents."
            ],
            "data_changes": "Bulk updates search_documents table.",
            "security": "Reindex script requires administrative credentials or operational CLI access.",
            "error_handling": "Logs failed batch IDs and continues remaining batches; exits with non-zero code if any batch fails.",
            "edge_cases": [
                "Product edited while reindex is running (outbox version check prevents reindex from overwriting newer edit)"
            ],
            "observability": "Prints progress percentage, items/sec throughput, and total elapsed duration.",
            "unit_tests": [
                "packages/backend/src/search/reindex.service.test.ts (batching logic, conflict update)"
            ],
            "integration_tests": [
                "tests/integration/reindex.spec.ts (truncate search_documents; run reindex; assert 100% of products restored and searchable)"
            ],
            "e2e_tests": ["None."],
            "security_tests": ["None."],
            "manual_verification": "Truncate search_documents in psql; run pnpm search:reindex; verify search results return full product count.",
            "risk_level": "LOW",
            "review_requirements": "Single review pass. Documented in docs/reviews/t034-context.md.",
            "commit": "feat(search): implement zero-downtime full catalog reindex cli tool"
        },
        {
            "id": "035",
            "name": "Implement Validated Asset Uploads",
            "status": "PLANNED",
            "goal": "Build presigned URL upload generation for MinIO/S3 with server-side magic byte MIME sniffing and quarantine status.",
            "why": "Enables vendors to upload product images safely without routing large binary streams through the API server.",
            "requirements": ["CT-7", "PRD Section 6.2", "docs/architecture/data-model.md"],
            "blocked_by": ["TASK-003", "TASK-014"],
            "blocks": ["TASK-036"],
            "architecture": ["ARCHITECTURE.md -> Storage", "docs/modules/platform.md"],
            "skills": [
                {
                    "name": "security-and-hardening",
                    "location": "skills/agent-skills-main/skills/security-and-hardening/SKILL.md",
                    "why": "Governs file upload security, magic byte verification, and SVG XSS prevention.",
                    "instructions": ["Strictly disallow raw SVG uploads in V1", "Inspect magic bytes before quarantine release"]
                },
                {
                    "name": "api-and-interface-design",
                    "location": "skills/agent-skills-main/skills/api-and-interface-design/SKILL.md",
                    "why": "Governs presigned upload grant and completion endpoints.",
                    "instructions": ["Use short-lived upload URLs (15 min)", "Enforce scoped store_id on asset creation"]
                }
            ],
            "inspect_files": [
                "db/migrations/0002-stores.sql",
                "packages/backend/src/platform/security.ts",
                "packages/config/src/env.ts"
            ],
            "current_behavior": "Not implemented. Products have placeholder image URLs; no media upload endpoints exist.",
            "required_behavior": "POST /v1/seller/stores/{id}/uploads issues presigned S3 PUT URL; seller uploads file directly to MinIO; POST /.../complete verifies magic bytes, transitions status from 'quarantined' to 'ready'.",
            "contracts": "CreateUploadGrantDto: { filename: string, declaredType: string, bytes: number }. UploadGrantResponseDto: { assetId: string, uploadUrl: string, objectKey: string, expiresAt: string }.",
            "commands": [
                "Author migration db/migrations/0009-media-assets.sql creating media_assets and product_images tables.",
                "Implement StoragePort in packages/backend/src/platform/storage.service.ts using AWS SDK v3 S3 client configured for MinIO.",
                "Implement MagicByteValidator verifying JPEG, PNG, WebP headers; strictly reject SVGs.",
                "Expose upload grant and complete endpoints in SellerMediaController.",
                "Write integration tests verifying presigned upload lifecycle and malicious file rejection."
            ],
            "data_changes": "Creates media_assets and product_images tables in migration 0009-media-assets.sql.",
            "security": "Enforces 10 MB file size limit; rejects executable binaries, HTML, and SVG files to prevent Stored XSS.",
            "error_handling": "Returns 422 Unprocessable if file content does not match declared image format.",
            "edge_cases": [
                "Seller uploads file with .jpg extension containing HTML/JS payload (magic byte inspection rejects asset into 'rejected' status)",
                "Presigned URL expires before client finishes upload (client must request new grant)"
            ],
            "observability": "Audit log for asset upload grant and verification outcomes.",
            "unit_tests": [
                "packages/backend/src/platform/magic-bytes.test.ts (verify JPEG, PNG, WebP detection; reject SVG and ELF/PE binaries)"
            ],
            "integration_tests": [
                "tests/integration/uploads.spec.ts (request grant, upload binary to MinIO, complete asset, verify status is 'ready')"
            ],
            "e2e_tests": ["None."],
            "security_tests": [
                "Upload SVG file with script tag; assert completion endpoint rejects file with 422"
            ],
            "manual_verification": "Request upload grant via curl; upload image via HTTP PUT; complete asset; verify object visible in MinIO console.",
            "risk_level": "MEDIUM",
            "review_requirements": "Single thorough review pass focusing on file header validation and S3 bucket permissions. Recorded in docs/reviews/t035-context.md.",
            "commit": "feat(media): implement presigned asset uploads and magic byte verification"
        },
        {
            "id": "036",
            "name": "Connect Media Editing and Responsive Images",
            "status": "PLANNED",
            "goal": "Build seller media gallery UI, image reordering, and responsive Next.js Image component optimization on storefront PDP.",
            "why": "Enables vendors to visually manage product galleries and provides shoppers with fast, responsive imagery.",
            "requirements": ["CT-1", "CT-7", "design.md"],
            "blocked_by": ["TASK-027", "TASK-035"],
            "blocks": ["TASK-075", "TASK-080"],
            "architecture": ["ARCHITECTURE.md -> Frontend", "docs/architecture/frontend.md"],
            "skills": [
                {
                    "name": "frontend-ui-engineering",
                    "location": "skills/agent-skills-main/skills/frontend-ui-engineering/SKILL.md",
                    "why": "Governs Next.js Image component usage, layout shifts, and responsive srcsets.",
                    "instructions": ["Use next/image with explicit width/height to avoid CLS", "Generate responsive srcsets"]
                }
            ],
            "inspect_files": [
                "apps/web/src/features/seller/product-workspace.tsx",
                "apps/web/src/features/catalog/product-detail.tsx",
                "apps/web/src/lib/api.ts"
            ],
            "current_behavior": "Seller console has no image management tab; PDP displays static placeholder graphics.",
            "required_behavior": "Sellers upload and reorder images in console; PDP displays interactive image gallery with thumbnails and responsive Next.js Image optimization.",
            "contracts": "ProductImageDto: { id: string, assetId: string, url: string, position: number, alt: string }.",
            "commands": [
                "Build MediaUploadDropzone component in apps/web/src/features/seller/media-uploader.tsx.",
                "Build ProductGalleryEditor supporting drag-and-drop position sorting.",
                "Update PDP in apps/web/src/features/catalog/product-detail.tsx to render next/image gallery.",
                "Configure next.config.js remotePatterns allowlisting MinIO / S3 host.",
                "Write component tests for image upload and PDP gallery."
            ],
            "data_changes": "Inserts product_images associating media_assets with products.",
            "security": "Enforces store ownership: seller can only attach images belonging to their own store.",
            "error_handling": "Displays upload progress bar and clear error toast if file is rejected.",
            "edge_cases": [
                "Deleting primary image (position 0) automatically promotes next image to primary position"
            ],
            "observability": "Image load error tracking in browser console.",
            "unit_tests": [
                "apps/web/src/features/seller/media-uploader.test.tsx (file drop validation, progress state)",
                "apps/web/src/features/catalog/gallery.test.tsx (thumbnail switching, active image)"
            ],
            "integration_tests": [
                "tests/integration/product-images.spec.ts (associate image with product; verify order in public read)"
            ],
            "e2e_tests": [
                "tests/e2e/seller-media.spec.ts (upload image in seller console, visit public PDP, assert image renders)"
            ],
            "security_tests": [
                "Assert seller cannot associate assetId belonging to another store"
            ],
            "manual_verification": "Upload photo in /seller/products; open PDP in new tab; verify high-res image renders with thumbnail carousel.",
            "risk_level": "LOW",
            "review_requirements": "Single review pass focusing on responsive image layouts and Cumulative Layout Shift. Documented in docs/reviews/t036-context.md.",
            "commit": "feat(web): build seller media gallery editor and responsive pdp image carousel"
        }
    ]
