# ADR-0007: PostgreSQL search first, OpenSearch comparison later

## Status

Proposed. Recorded 2026-09-29. Review during T001; preserve history if replaced.

## Context

The host has 8 GB RAM; the PRD demands filters, facets, typo tolerance, async projection, and a reindex path.

## Decision

Build a versioned search_documents projection using FTS plus bounded pg_trgm fallback. Add an optional OpenSearch adapter only after contract tests and baseline measurement.

## Alternatives considered

FTS alone does not fulfill typo tolerance. Running OpenSearch from the first lesson spends resources before its benefit can be measured.

## Consequences

Projection lag must be visible. Canonical channel visibility gates all public results/facets; stock is revalidated at checkout. Separate semantic contract from engine-specific ranking.

## Validation

Typo/filter/facet fixtures, stale-version replay, reindex catch-up, and documented engine comparison.

Related: [Architecture](../../ARCHITECTURE.md), [confirmed user decisions](../planning/confirmed-decisions.md), [source references](../planning/resources.md).
