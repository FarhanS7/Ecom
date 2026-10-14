# Requirements reconciliation

This document runs the source framework's Phase -1 sanity check. Questions below have explicit proposed resolutions so the plan can be reviewed without hidden assumptions.

| Issue / question | Evidence | Proposed resolution |
| --- | --- | --- |
| Is the product multi-vendor or multi-tenant? | PRD vs design title | Both; one store per business, shared marketplace, scoped store resources. Confirmed by user. |
| Does a customer need separate accounts? | Source documents do not specify | Shared identity, separate channel carts. Confirmed. |
| Which stack? | PRD offers three | TypeScript/NestJS/Next.js. Confirmed. |
| Search p95 below 150 or 200 ms? | PRD G1 vs section 7 | Use stricter 150 ms as portfolio target; retain 200 ms source baseline in reporting. Do not silently relax G1. |
| What does reserved stock mean? | PRD sections 6.3 and 9 | available = on_hand - reserved; reservation increases reserved, confirmation decreases both. See inventory spec. |
| Are seller suborders optional? | OR-6 is P1 | Promote to transactional demo; one checkout payment, independent suborder fulfillment. |
| Are guests allowed carts? | RBAC says no; CA-2 names guest merge | Allow anonymous cart ownership only; checkout remains authenticated. Explicit amendment. |
| Where is order_items.created_at? | Index lists a missing column | Add it to the schema. |
| Where are replay hashes and consumer dedupe records? | PRD prose but absent in schema | Add idempotency_requests and consumer_receipts with durable unique keys. |
| Is raw SVG accepted? | Design requires sanitization | Raster-first demo, SVG acceptance only after a tested sanitization task/decision. |
| Is exact reference branding required? | HTML uses prohibited placeholder branding | Treat HTML as a visual reference; use seeded ShopScale/store data and design tokens. |
| Is OpenSearch required from day one? | CT-6 vs risk mitigation | Event-built PostgreSQL search projection first; OpenSearch comparison profile later, same search contract. |
| Can all services run on this laptop? | 8 GB host memory confirmed | Host app processes, minimal containers, optional profiles; measure rather than assume. |
| Are returns, wishlists, and storefront content in scope? | Personas/design mention them | Add module contracts and tasks; avoid decorative buttons without flows. |
| Are all reviews globally unique? | UNIQUE(product_id,user_id) | One review per customer per product, regardless of purchase channel. |
| Does reviewed code count as proven correct? | Framework language implies certainty | Reviews add evidence, not proof; required tests and runtime checks remain mandatory. |
| Must review end after three cycles? | Framework has inconsistent stopping language | After three cycles with unresolved critical/high findings, block release; never mark them resolved by exhaustion. |
| Which review model? | Framework explicitly names Opus 4.6 | Preserve its distinct-model/fresh-session requirement and named preference. If unavailable, record a blocker or request an explicit workflow amendment. No automatic substitutions or claims of independent review. |
| Are integrations tested only after merge? | Framework Phase 1.5 | Run focused integration on PR before merge; full heavier suites at milestone gates. This proposed strengthening avoids merging known integration failures. |

## Riskiest assumption

A shared stock pool can be sold simultaneously through multiple channels without confusing customers or leaking seller data. If cart, checkout, and tenant boundaries are wrong, both the data model and UI need rework. Test a two-store, two-channel scenario before building reporting or large-scale infrastructure.

## Unresolved production questions

Operating jurisdiction, tax calculation, payout liability, refund rules, merchant-of-record responsibility, custom domains, provider eligibility, privacy retention, hosting budget, and support coverage require answers before real-money launch. They do not block the isolated mock demo.
