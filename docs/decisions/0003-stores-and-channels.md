# ADR-0003: Store-scoped data with global customer identity

## Status

Confirmed product model; proposed technical representation. Recorded 2026-09-29. Review during T001; preserve history if replaced.

## Context

The user selected independent storefronts plus a shared marketplace, one catalog/stock pool, shared customer accounts, and separate carts.

## Decision

One business has one store. Store IDs scope products, staff, content and seller views; customer identity is global. Public route resolver selects marketplace or store channel. Start with /stores/{slug} on one origin.

## Alternatives considered

A database/schema per store complicates marketplace reads and cross-store checkout. A universal cart conflicts with the confirmed choice.

## Consequences

All staff repository methods require scope. Composite FKs prevent cross-store associations. Application checks remain essential; PostgreSQL RLS may be added as a defense-in-depth lab, not assumed protection.

## Validation

Cross-store ID substitution tests including variants, invoices, reports, caches, and stale memberships.

Related: [Architecture](../../ARCHITECTURE.md), [confirmed user decisions](../planning/confirmed-decisions.md), [source references](../planning/resources.md).
