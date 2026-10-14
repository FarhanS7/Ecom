# Product scope and proposed defaults

Status: implementation proposal. Confirmed choices are in [the decision record](confirmed-decisions.md). Defaults below are concrete recommendations, not statements of user approval.

## Completion levels

| Level | Meaning | Exit evidence |
| --- | --- | --- |
| Walking skeleton | A shopper can browse seeded content through the web and API | Browser smoke test, migration, Tier S seed |
| Transactional demo | Shared stock, channel carts, retry-safe mock payment, seller fulfillment | Real PostgreSQL concurrency and cross-store tests |
| Portfolio demo | All PRD P0 and P1 features plus agreed store features, accessible UI, operational evidence | Traceability matrix, review records, measured results |
| Scale proof | Original Tier L performance targets are exercised and reported | Hardware record, raw k6 data, query plans; failures stay visible |
| Production | A separate real-money operating product | Gates in [production roadmap](../production/roadmap.md) |

Do not call the portfolio complete while required behavior is absent. If resource limits prevent scale proof, label that milestone blocked or unverified, not passed.

## Proposed demo defaults

- English interface and learning documents; USD only; all money stored as integer cents.
- Physical products with variants. One business owns one store; each store has owner, manager, catalog editor, and fulfillment staff roles.
- A person can shop and hold staff memberships. Platform roles and store roles are separate, not mutually exclusive account types.
- Marketplace at /; branded stores at /stores/{slug}. Shared origin simplifies demo identity. Custom domains and cross-domain SSO are production-roadmap work.
- Marketplace basket can contain many sellers; a store basket contains only its store. No cross-channel cart merging.
- Multi-seller checkout is all-or-nothing for initial reservation and one mock payment; fulfillment splits into seller suborders immediately.
- Deterministic signed mock payment gateway; no real money, card collection, or required external payment account.
- Fixed disclosed demo shipping per seller suborder (initial fixture: 500 cents), charged once per seller; tax shown as not modeled in this demo. This is not a claim of tax compliance.
- Simulated shipping updates. Refunds use mock money; seller payout records are accounting demonstrations, not bank transfers.
- Guest carts supported in the portfolio milestone; checkout requires login. Login merges only the same channel's guest cart.
- Returns modeled as request/approval/rejection/received/refunded. Restocking requires an explicit inspection result.
- Public reviews require a delivered purchase; fully refunded purchases cannot create new reviews. Existing reviews remain with a purchase-status indicator.
- Demo notification adapters store email/SMS deliveries locally; provider integrations are deferred.
- Store logos use safe raster uploads initially; raw SVG uploads remain disabled until a sanitizer and its tests are implemented.
- Account deletion, store ownership transfers, multiple stores per business, subscriptions, digital goods, international taxes, and real carrier integrations are outside the demo.

## Product scope extensions beyond the original PRD

Store routing/theming, memberships, invitations, channel publication, wishlists, homepage content, store-specific order history, and return requests get explicit tasks. Seller suborders move from P1 to the transactional demo because marketplace checkout spans sellers.

## Open items that do not block this proposal

CPU, Docker memory allocation, eventual host, production country, provider, legal entity, and budget are unknown. Do not invent them. Deployment documentation uses a provider-neutral demo profile; production integrations have discovery gates.

## Change control

A changed product decision updates this file, the affected ADR/module spec, task dependencies, and traceability together. Keep task IDs stable and record superseded decisions rather than deleting history.
