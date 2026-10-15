# Catalog and publication

Status: proposed module specification. Module ID: **catalog**.

## Responsibility

Products, variants, categories, channel visibility, price source, safe assets, and publication events.

## Dependencies and boundary

Provider modules: stores.

getPurchasableVariants(channel,variantIds,tx) returns canonical active variants with prices/store IDs or a typed unavailable result. Catalog mutation emits versioned events in the same transaction. Store publication and marketplace publication are separate flags.

## Invariants

Store scope is checked on every nested variant and asset. Prices come from variant records; product minimum price is derived. Slugs are unique within a store, SKU within a store. Category parent updates reject cycles. Public reads recheck store/product/publication status.

Lifecycle (T027a, [ADR-0010](../../docs/decisions/0010-seller-catalog-publishing.md)): `draft → active` requires at least one ACTIVE variant, applied inside the product's versioned write so a refused publish rolls back completely; `archived` is terminal and only reachable through the archive route.

## Acceptance scenarios

Unlisting a product from marketplace keeps store visibility if enabled. Archive preserves old order snapshots. Concurrent edits with same version produce one success and one conflict. Cursor price ties remain deterministic.

## Out of scope

Digital products, subscriptions, bulk supplier ingestion beyond the scoped CSV validation lab.

## Implementation and learning

Task range: T019–T028, T033, T035–T036. Use the [task tracker](../../tasks/todo.md) for exact ordering/dependencies. Read [04-catalog lesson](../learning/lessons/04-catalog.md), or attempt its [challenge](../learning/challenges/04-catalog.md) first.

The [data model](../architecture/data-model.md), [API contracts](../architecture/api-contracts.md), and [event contracts](../architecture/events.md) define shared types and constraints. Each implementation must add positive, negative, and replay/concurrency checks appropriate to these scenarios; passing a unit mock alone is insufficient for database or browser claims.
