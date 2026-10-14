# ShopScale documentation index

Start here. This is a **proposed implementation and learning package**, not a completed application or a passing test report.

## Recommended reading order

1. [Confirmed user decisions](planning/confirmed-decisions.md)
2. [Scope and proposed defaults](planning/scope.md)
3. [Requirements reconciliation](planning/requirements-reconciliation.md)
4. [Architecture overview](../ARCHITECTURE.md)
5. [Implementation roadmap](../tasks/plan.md)
6. [Learning guide](learning/README.md)
7. [First task: review the proposal](../tasks/items/T001.md)

## Planning

- [Traceability from every original requirement](planning/traceability.md)
- [Risks](planning/risk-register.md)
- [Sources and how they are used](planning/resources.md)
- [Task status tracker](../tasks/todo.md)

## Architecture and contracts

- [Module map](architecture/module-map.md)
- [Database model](architecture/data-model.md)
- [API contracts](architecture/api-contracts.md)
- [Event delivery contracts](architecture/events.md)
- [Frontend architecture](architecture/frontend.md)
- [Implementation conventions](architecture/conventions.md)

## Module specifications

- [Platform foundation](modules/platform.md)
- [Identity and sessions](modules/identity.md)
- [Stores and staff authorization](modules/stores.md)
- [Catalog and publication](modules/catalog.md)
- [Inventory and reservation accounting](modules/inventory.md)
- [Channel carts](modules/cart.md)
- [Payment effects and webhook receipts](modules/payments.md)
- [Checkout, orders, and after-sales](modules/commerce.md)
- [Coupons and limits](modules/promotions.md)
- [Search and projections](modules/search.md)
- [Reviews and wishlists](modules/engagement.md)
- [Notifications and documents](modules/notifications.md)
- [Reporting, audit, and administration](modules/reporting.md)
- [Reliability and delivery](modules/operations.md)

## Architecture decisions

- [Modular monolith and worker entry point](decisions/0001-modular-monolith.md)
- [PostgreSQL with Drizzle and explicit SQL](decisions/0002-data-access.md)
- [Store-scoped data with global customer identity](decisions/0003-stores-and-channels.md)
- [Cookie-carried access tokens and rotating refresh tokens](decisions/0004-sessions.md)
- [Reservation-based shared inventory](decisions/0005-inventory.md)
- [Outbox, BullMQ, and durable deduplication](decisions/0006-durable-jobs.md)
- [PostgreSQL search first, OpenSearch comparison later](decisions/0007-search.md)
- [Deterministic mock commerce before real integrations](decisions/0008-mock-commerce.md)
- [Resource-aware profiles without weaker correctness](decisions/0009-local-and-benchmarks.md)

## Implementation milestones

- [0. Foundation](../tasks/phases/00-foundation.md)
- [1. Identity and stores](../tasks/phases/01-identity-stores.md)
- [2. Catalog and storefront](../tasks/phases/02-catalog-storefront.md)
- [3. Events, search, and media](../tasks/phases/03-events-search-media.md)
- [4. Carts and shared inventory](../tasks/phases/04-carts-inventory.md)
- [5. Checkout and mock payments](../tasks/phases/05-checkout-payments.md)
- [6. Fulfillment and after-sales](../tasks/phases/06-fulfillment-returns.md)
- [7. Engagement and administration](../tasks/phases/07-engagement-admin.md)
- [8. Reliability and quality](../tasks/phases/08-reliability-quality.md)
- [9. Performance and scale evidence](../tasks/phases/09-performance-evidence.md)
- [10. Release and portfolio](../tasks/phases/10-release-portfolio.md)

Every task has its own Markdown file linked from its milestone and [task tracker](../tasks/todo.md).

## Testing and operations

- [Definition of done](testing/definition-of-done.md)
- [Test strategy](testing/strategy.md)
- [Role/resource permission matrix](testing/permission-matrix.md)
- [Benchmark protocol and original targets](testing/benchmark-plan.md)
- [Windows/Docker local development](operations/local-development.md)
- [Proposed commands](operations/commands.md)
- [Development, independent review and learning workflow](operations/development-workflow.md)
- [Draft runbooks](operations/runbooks.md)

## Learning and production

- [12 learning topics, each with lesson/challenge/hints/solution](learning/README.md)
- [Glossary](learning/glossary.md)
- [Journal template](learning/journal-template.md)
- [Separate production roadmap and eight gates](production/roadmap.md)

## Status vocabulary

Confirmed: explicitly chosen by the user. Proposed: recommended technical/product detail awaiting T001 disposition. Not started: implementation has not run. Passed/failed/not run: reserved for actual verification evidence. Future production: discovery and rollout beyond the mock demo.

Original PRD/design/framework and downloaded resources remain unchanged. Use [planning validation](planning/validation.md) for this document package's structural checks; it does not establish application correctness.
