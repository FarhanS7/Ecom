# Search and projections

Status: proposed module specification. Module ID: **search**.

## Responsibility

Search documents, full-text/trigram querying, filtered facets, autocomplete, reindex, and optional OpenSearch adapter.

## Dependencies and boundary

Provider modules: catalog, inventory.

search(channel,query,filters,sort,cursor) returns items/facets/nextCursor from a versioned projection, then gates canonical visibility before response. Explicit AND filters; facets count within all other selected filters but exclude their own facet filter. Cache key includes complete normalized query and channel.

## Invariants

PostgreSQL FTS alone is not typo tolerance: include bounded pg_trgm fallback for sufficiently long queries. Projection source_version prevents stale overwrites. Visibility removal applies immediately through canonical filtering even before projection catches up. Display availability is advisory; checkout checks inventory.

## Acceptance scenarios

Typo query finds seeded target; store-only products never appear in marketplace facets/counts. Reindex into shadow projection, catch up events, compare counts/versions, then switch. Deletion/suspension does not resurrect via old events.

## Out of scope

Personalized ML ranking, multilingual search, unbounded wildcard queries.

## Implementation and learning

Task range: T030–T036, T081. Use the [task tracker](../../tasks/todo.md) for exact ordering/dependencies. Read [05-search lesson](../learning/lessons/05-search.md), or attempt its [challenge](../learning/challenges/05-search.md) first.

The [data model](../architecture/data-model.md), [API contracts](../architecture/api-contracts.md), and [event contracts](../architecture/events.md) define shared types and constraints. Each implementation must add positive, negative, and replay/concurrency checks appropriate to these scenarios; passing a unit mock alone is insufficient for database or browser claims.
