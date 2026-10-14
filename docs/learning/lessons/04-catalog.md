# Relational modeling, snapshots, and stable pagination

Learning status: reference material for future implementation. Examples are reasoning sketches, not tested application code.

Related implementation: T019–T028, T078. Prerequisites: SELECT/JOIN, indexes, primary and foreign keys.

## Choose your route

Guided: read this lesson, implement the linked task, then attempt the [challenge](../challenges/04-catalog.md). Challenge-first: open that file now, use [hints](../hints/04-catalog.md) only if needed, then compare [solution reasoning](../solutions/04-catalog.md).

## Mental model

Catalog is mutable merchandising data; order lines are historical facts. An index supports a particular access pattern, not every query on its table. A cursor marks a position in a deterministic order; it is not just an encoded page number.

## Worked example

Three products cost 1000 cents. Sorting only by price cannot define which comes next. Sort by (price,id), and carry both values in the cursor. If an order was paid at 1000 cents, changing today's product price to 1200 must not alter the historical invoice.

```
-- Example ascending keyset query with bound parameters.
SELECT id, title, min_price_cents
FROM products
WHERE store_id = $1
  AND (min_price_cents, id) > ($2, $3)
ORDER BY min_price_cents ASC, id ASC
LIMIT $4;
```

## Guided implementation

1. Model product vs variant responsibilities and derive minimum product price from active variants.
2. Add composite store constraints and separate publication flags.
3. Write a list query with stable tie-breakers before choosing its index.
4. Bind cursor to channel, filter hash and sort; reject mismatched cursor reuse.
5. Compare EXPLAIN ANALYZE on a fixed seeded dataset, preserving query result equivalence.

Use [the task tracker](../../../tasks/todo.md) for the concrete implementation order. Do not implement a lesson's later-stage example before its task prerequisites are present.

## Common mistakes

Duplicating editable prices at product and variant level; assuming UUID alone protects ownership; index every column blindly; promising a stable historical snapshot across live changing catalog pages without a snapshot protocol.

## Explain it without looking

- What happens when price ties lack an ID tie-breaker?
- Why is a product's current title unsuitable as the only invoice title?
- What mutation anomalies remain possible with keyset pagination over live data?

Write answers in your own learning journal. Include one counterexample to the naive approach, a test that catches it, and a condition under which a different design would be better.

## Transfer exercise

Add descending popularity order and explain which tuple comparison and index direction changes.

## Reference

[Data model](../../architecture/data-model.md). Project-specific choices are explained in [architecture](../../../ARCHITECTURE.md); framework documentation does not establish that our future implementation passes its tests.
