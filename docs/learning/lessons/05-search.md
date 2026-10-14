# Search projections, facets, and eventual consistency

Learning status: reference material for future implementation. Examples are reasoning sketches, not tested application code.

Related implementation: T030–T034, T081. Prerequisites: Catalog queries, events, and basic text normalization.

## Choose your route

Guided: read this lesson, implement the linked task, then attempt the [challenge](../challenges/05-search.md). Challenge-first: open that file now, use [hints](../hints/05-search.md) only if needed, then compare [solution reasoning](../solutions/05-search.md).

## Mental model

Search is a read model optimized for discovery. It can lag behind canonical data, so it must never become the authority for whether a product may be purchased. Full-text search and typo similarity are different matching strategies.

## Worked example

Product version 8 is unpublished, but delayed version 7 arrives afterward. A projection accepting every event blindly can resurrect it. Store the applied version and tombstone visibility; ignore older observations.

```
// Projection update rule sketch.
if (event.aggregateVersion <= projection.sourceVersion) return;
const canonical = await loadCurrentProduct(event.productId);
await writeProjectionIfNewer(canonical);
```

## Guided implementation

1. Seed spelling variants, store-only products, out-of-stock products and known facet counts.
2. Implement FTS query plus bounded trigram fallback rather than assuming FTS corrects typos.
3. Specify whether each facet includes/excludes its own selected filter; keep the same rule in both engines.
4. Apply canonical visibility before exposing results, counts, and suggestions.
5. Build shadow reindex with event catch-up and validate before switching readers.

Use [the task tracker](../../../tasks/todo.md) for the concrete implementation order. Do not implement a lesson's later-stage example before its task prerequisites are present.

## Common mistakes

Facets counting unauthorized products; using a projection's stock number at checkout; stale events overwriting newer data; reindex overwriting edits made during its scan; running OpenSearch before measuring a baseline.

## Explain it without looking

- Which consistency is acceptable for ranking but unacceptable for purchase availability?
- Why can facet counts leak unpublished data?
- How do you know a rebuilt index includes changes during rebuild?

Write answers in your own learning journal. Include one counterexample to the naive approach, a test that catches it, and a condition under which a different design would be better.

## Transfer exercise

Delete/archive the canonical product during a full reindex and prove no delayed event makes it public again.

## Reference

[PostgreSQL FTS](https://www.postgresql.org/docs/16/textsearch.html) and [pg_trgm](https://www.postgresql.org/docs/16/pgtrgm.html). Project-specific choices are explained in [architecture](../../../ARCHITECTURE.md); framework documentation does not establish that our future implementation passes its tests.
