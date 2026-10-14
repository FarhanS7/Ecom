# Hints: Search projections, facets, and eventual consistency

Read one hint at a time. Stop when you can make the next experiment yourself.

## Hint 1

Treat deletion/visibility as versioned state, not absence with no history.

## Hint 2

Count facets using the same security scope as item queries.

## Hint 3

Use a rebuild watermark/catch-up protocol; a bulk copy alone is not a safe reindex.

Return to [the challenge](../challenges/05-search.md). The [solution reasoning](../solutions/05-search.md) is separate so it does not spoil the attempt by default.
