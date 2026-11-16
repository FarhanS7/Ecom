def get_tasks():
    return [
        {
            "id": "077",
            "name": "Generate Realistic Seed Tiers and Verify Distributions",
            "status": "PLANNED",
            "goal": "Build PostgreSQL COPY bulk seeder generating realistic datasets for Tier S (1k), Tier M (10k), Tier L (100k), and Tier XL (1M) products with power-law distributions.",
            "why": "Provides the 100,000-product dataset required to validate PRD Goal G1 and performance SLOs in under 10 minutes.",
            "requirements": ["G1", "PRD Section 11", "PRD Section 11.2"],
            "blocked_by": ["TASK-028", "TASK-034", "TASK-037", "TASK-046"],
            "blocks": ["TASK-078", "TASK-079", "TASK-083", "TASK-084"],
            "architecture": ["ARCHITECTURE.md -> Database", "DECISIONS.md -> DEC-009"],
            "skills": [
                {
                    "name": "performance-optimization",
                    "location": "skills/agent-skills-main/skills/performance-optimization/SKILL.md",
                    "why": "Governs bulk data loading via PostgreSQL COPY streams.",
                    "instructions": ["Use pg-copy-streams for bulk insertion", "Seed Tier L (100k) in under 10 minutes"]
                },
                {
                    "name": "test-driven-development",
                    "location": "skills/agent-skills-main/skills/test-driven-development/SKILL.md",
                    "why": "Enforces testing distribution validity (Zipfian skew, FK integrity).",
                    "instructions": ["Verify top 1% of products account for >= 25% of orders", "Assert zero FK orphans"]
                }
            ],
            "inspect_files": [
                "packages/backend/src/db/seed.ts",
                "packages/backend/src/db/seed/catalog.ts",
                "packages/backend/src/db/seed/verify.ts"
            ],
            "current_behavior": "Seed script generates baseline Tier S catalog using batch inserts, but lacks high-volume COPY streams for Tier L (100k) or realistic order distribution models.",
            "required_behavior": "CLI 'pnpm seed --size l --seed 42' streams 100k products, 250k variants, 1M orders, and 1.8M order items via COPY in < 10 min; verifies Zipfian order distribution and FK integrity.",
            "contracts": "CLI: pnpm seed --size [s|m|l|xl] --seed [number]. pnpm seed:verify.",
            "commands": [
                "Install pg-copy-streams in packages/backend.",
                "Implement BulkCopyWriter streaming CSV rows directly into PostgreSQL tables via STDIN.",
                "Build distribution generator implementing Zipfian power-law for product popularity, log-normal prices, and seasonal order peaks.",
                "Implement seed-verify CLI asserting row counts, foreign key integrity, and distribution skew.",
                "Execute test seed run for Tier S, M, and L.",
                "Document seed timings and row counts in docs/benchmarks/seed-evidence.md."
            ],
            "data_changes": "Populates users (100k), stores (500), products (100k), variants (250k), inventory (250k), orders (1M), order_items (1.8M), reviews (600k).",
            "security": "Fixed demo credentials used exclusively for testing; production seeding disabled in production environment.",
            "error_handling": "Aborts bulk COPY and truncates uncommitted tables if any constraint violation occurs.",
            "edge_cases": [
                "PostgreSQL shared_buffers memory saturation during 1M row COPY (streams data in bounded chunks to prevent OOM)"
            ],
            "observability": "Prints real-time progress bar, streaming throughput (rows/sec), and memory utilization.",
            "unit_tests": [
                "packages/backend/src/db/seed/distributions.test.ts (Zipfian distribution math, log-normal price bounds)"
            ],
            "integration_tests": [
                "tests/integration/seed-large.spec.ts (run Tier M seed; assert FK integrity and distribution skew)"
            ],
            "e2e_tests": ["None."],
            "security_tests": ["None."],
            "manual_verification": "Run 'pnpm seed --size s --seed 42 && pnpm seed:verify'; verify script outputs 'Distribution sanity verified: PASS'.",
            "risk_level": "MEDIUM",
            "review_requirements": "Single thorough review pass focusing on stream chunking and memory consumption on 8 GB host. Documented in docs/reviews/t077-context.md.",
            "commit": "feat(db): implement bulk postgres copy seeder for 100k product tier l"
        },
        {
            "id": "078",
            "name": "Prove Index and Pagination Improvements",
            "status": "PLANNED",
            "goal": "Execute and document EXPLAIN ANALYZE comparison benchmarks demonstrating keyset cursor pagination vs. OFFSET 50000 and index scan optimizations on 100k products.",
            "why": "Provides concrete database query plan evidence fulfilling PRD Goal G1 (Catalog stays fast at 100k+ products; documented in EXPLAIN ANALYZE before/after).",
            "requirements": ["G1", "CT-2", "NFR-001", "NFR-002", "PRD Section 1.2"],
            "blocked_by": ["TASK-022", "TASK-077"],
            "blocks": ["TASK-084"],
            "architecture": ["ARCHITECTURE.md -> Database Schema Strategy", "DECISIONS.md -> DEC-002"],
            "skills": [
                {
                    "name": "performance-optimization",
                    "location": "skills/agent-skills-main/skills/performance-optimization/SKILL.md",
                    "why": "Governs EXPLAIN ANALYZE query plan extraction, index scans, and buffer cache metrics.",
                    "instructions": ["Extract exact query plan with EXPLAIN (ANALYZE, BUFFERS)", "Compare OFFSET 50000 vs Keyset cursor"]
                }
            ],
            "inspect_files": [
                "packages/backend/src/catalog/cursor.ts",
                "packages/backend/src/catalog/read.service.ts",
                "db/migrations/0006-catalog.sql"
            ],
            "current_behavior": "Keyset pagination is implemented in code, but formal before/after query plans with buffer cache stats on 100k products have not been recorded.",
            "required_behavior": "Benchmark script runs queries against Tier L (100k products); proves OFFSET 50000 takes > 500ms with sequential buffer scans, while keyset cursor takes < 15ms via index scan.",
            "contracts": "Benchmark report in docs/benchmarks/query-plans.md.",
            "commands": [
                "Author benchmark script in scripts/benchmark-queries.ts.",
                "Execute naive OFFSET 50000 query on category with 20k products: EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM products WHERE category_id = '...' ORDER BY created_at DESC LIMIT 20 OFFSET 19000.",
                "Execute keyset query on same dataset: EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM products WHERE category_id = '...' AND (created_at, id) < (...) ORDER BY created_at DESC, id DESC LIMIT 20.",
                "Compare missing index vs. composite index on seller_orders(store_id, created_at DESC).",
                "Capture full text query plans, buffer shared hit counts, and execution timings.",
                "Commit comparative analysis to docs/benchmarks/query-plans.md."
            ],
            "data_changes": "None.",
            "security": "Benchmark scripts run in read-only transaction mode.",
            "error_handling": "Aborts benchmark if target dataset has fewer than 10,000 products.",
            "edge_cases": [
                "Cold cache vs warm cache (executes query 5 times to report both warm and cold timings)"
            ],
            "observability": "Records execution timings, shared buffer hits, and I/O read bytes.",
            "unit_tests": ["None."],
            "integration_tests": [
                "tests/integration/query-plans.spec.ts (assert keyset query plan utilizes Index Scan or Bitmap Index Scan, never Seq Scan)"
            ],
            "e2e_tests": ["None."],
            "security_tests": ["None."],
            "manual_verification": "Execute 'pnpm benchmark:queries'; inspect docs/benchmarks/query-plans.md; verify keyset execution time < 25ms.",
            "risk_level": "LOW",
            "review_requirements": "Single review pass focusing on EXPLAIN ANALYZE interpretation and index scan proof. Documented in docs/reviews/t078-context.md.",
            "commit": "test(benchmarks): document explain analyze query plans comparing keyset vs offset pagination"
        },
        {
            "id": "079",
            "name": "Build SLO and Throughput Load Suites",
            "status": "PLANNED",
            "goal": "Build and execute k6 load test suites evaluating Browse Mix (1,000 req/s), Search Stress (200 VUs), and Checkout Under Load against Tier L, asserting all PRD SLO targets.",
            "why": "Provides transparent proof that ShopScale satisfies all latency and throughput SLOs on realistic hardware.",
            "requirements": ["G1", "G2", "G3", "NFR-001", "NFR-002", "NFR-003", "NFR-004", "NFR-005", "NFR-006", "NFR-007", "NFR-010"],
            "blocked_by": ["TASK-031", "TASK-033", "TASK-044", "TASK-054", "TASK-077"],
            "blocks": ["TASK-083", "TASK-084"],
            "architecture": ["ARCHITECTURE.md -> First bottleneck and scaling path", "01-ecommerce-marketplace-PRD.md Section 7"],
            "skills": [
                {
                    "name": "performance-optimization",
                    "location": "skills/agent-skills-main/skills/performance-optimization/SKILL.md",
                    "why": "Governs k6 load test scripting, threshold definitions, and p95 latency assertions.",
                    "instructions": ["Define explicit k6 thresholds matching PRD SLOs", "Ramp traffic gracefully to prevent artificial cold-start spikes"]
                }
            ],
            "inspect_files": [
                "loadtests/browse-mix.js",
                "loadtests/search-stress.js",
                "01-ecommerce-marketplace-PRD.md"
            ],
            "current_behavior": "Not implemented. No comprehensive k6 load testing suite exists to validate PRD Section 7 SLOs.",
            "required_behavior": "k6 scripts execute 10-minute load profiles against Tier L dataset; assert: Browse p95 < 150ms, Search p95 < 150ms, PDP p95 < 80ms, Checkout p95 < 500ms, Error rate < 0.5%, Throughput >= 1,000 req/s.",
            "contracts": "k6 scenario profiles in loadtests/browse-mix.js, loadtests/search-stress.js, loadtests/checkout-load.js.",
            "commands": [
                "Author loadtests/browse-mix.js (70% category list, 20% PDP, 10% search; ramps to 1,000 req/s for 10 min).",
                "Author loadtests/search-stress.js (200 virtual users querying random dictionary terms with typo injection).",
                "Author loadtests/checkout-load.js (sustained concurrent checkouts with idempotency keys).",
                "Configure k6 thresholds: http_req_duration{scenario:browse}: ['p(95)<150'], http_req_failed: ['rate<0.005'].",
                "Execute load suites against Tier L seeded instance.",
                "Export raw JSON metrics to loadtests/results/.",
                "Document summary results in docs/reviews/t079-context.md."
            ],
            "data_changes": "None in schema; exercises database and Redis caches under load.",
            "security": "Load tests execute against isolated test database instance.",
            "error_handling": "k6 checks fail build if error rate exceeds 0.5% or p95 thresholds are breached.",
            "edge_cases": [
                "Host CPU throttling during 10-minute load test (documents hardware specifications and thermal state in results)"
            ],
            "observability": "Continuous p95, p99, and throughput metrics streamed to console.",
            "unit_tests": ["None."],
            "integration_tests": ["None."],
            "e2e_tests": ["None."],
            "security_tests": ["None."],
            "manual_verification": "Execute 'pnpm loadtest:browse'; verify k6 terminal summary reports all threshold checks passed in green.",
            "risk_level": "HIGH",
            "review_requirements": "Multiple review passes on load profile realism, hardware disclosure, and raw metrics verification. Documented in docs/reviews/t079-context.md.",
            "commit": "test(load): build k6 slo throughput and search stress suites against tier l"
        },
        {
            "id": "080",
            "name": "Measure Frontend Performance",
            "status": "PLANNED",
            "goal": "Execute automated Lighthouse and Core Web Vitals audits across Next.js storefront pages, verifying LCP < 2.5s, CLS < 0.1, and FID/INP < 100ms.",
            "why": "Guarantees fast client-side performance, minimal layout shift, and optimal search engine optimization.",
            "requirements": ["PRD Section 3", "design.md"],
            "blocked_by": ["TASK-036", "TASK-075"],
            "blocks": ["TASK-084"],
            "architecture": ["ARCHITECTURE.md -> Frontend", "docs/architecture/frontend.md"],
            "skills": [
                {
                    "name": "performance-optimization",
                    "location": "skills/agent-skills-main/skills/performance-optimization/SKILL.md",
                    "why": "Governs Core Web Vitals optimization, image compression, and script bundle splitting.",
                    "instructions": ["Target Lighthouse Performance score >= 90", "Ensure Largest Contentful Paint < 2.5s"]
                }
            ],
            "inspect_files": [
                "apps/web/src/app/page.tsx",
                "apps/web/src/features/catalog/product-detail.tsx",
                "apps/web/next.config.js"
            ],
            "current_behavior": "Frontend uses Next.js App Router and token components, but formal Core Web Vitals scores have not been benchmarked.",
            "required_behavior": "Automated Lighthouse audits on Marketplace Home, Category PLP, and Product PDP achieve Performance >= 90, LCP < 2.5s, CLS < 0.1, and zero render-blocking script warnings.",
            "contracts": "Lighthouse CI config in lighthouserc.json.",
            "commands": [
                "Install @lhci/cli in apps/web.",
                "Author lighthouserc.json defining URL targets: /, /products, /products/[slug].",
                "Configure assertions: categories:performance >= 0.90, first-contentful-paint <= 1500, largest-contentful-paint <= 2500, cumulative-layout-shift <= 0.1.",
                "Run lhci autorun against production build (pnpm build && pnpm start).",
                "Save Lighthouse HTML reports into docs/benchmarks/lighthouse/.",
                "Document performance metrics in docs/reviews/t080-context.md."
            ],
            "data_changes": "None.",
            "security": "Enforces no insecure third-party scripts or trackers.",
            "error_handling": "Lighthouse CI fails if any Core Web Vital threshold is violated.",
            "edge_cases": [
                "Heavy image loading on PDP (next/image priority flag on primary hero image prevents LCP delay)"
            ],
            "observability": "Core Web Vitals reported in Lighthouse summary.",
            "unit_tests": ["None."],
            "integration_tests": ["None."],
            "e2e_tests": ["None."],
            "security_tests": ["None."],
            "manual_verification": "Run 'pnpm lighthouserc'; inspect generated HTML report; verify all 3 target pages score >= 90.",
            "risk_level": "LOW",
            "review_requirements": "Single review pass focusing on LCP image optimization and bundle size. Documented in docs/reviews/t080-context.md.",
            "commit": "test(web): benchmark frontend core web vitals and lighthouse performance"
        },
        {
            "id": "081",
            "name": "Compare Optional OpenSearch Adapter",
            "status": "PLANNED",
            "goal": "Build optional OpenSearch 8 search adapter implementing SearchPort and benchmark latency and indexing throughput against PostgreSQL search projection.",
            "why": "Evaluates the trade-offs of dedicated search infrastructure versus PostgreSQL FTS, providing architectural clarity for future scale.",
            "requirements": ["CT-6", "PRD Section 3", "PRD Section 4"],
            "blocked_by": ["TASK-031", "TASK-077"],
            "blocks": ["TASK-084"],
            "architecture": ["ARCHITECTURE.md -> First bottleneck and scaling path", "DECISIONS.md -> DEC-007"],
            "skills": [
                {
                    "name": "performance-optimization",
                    "location": "skills/agent-skills-main/skills/performance-optimization/SKILL.md",
                    "why": "Governs comparative benchmarking of search engine throughput and RAM footprint.",
                    "instructions": ["Implement exact same SearchPort interface", "Measure memory consumption alongside latency"]
                }
            ],
            "inspect_files": [
                "packages/backend/src/search/query.service.ts",
                "packages/contracts/src/search.ts",
                "infra/compose.search.yml"
            ],
            "current_behavior": "PostgreSQL search projection is the sole search engine; OpenSearch adapter is not implemented.",
            "required_behavior": "OpenSearchSearchAdapter implements SearchPort; optional compose.search.yml boots OpenSearch 8 container; benchmark script compares p95 latency and memory footprint between Postgres FTS and OpenSearch on 100k products.",
            "contracts": "SearchPort in @shopscale/backend/src/search/search.port.ts.",
            "commands": [
                "Define optional infra/compose.search.yml with single-node OpenSearch 8 (capped at 1 GB heap).",
                "Implement OpenSearchSearchAdapter in packages/backend/src/search/opensearch.adapter.ts.",
                "Build indexer mapping with edge_ngram analyzer for autocomplete and standard analyzer with english stemmer for search.",
                "Author comparative benchmark script in scripts/compare-search-engines.ts.",
                "Execute 500 search queries across both engines; record p95 latency, indexing speed, and RAM usage.",
                "Document comparison findings in docs/benchmarks/search-engine-comparison.md."
            ],
            "data_changes": "None in PostgreSQL; creates index in OpenSearch container.",
            "security": "OpenSearch container communication restricted to internal Docker network.",
            "error_handling": "System seamlessly runs with PostgreSQL FTS if OpenSearch container is absent.",
            "edge_cases": [
                "OpenSearch container OOM during bulk indexing (documents memory threshold on 8 GB machine)"
            ],
            "observability": "Search latency comparison metrics.",
            "unit_tests": [
                "packages/backend/src/search/opensearch-query-builder.test.ts (query DSL generation)"
            ],
            "integration_tests": [
                "tests/integration/opensearch.spec.ts (index document; query OpenSearch; verify matching results)"
            ],
            "e2e_tests": ["None."],
            "security_tests": ["None."],
            "manual_verification": "Boot compose.search.yml; run search comparison script; inspect comparative markdown table.",
            "risk_level": "LOW",
            "review_requirements": "Single review pass focusing on interface parity between PostgreSQL and OpenSearch adapters. Documented in docs/reviews/t081-context.md.",
            "commit": "feat(search): implement optional opensearch adapter and comparative benchmark"
        },
        {
            "id": "082",
            "name": "Explore Partitioning and Read Replicas",
            "status": "PLANNED",
            "goal": "Build experimental schema partition on audit_logs and stock_movements by month, and benchmark read replica query routing for sales analytics.",
            "why": "Demonstrates architectural understanding of PostgreSQL table partitioning and OLTP vs. OLAP connection routing at 1M+ scale.",
            "requirements": ["AD-2", "PRD Section 8.2", "PRD Section 9"],
            "blocked_by": ["TASK-062", "TASK-066", "TASK-077"],
            "blocks": ["TASK-084"],
            "architecture": ["ARCHITECTURE.md -> Database", "DECISIONS.md -> DEC-002"],
            "skills": [
                {
                    "name": "performance-optimization",
                    "location": "skills/agent-skills-main/skills/performance-optimization/SKILL.md",
                    "why": "Governs declarative table partitioning and partition pruning query plans.",
                    "instructions": ["Use PARTITION BY RANGE (created_at)", "Verify partition pruning via EXPLAIN ANALYZE"]
                }
            ],
            "inspect_files": [
                "packages/backend/src/platform/database.ts",
                "db/migrations/0003-audit.sql",
                "01-ecommerce-marketplace-PRD.md"
            ],
            "current_behavior": "All tables are single unpartitioned tables; all queries execute against the primary PostgreSQL connection pool.",
            "required_behavior": "Migration scripts demonstrate declarative range partitioning on append-only audit_logs; query plans demonstrate Partition Pruning; replica connection pool routes analytical queries.",
            "contracts": "ReplicaPoolPort in packages/backend/src/platform/database.ts.",
            "commands": [
                "Author experimental migration db/migrations/0026-partitioning-experiment.sql creating audit_logs_partitioned PARTITION BY RANGE (created_at).",
                "Create monthly child partitions for past 12 months.",
                "Execute query filtering by specific month: EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM audit_logs_partitioned WHERE created_at >= '2026-05-01' AND created_at < '2026-06-01'.",
                "Assert EXPLAIN plan displays 'Partitions: 1' demonstrating partition pruning (unused 11 partitions pruned).",
                "Implement dual-pool router in database.ts directing analytics queries to READ_REPLICA_URL if configured.",
                "Document partition plan and replication findings in docs/benchmarks/partitioning.md."
            ],
            "data_changes": "Creates partitioned tables and monthly child partitions in migration 0026-partitioning-experiment.sql.",
            "security": "Enforces identical access control on partitioned tables.",
            "error_handling": "Query gracefully routes to primary pool if read replica is unavailable.",
            "edge_cases": [
                "Inserting row outside pre-created partition ranges (defines DEFAULT partition to catch out-of-range dates)"
            ],
            "observability": "Partition pruning confirmation in query plans.",
            "unit_tests": ["None."],
            "integration_tests": [
                "tests/integration/partitioning.spec.ts (insert across 3 monthly partitions; query 1 month; assert partition pruning in plan)"
            ],
            "e2e_tests": ["None."],
            "security_tests": ["None."],
            "manual_verification": "Run 'pnpm benchmark:partitioning'; verify terminal output shows Partition Pruning eliminating unselected months.",
            "risk_level": "LOW",
            "review_requirements": "Single review pass focusing on partition key selection and unique constraint limitations. Documented in docs/reviews/t082-context.md.",
            "commit": "feat(db): demonstrate declarative range partitioning and read replica routing"
        },
        {
            "id": "083",
            "name": "Run Soak and Contention Analysis",
            "status": "PLANNED",
            "goal": "Execute multi-hour sustained load soak test evaluating memory leaks, PostgreSQL connection pool saturation, and row lock wait times under continuous traffic.",
            "why": "Proves the application is immune to memory leaks, connection pool starvation, and lock deadlocks during prolonged production operations.",
            "requirements": ["G2", "G5", "NFR-007", "NFR-010"],
            "blocked_by": ["TASK-077", "TASK-079"],
            "blocks": ["TASK-084"],
            "architecture": ["ARCHITECTURE.md -> First bottleneck and scaling path", "01-ecommerce-marketplace-PRD.md Section 12"],
            "skills": [
                {
                    "name": "performance-optimization",
                    "location": "skills/agent-skills-main/skills/performance-optimization/SKILL.md",
                    "why": "Governs soak test execution, heap snapshot analysis, and lock contention profiling.",
                    "instructions": ["Run sustained load for minimum 1 hour", "Track Node.js heap used and PG lock wait events"]
                }
            ],
            "inspect_files": [
                "packages/backend/src/platform/database.ts",
                "loadtests/browse-mix.js",
                "apps/api/src/main.ts"
            ],
            "current_behavior": "Short burst tests execute, but multi-hour endurance soak tests evaluating memory stability have not been run.",
            "required_behavior": "Soak test executes sustained 200 req/s for 1 hour; memory heap remains flat (no memory leaks); PostgreSQL connection pool never starves; error rate remains < 0.1%.",
            "contracts": "Soak test script in loadtests/soak-test.js.",
            "commands": [
                "Author loadtests/soak-test.js maintaining sustained 200 req/s mixed browse and checkout workload.",
                "Record Node.js heap used at 5-minute intervals using process.memoryUsage().heapUsed.",
                "Query pg_stat_activity and pg_locks every minute for lock wait duration and active transactions.",
                "Assert heap usage stabilizes after initial warm-up without continuous upward slope.",
                "Assert zero database connection pool timeouts.",
                "Document memory profile and connection pool graphs in docs/benchmarks/soak-analysis.md."
            ],
            "data_changes": "None in schema; exercises database and API over extended duration.",
            "security": "Monitors connection exhaustion defenses under sustained traffic.",
            "error_handling": "Soak runner alerts immediately if error rate exceeds 0.5% during execution.",
            "edge_cases": [
                "Long-running transaction holding locks (detects and terminates idle-in-transaction connections > 30s)"
            ],
            "observability": "Heap snapshots, active pool connections, and lock wait histograms.",
            "unit_tests": ["None."],
            "integration_tests": ["None."],
            "e2e_tests": ["None."],
            "security_tests": ["None."],
            "manual_verification": "Execute 'pnpm loadtest:soak'; observe terminal memory curve remains flat over 1-hour run.",
            "risk_level": "MEDIUM",
            "review_requirements": "Single thorough review pass focusing on memory leak detection and connection pool configuration. Documented in docs/reviews/t083-context.md.",
            "commit": "test(load): execute sustained soak test and postgresql connection pool analysis"
        },
        {
            "id": "084",
            "name": "Assemble Honest Benchmark Evidence",
            "status": "PLANNED",
            "goal": "Compile all raw k6 metrics, EXPLAIN ANALYZE query plans, Lighthouse audits, and chaos results into docs/benchmarks.md with transparent disclosures of hardware and limitations.",
            "why": "Fulfills portfolio success criteria: a reviewer can clone the repo, run make seed-l && make test-benchmarks, and reproduce every claim in the documentation.",
            "requirements": ["G1", "G2", "G3", "G4", "G5", "G6", "PRD Section 1.4"],
            "blocked_by": ["TASK-070", "TASK-071", "TASK-072", "TASK-073", "TASK-078", "TASK-079", "TASK-080", "TASK-081", "TASK-082", "TASK-083"],
            "blocks": ["TASK-089", "TASK-090"],
            "architecture": ["ARCHITECTURE.md -> First bottleneck and scaling path", "01-ecommerce-marketplace-PRD.md Section 1.4"],
            "skills": [
                {
                    "name": "documentation-and-adrs",
                    "location": "skills/agent-skills-main/skills/documentation-and-adrs/SKILL.md",
                    "why": "Governs technical documentation rigor and transparent benchmark reporting.",
                    "instructions": ["Disclose exact host hardware and CPU specs", "Include raw JSON data alongside graphs", "Never hide or invent numbers"]
                }
            ],
            "inspect_files": [
                "docs/benchmarks.md",
                "loadtests/results/",
                "docs/benchmarks/query-plans.md"
            ],
            "current_behavior": "Benchmark results are scattered across individual task review contexts without a single unified, reproducible benchmark report.",
            "required_behavior": "docs/benchmarks.md compiles all verified results: hardware specifications, Tier L seed timings, p95 browse/search/checkout latencies, flash-sale concurrency proof, chaos recovery times, and honest limitations.",
            "contracts": "Authoritative benchmark document in docs/benchmarks.md.",
            "commands": [
                "Create docs/benchmarks.md summarizing all performance and reliability proof.",
                "Include host machine specs (OS, CPU cores, RAM, Docker version).",
                "Embed table comparing PRD Section 7 SLO targets against actual measured results.",
                "Include EXPLAIN ANALYZE snippet proving keyset pagination index scan.",
                "Include k6 flash-sale summary proving exactly 50 orders / 0 oversold units.",
                "Document known limitations and first bottlenecks.",
                "Provide one-command reproduction script: pnpm benchmark:all."
            ],
            "data_changes": "None.",
            "security": "Ensures all benchmark data is auditable and reproducible.",
            "error_handling": "Any unmet SLO must be labeled UNVERIFIED or FAILED, never falsely marked passed.",
            "edge_cases": [
                "Benchmark run on lower-spec machine (includes instructions on scaling down virtual users for 4GB hosts)"
            ],
            "observability": "Complete benchmark summary report.",
            "unit_tests": ["None."],
            "integration_tests": ["None."],
            "e2e_tests": ["None."],
            "security_tests": ["None."],
            "manual_verification": "Review docs/benchmarks.md; verify every table references raw data in loadtests/results/ with commit SHA.",
            "risk_level": "LOW",
            "review_requirements": "Single review pass focusing on honesty, accuracy, and reproducibility of benchmark claims. Documented in docs/reviews/t084-context.md.",
            "commit": "docs(benchmarks): assemble authoritative benchmark evidence and reproducible results"
        }
    ]
