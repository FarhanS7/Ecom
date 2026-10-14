# Solution reasoning: Search projections, facets, and eventual consistency

This is an expected approach, not a claim that the code is implemented, tested, or reviewed. Attempt [the challenge](../challenges/05-search.md) before reading.

## Reasoning

Maintain one projection record per product with source version and visibility. A consumer fetches current canonical product state and updates only when newer; tombstones retain the version needed to reject old events. Search applies normalized filters and scoped visibility before facets and result serialization. Reindex builds a shadow target from a known starting point, catches up changes, validates versions/counts and switches readers atomically. The SQL search adapter combines lexical FTS with bounded similarity fallback; OpenSearch must satisfy the same visibility/facet contract despite different ranking.

## Expected evidence

Final source_version is 3, marketplace never exposes the disabled product after canonical gating, duplicate delivery causes no duplicate document, and the known typo fixture returns an eligible target.

Record the actual outcome, command, environment and commit during implementation. A matching explanation without a verified behavior is not sufficient.

## Why a naive solution fails

Facets counting unauthorized products; using a projection's stock number at checkout; stale events overwriting newer data; reindex overwriting edits made during its scan; running OpenSearch before measuring a baseline.

Use a concrete input from the lesson to explain the failure. Do not memorize a pattern name without being able to show what it prevents.

## Alternative and tradeoff exercise

Propose one other valid design, identify its added cost, and state the workload or product requirement that would make it preferable. Compare against the related ADR instead of assuming the chosen approach is universally best.

## Review your understanding

- Which consistency is acceptable for ranking but unacceptable for purchase availability?
- Why can facet counts leak unpublished data?
- How do you know a rebuilt index includes changes during rebuild?

Then attempt: Delete/archive the canonical product during a full reindex and prove no delayed event makes it public again.

After implementation, add a task-specific walkthrough in your journal pointing to actual code lines and explaining review fixes. This reference solution cannot predict line numbers or fixes that do not exist yet.
