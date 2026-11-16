def get_tasks():
    return [
        {
            "id": "071",
            "name": "Trace Requests Through API and Workers",
            "status": "PLANNED",
            "goal": "Instrument OpenTelemetry distributed tracing propagating W3C traceparent context across Fastify HTTP routes, outbox relay, and BullMQ worker consumers.",
            "why": "Provides end-to-end visibility into asynchronous order pipelines, search indexing latency, and cross-process bottlenecks.",
            "requirements": ["G6", "PRD Section 1.2", "PRD Section 3"],
            "blocked_by": ["TASK-005", "TASK-029", "TASK-050"],
            "blocks": ["TASK-072", "TASK-084"],
            "architecture": ["ARCHITECTURE.md -> Observability", "docs/modules/operations.md"],
            "skills": [
                {
                    "name": "observability-and-instrumentation",
                    "location": "skills/agent-skills-main/skills/observability-and-instrumentation/SKILL.md",
                    "why": "Governs OpenTelemetry SDK configuration and W3C trace propagation.",
                    "instructions": ["Propagate traceparent headers across outbox envelopes", "Sample at 100% in development and 10% under load"]
                }
            ],
            "inspect_files": [
                "apps/api/src/main.ts",
                "apps/worker/src/main.ts",
                "packages/backend/src/platform/outbox.service.ts"
            ],
            "current_behavior": "API requests generate X-Request-Id, but traces are not propagated into BullMQ worker jobs or Jaeger exporters.",
            "required_behavior": "OpenTelemetry SDK instruments HTTP handlers, PostgreSQL queries, Redis operations, and BullMQ workers, linking user checkout requests to background outbox and projection spans.",
            "contracts": "W3C TraceContext: traceparent: 00-{traceId}-{spanId}-01.",
            "commands": [
                "Install @opentelemetry/sdk-node and auto-instrumentations in packages/backend.",
                "Configure tracer in apps/api/src/tracing.ts and apps/worker/src/tracing.ts.",
                "Inject traceparent into outbox record envelope (correlationId, causationId).",
                "Extract traceparent in BullMQ worker and start child span for job execution.",
                "Configure optional compose.telemetry.yml running Jaeger.",
                "Write tracing integration tests verifying trace ID continuity."
            ],
            "data_changes": "None in schema; outbox envelope includes correlationId and causationId.",
            "security": "Traces redact customer passwords, authorization tokens, and personal address details.",
            "error_handling": "Tracing failures must never crash business requests or worker job execution.",
            "edge_cases": [
                "Incoming request with invalid or malformed traceparent header (generates fresh root trace ID)"
            ],
            "observability": "Exports OTLP spans to local console or Jaeger collector.",
            "unit_tests": [
                "packages/backend/src/platform/tracer.test.ts (trace context injection and extraction)"
            ],
            "integration_tests": [
                "tests/integration/tracing.spec.ts (initiate checkout; assert outbox job carries same traceId as HTTP request)"
            ],
            "e2e_tests": ["None."],
            "security_tests": [
                "Assert sensitive headers are stripped from trace span attributes"
            ],
            "manual_verification": "Trigger checkout; inspect Jaeger UI (or console trace exporter); verify unbroken span tree from POST /v1/checkout to order worker.",
            "risk_level": "LOW",
            "review_requirements": "Single review pass focusing on zero performance impact on request thread. Documented in docs/reviews/t071-context.md.",
            "commit": "feat(ops): instrument opentelemetry distributed tracing across api and workers"
        },
        {
            "id": "072",
            "name": "Add Metrics Dashboards and Alerts",
            "status": "PLANNED",
            "goal": "Build Prometheus metrics exporter at /metrics and define alert rules for queue lag (>30s), error rate (>0.5%), and p95 latency breaches.",
            "why": "Provides real-time system health telemetry and ensures operators are alerted to failures before customers report them.",
            "requirements": ["G6", "PRD Section 1.2", "PRD Section 7"],
            "blocked_by": ["TASK-071"],
            "blocks": ["TASK-084", "TASK-087"],
            "architecture": ["ARCHITECTURE.md -> Observability", "docs/modules/operations.md"],
            "skills": [
                {
                    "name": "observability-and-instrumentation",
                    "location": "skills/agent-skills-main/skills/observability-and-instrumentation/SKILL.md",
                    "why": "Governs Prometheus metrics definitions, histograms, and alert threshold rules.",
                    "instructions": ["Use bounded label cardinality (never put order_id in metric labels)", "Define SLO alert rules"]
                }
            ],
            "inspect_files": [
                "apps/api/src/main.ts",
                "apps/worker/src/main.ts",
                "infra/compose.telemetry.yml"
            ],
            "current_behavior": "GET /metrics is unconfigured; system relies on stdout logs without aggregated rate, error, or duration metrics.",
            "required_behavior": "GET /metrics exposes Prometheus metrics; tracks HTTP request durations, active stock reservations, outbox queue lag, and DB pool saturation; alert thresholds documented.",
            "contracts": "Prometheus text format at /metrics. Alert rules in infra/prometheus/alerts.yml.",
            "commands": [
                "Install prom-client in packages/backend.",
                "Build MetricsService tracking: http_request_duration_seconds, active_checkout_reservations, outbox_lag_seconds, db_pool_active_connections.",
                "Expose GET /metrics endpoint in apps/api and apps/worker.",
                "Author alert rules for: OutboxLagHigh (>30s), HttpErrorRateHigh (>0.5%), PostgresPoolSaturated (>80%).",
                "Provide Grafana dashboard JSON in infra/grafana/dashboards/shopscale-overview.json.",
                "Write metrics collection unit tests."
            ],
            "data_changes": "None.",
            "security": "Metrics endpoint restricted to internal network or authenticated scraping in production.",
            "error_handling": "Metrics scrapers handle process boot without division-by-zero errors on empty counters.",
            "edge_cases": [
                "Label explosion (strictly disallow dynamic user IDs or URLs with query parameters in metric labels)"
            ],
            "observability": "Self-monitoring metrics exporter.",
            "unit_tests": [
                "packages/backend/src/platform/metrics.service.test.ts (label validation, histogram bucket boundaries)"
            ],
            "integration_tests": [
                "tests/integration/metrics.spec.ts (execute 10 requests; scrape /metrics; verify counter increments)"
            ],
            "e2e_tests": ["None."],
            "security_tests": [
                "Assert metrics output contains zero customer PII or token values"
            ],
            "manual_verification": "Curl http://localhost:3001/metrics; verify Prometheus text output renders active gauges and histograms.",
            "risk_level": "LOW",
            "review_requirements": "Single review pass focusing on label cardinality safety. Documented in docs/reviews/t072-context.md.",
            "commit": "feat(ops): add prometheus metrics exporter and operational alert definitions"
        },
        {
            "id": "073",
            "name": "Run Failure Recovery and Broker-Loss Tests",
            "status": "PLANNED",
            "goal": "Build automated chaos engineering test suite: killing worker processes mid-order and crashing Redis/broker to prove zero lost orders and recovery under 60 seconds.",
            "why": "Provides indisputable proof of PRD Goal G5 (Order pipeline survives failures; kill worker mid-flow; system recovers).",
            "requirements": ["G5", "NFR-011", "PRD Section 1.2"],
            "blocked_by": ["TASK-029", "TASK-050", "TASK-052", "TASK-061"],
            "blocks": ["TASK-084", "TASK-087"],
            "architecture": ["ARCHITECTURE.md -> Core correctness rules", "DECISIONS.md -> DEC-006"],
            "skills": [
                {
                    "name": "test-driven-development",
                    "location": "skills/agent-skills-main/skills/test-driven-development/SKILL.md",
                    "why": "Governs precise injection of process crashes and recovery verification.",
                    "instructions": ["Simulate process SIGKILL between enqueue and receipt", "Assert order completes within 60s of restart"]
                }
            ],
            "inspect_files": [
                "apps/worker/src/relay/outbox-relay.ts",
                "apps/worker/src/consumers/order-completion.consumer.ts",
                "loadtests/chaos.js"
            ],
            "current_behavior": "Not implemented. No automated chaos tests prove pipeline recovery under unexpected process crashes.",
            "required_behavior": "When worker is abruptly killed (SIGKILL) mid-checkout, outbox relay lease expires, restarted worker re-polls unacknowledged records, and order completes with zero duplicated side effects in < 60s.",
            "contracts": "Chaos test scenario script in tests/chaos/worker-crash.spec.ts.",
            "commands": [
                "Author chaos test harness in tests/chaos/worker-crash.spec.ts.",
                "Initiate 20 simultaneous orders.",
                "Inject SIGKILL into worker process while outbox records are in LEASED state.",
                "Restart worker process.",
                "Assert outbox relay re-claims expired leases with FOR UPDATE SKIP LOCKED.",
                "Assert all 20 orders reach terminal PAID status with invoices generated in MinIO within 60 seconds.",
                "Assert zero duplicate financial entries or double stock decrements.",
                "Document recovery metrics in docs/reviews/t073-context.md."
            ],
            "data_changes": "None in schema; exercises outbox, orders, inventory, and consumer_receipts.",
            "security": "Proves system durability against infrastructure outages and spot instance termination.",
            "error_handling": "System gracefully re-establishes PostgreSQL and Redis connection pools upon restart.",
            "edge_cases": [
                "Redis jobs database flushed while PostgreSQL retains outbox records (outbox reconciliation re-enqueues jobs cleanly)"
            ],
            "observability": "Records crash_recovery_duration_seconds metric.",
            "unit_tests": ["None."],
            "integration_tests": [
                "tests/chaos/worker-crash.spec.ts (automated SIGKILL and restart pipeline recovery test)"
            ],
            "e2e_tests": ["None."],
            "security_tests": ["None."],
            "manual_verification": "Execute 'pnpm test:chaos'; observe terminal output proving all orders recover to PAID state after worker kill.",
            "risk_level": "HIGH",
            "review_requirements": "Multiple review passes on lease timeout duration and idempotency deduplication. Documented in docs/reviews/t073-context.md.",
            "commit": "test(chaos): prove order pipeline recovery and zero event loss after worker crash"
        },
        {
            "id": "074",
            "name": "Complete Security Regression Coverage",
            "status": "PLANNED",
            "goal": "Build comprehensive security regression test suite covering authorization matrix, SQL injection, IDOR, brute-force bypass, and CSRF protection.",
            "why": "Provides complete verification of platform security requirements and guarantees zero regression before release.",
            "requirements": ["G4", "PRD Section 5.1", "PRD Section 5.2", "SECURITY_PLAN.md"],
            "blocked_by": ["TASK-018", "TASK-060", "TASK-069"],
            "blocks": ["TASK-088"],
            "architecture": ["ARCHITECTURE.md -> Authorization", "SECURITY_PLAN.md"],
            "skills": [
                {
                    "name": "security-and-hardening",
                    "location": "skills/agent-skills-main/skills/security-and-hardening/SKILL.md",
                    "why": "Governs automated penetration testing, IDOR validation, and security regression suites.",
                    "instructions": ["Test IDOR on every resource ID parameter", "Assert SQL injection fuzzing returns zero syntax errors"]
                }
            ],
            "inspect_files": [
                "packages/backend/src/stores/permissions.test.ts",
                "packages/backend/src/platform/security.ts",
                "SECURITY_PLAN.md"
            ],
            "current_behavior": "Basic authorization matrix test covers early routes; new routes in commerce, fulfillment, and refunds require full regression coverage.",
            "required_behavior": "Automated security suite tests 100% of declared routes against all roles; attempts IDOR parameter tampering; tests SQL injection payloads; asserts 100% pass rate.",
            "contracts": "Security regression suite in tests/security/security-regression.spec.ts.",
            "commands": [
                "Expand authorization matrix harness to include all Milestone 3–7 routes (refunds, fulfillment, returns, coupons, settings).",
                "Add IDOR fuzzing test: submit requests replacing {storeId}, {orderId}, {addressId} with IDs from another user/store.",
                "Assert every unauthorized access returns 401, 403, or uniform 404.",
                "Add SQL injection fuzzing suite testing tsquery and filter parameters.",
                "Write test asserting CSRF token mismatch rejects mutating browser requests.",
                "Execute full security suite and document report in docs/reviews/t074-context.md."
            ],
            "data_changes": "None.",
            "security": "Enforces complete defense-in-depth across the application API.",
            "error_handling": "All security violations return standard RFC 7807 problem details without leaking internal system state.",
            "edge_cases": [
                "Support agent attempting to refund $200.01 (blocked by policy cap check)",
                "Seller 1 attempting to view Seller 2's fulfillment events (blocked with 404)"
            ],
            "observability": "Security regression audit summary.",
            "unit_tests": ["None."],
            "integration_tests": [
                "tests/security/security-regression.spec.ts (100% route x role matrix, IDOR resistance, SQL injection fuzzing, CSRF validation)"
            ],
            "e2e_tests": ["None."],
            "security_tests": [
                "Full automated security regression suite execution"
            ],
            "manual_verification": "Run 'pnpm test:security'; verify all security assertions pass with zero failures.",
            "risk_level": "HIGH",
            "review_requirements": "Multiple review passes on permission coverage and uniform 404 enforcement. Documented in docs/reviews/t074-context.md.",
            "commit": "test(security): complete comprehensive authorization matrix and idor regression suite"
        },
        {
            "id": "075",
            "name": "Complete Accessibility and Responsive Verification",
            "status": "PLANNED",
            "goal": "Audit and verify storefront and console interfaces for WCAG 2.1 AA compliance, keyboard navigation, screen reader ARIA labels, and responsive mobile viewports.",
            "why": "Guarantees that all user interfaces are completely accessible to people with disabilities and render cleanly across mobile and desktop devices.",
            "requirements": ["design.md", "PRD Section 3"],
            "blocked_by": ["TASK-023", "TASK-025", "TASK-026", "TASK-048", "TASK-057"],
            "blocks": ["TASK-080", "TASK-088"],
            "architecture": ["ARCHITECTURE.md -> Frontend", "design.md"],
            "skills": [
                {
                    "name": "design-system-compliance",
                    "location": "skills/reticle-main/skills/design-system-compliance/SKILL.md",
                    "why": "Enforces WCAG 2.1 AA contrast ratios, focus rings, and design token compliance.",
                    "instructions": ["Verify 4.5:1 text contrast ratio", "Ensure all interactive elements have visible focus rings"]
                },
                {
                    "name": "frontend-ui-engineering",
                    "location": "skills/agent-skills-main/skills/frontend-ui-engineering/SKILL.md",
                    "why": "Governs responsive viewports (320px mobile to 1440px desktop) and ARIA attributes.",
                    "instructions": ["Test keyboard tab order across checkout", "Verify screen reader accessibility tree"]
                }
            ],
            "inspect_files": [
                "apps/web/src/app/layout.tsx",
                "apps/web/src/components/ui/button.tsx",
                "apps/web/src/features/checkout/checkout-form.tsx"
            ],
            "current_behavior": "Components follow design tokens, but formal axe-core automated audits and responsive viewport tests have not been executed across all new pages.",
            "required_behavior": "All pages pass axe-core automated accessibility audits with zero violations; support full keyboard navigation without mouse; render cleanly on 375px mobile viewports without horizontal scroll.",
            "contracts": "Playwright accessibility specs using @axe-core/playwright.",
            "commands": [
                "Install @axe-core/playwright in apps/web.",
                "Author Playwright accessibility tests in tests/e2e/accessibility.spec.ts scanning: Home, Category PLP, PDP, Cart Drawer, Checkout, Account, Seller Console.",
                "Assert 0 violations for critical, serious, or moderate WCAG 2.1 AA rules.",
                "Verify color contrast ratios meet 4.5:1 for normal text and 3:1 for large text across all store themes.",
                "Test mobile viewports (375x667 iPhone SE) ensuring no horizontal overflow.",
                "Document audit findings in docs/reviews/t075-context.md."
            ],
            "data_changes": "None.",
            "security": "Ensures public interfaces adhere to accessibility standards.",
            "error_handling": "Accessibility scanner reports exact DOM node selector and rule ID on failure.",
            "edge_cases": [
                "Custom store theme with light background and low-contrast text (theme validator enforces minimum contrast ratio)"
            ],
            "observability": "Accessibility audit score in CI summary.",
            "unit_tests": ["None."],
            "integration_tests": ["None."],
            "e2e_tests": [
                "tests/e2e/accessibility.spec.ts (run axe-core across 7 core pages; assert 0 WCAG violations; test keyboard tab order)"
            ],
            "security_tests": ["None."],
            "manual_verification": "Navigate checkout using only Tab, Shift+Tab, and Enter keys; verify all inputs, buttons, and radio controls are operable.",
            "risk_level": "LOW",
            "review_requirements": "Single review pass focusing on axe-core audit output and focus rings. Documented in docs/reviews/t075-context.md.",
            "commit": "test(a11y): complete wcag 2.1 aa accessibility audit and responsive viewport tests"
        },
        {
            "id": "076",
            "name": "Add Low-Stock and Feature-Flag Extensions",
            "status": "PLANNED",
            "goal": "Build low-stock seller notification worker (PRD P2: IN-5) and database-driven feature flag engine supporting store allowlists and gradual rollouts (PRD P2: AD-4).",
            "why": "Completes PRD P2 stretch goals without compromising core V1 stability.",
            "requirements": ["IN-5", "AD-4", "PRD Section 6.3", "PRD Section 6.7"],
            "blocked_by": ["TASK-037", "TASK-029"],
            "blocks": ["TASK-088"],
            "architecture": ["ARCHITECTURE.md -> System shape", "docs/modules/platform.md"],
            "skills": [
                {
                    "name": "api-and-interface-design",
                    "location": "skills/agent-skills-main/skills/api-and-interface-design/SKILL.md",
                    "why": "Governs feature flag evaluation port and low-stock alert events.",
                    "instructions": ["Default feature flags to false", "Support store-scoped allowlists"]
                }
            ],
            "inspect_files": [
                "packages/backend/src/inventory/inventory.service.ts",
                "packages/backend/src/platform/security.ts",
                "docs/architecture/data-model.md"
            ],
            "current_behavior": "Low-stock conditions do not alert sellers; feature toggles are hardcoded.",
            "required_behavior": "When available stock drops below threshold (default 5), LowStockAlert event is emitted to notify seller; FeatureFlagService evaluates flag state per store and percentage rollout.",
            "contracts": "feature_flags: (key text PK, enabled boolean, store_allowlist JSONB, version int). FeatureFlagPort.isEnabled(flagKey, storeId).",
            "commands": [
                "Author migration db/migrations/0025-feature-flags.sql creating feature_flags table.",
                "Implement FeatureFlagService in packages/backend/src/platform/feature-flag.service.ts.",
                "Hook InventoryService: emit LowStockAlert outbox event when available stock <= 5 units.",
                "Build worker consumer sending low-stock notification to store owner.",
                "Expose admin feature flag toggle endpoints in PlatformAdminController.",
                "Write unit and integration tests."
            ],
            "data_changes": "Creates feature_flags table in migration 0025-feature-flags.sql.",
            "security": "Feature flag modifications restricted strictly to platform administrators; audited in audit_logs.",
            "error_handling": "Feature flag evaluation defaults to disabled (false) if database is unreachable or key is missing.",
            "edge_cases": [
                "Variant already below threshold receives another purchase (throttles duplicate alerts to 1 per 24 hours)"
            ],
            "observability": "Tracks feature flag evaluation counts and active alert notifications.",
            "unit_tests": [
                "packages/backend/src/platform/feature-flag.service.test.ts (store allowlist evaluation, default off)"
            ],
            "integration_tests": [
                "tests/integration/low-stock-alert.spec.ts (reserve stock dropping available to 3; verify LowStockAlert event emitted)"
            ],
            "e2e_tests": ["None."],
            "security_tests": [
                "Assert non-admin cannot toggle feature flags"
            ],
            "manual_verification": "Sell item down to 2 units; verify seller notification ledger records Low Stock warning.",
            "risk_level": "LOW",
            "review_requirements": "Single review pass. Documented in docs/reviews/t076-context.md.",
            "commit": "feat(platform): implement low-stock alert worker and administrative feature flags"
        }
    ]
