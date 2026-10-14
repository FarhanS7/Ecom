# Full implementation roadmap

Status: proposed, ready for review. Ninety-one implementation tasks, eleven milestones, no fixed dates. Application implementation has not started.

## Start here

Read [scope](../docs/planning/scope.md), [confirmed decisions](../docs/planning/confirmed-decisions.md), and [architecture](../ARCHITECTURE.md). Review proposed defaults/ADRs in T001. Then use [tasks/todo.md](todo.md) as the sole status tracker. Each task has its own Markdown file with prerequisites, expected files, acceptance scenarios, verification and learning links.

## Milestones

| Milestone | Working outcome | Tasks |
| --- | --- | --- |
| [0. Foundation](phases/00-foundation.md) | A reproducible workspace, small Docker environment, real database tests, and web/API skeleton. | T001–T008 |
| [1. Identity and stores](phases/01-identity-stores.md) | One global customer identity, scoped staff membership, seller approval, and two themed storefronts. | T009–T018, T091 |
| [2. Catalog and storefront](phases/02-catalog-storefront.md) | Real products can be authored, published per channel, browsed, filtered, and viewed through accessible UI. | T019–T028 |
| [3. Events, search, and media](phases/03-events-search-media.md) | Durable async delivery, typo-tolerant search, safe reindexing, scoped caching, and usable product images. | T029–T036 |
| [4. Carts and shared inventory](phases/04-carts-inventory.md) | Independent channel carts and a stock pool that survives simultaneous buyers and reservation expiry. | T037–T044 |
| [5. Checkout and mock payments](phases/05-checkout-payments.md) | Retry-safe multi-seller checkout, signed callbacks, compensation, and provable one-charge behavior. | T045–T054 |
| [6. Fulfillment and after-sales](phases/06-fulfillment-returns.md) | Independent seller fulfillment, customer history, cancellations, returns, refunds, and invoices. | T055–T062 |
| [7. Engagement and administration](phases/07-engagement-admin.md) | Coupons, reviews, wishlists, dashboards, team management, support workflows, and simulated settlements. | T063–T070 |
| [8. Reliability and quality](phases/08-reliability-quality.md) | Observable failures, tested recovery, authorization regression coverage, and accessible complete journeys. | T071–T076 |
| [9. Performance and scale evidence](phases/09-performance-evidence.md) | Deterministic large data, query/engine experiments, load/soak results, and honest benchmark reporting. | T077–T084 |
| [10. Release and portfolio](phases/10-release-portfolio.md) | Restoration/deployment rehearsals, independent review, reproducible demo, and production handoff. | T085–T090 |

## Dependency strategy

Foundation enables small vertical slices: registration through UI, seller approval through storefront, product editing through public listing, reservation through checkout, then fulfillment through reporting. Do not build every database table or every UI page before integrating a flow.

The [module map](../docs/architecture/module-map.md) is acyclic; task dependencies are listed individually. Schema changes are sequential. Independent UI can use agreed contracts, but final acceptance requires real API integration.

## Working rhythm

1. Pick the first dependency-ready task.
2. Choose guided lesson or challenge-first route.
3. Write a failing behavior test; implement narrowly.
4. Verify the feature, commit, and prepare review context.
5. Obtain the required fresh-session independent review; fix verified findings.
6. Explain the code and complete a variation exercise.
7. Update tracker/evidence and move to the next task.

No week estimates are imposed: the user chose a flexible pace. Revisit sizing after the first milestone using actual effort. Checkpoint after two or three tasks; deep concurrency lessons can take as long as needed.

## Resource policy

[Windows/Docker guide](../docs/operations/local-development.md) defines minimal and optional profiles. Start with Tier S. Do not run 100k-product data, OpenSearch, full telemetry, builds, and browser/load workers together by default on the 8 GB host. Scale targets require measured evidence; a reduced smoke run is not a Tier L pass.

## Required versus stretch

All PRD P0/P1 requirements and confirmed product additions are covered by [traceability](../docs/planning/traceability.md). T076 covers P2 extensions and can remain open without blocking the core demo. T081/T082 are explicit engine/scaling learning experiments; record their outcome or resource block. A portfolio demo with unverified scale targets must be labeled accordingly, not declared fully PRD-complete.

## Risks and mitigations

| Risk | Mitigation / early proof |
| --- | --- |
| Shared stock across channels | T037–T044 prove invariants before payment integration |
| Tenant data leakage | T014/T018 scope tests, later full route/cache regression |
| Unknown payment outcomes | Persistent simulator, stable effect keys, reconciliation |
| Overbuilt infrastructure | Optional Compose profiles and host app processes |
| Scope fatigue | Milestones yield working behavior; no calendar deadline |
| Learning becomes copying | Separate challenges/solutions and explanation checkpoints |
| Documentation diverges from implementation | Update affected spec/ADR/traceability in the same task |

## Finish

The demo closes only with reproducible setup, evidence-backed claims, reviewed behavior, and documented limitations. Real-money work follows the separate [production roadmap](../docs/production/roadmap.md); no production integration is implied by finishing the mock demo.
