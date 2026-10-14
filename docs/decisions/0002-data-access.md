# ADR-0002: PostgreSQL with Drizzle and explicit SQL

## Status

Proposed. Recorded 2026-09-29. Review during T001; preserve history if replaced.

## Context

Stock, order, coupon, and financial invariants are relational and transactional. The learner already knows SQL.

## Decision

Use PostgreSQL as durable authority, Drizzle for schema/query ergonomics, and parameterized SQL for locks, conditional updates, COPY, and query-plan labs.

## Alternatives considered

Prisma is viable but adds a second query idiom for hot-path SQL; MongoDB does not simplify this relational transaction model. Neither alternative is categorically unsuitable.

## Consequences

Review generated migrations before applying. No automatic push/sync against shared data. Database tests use real PostgreSQL. Pin compatible versions during foundation work.

## Validation

Constraint failures, rollback tests, empty/upgrade migrations, and EXPLAIN evidence.

Related: [Architecture](../../ARCHITECTURE.md), [confirmed user decisions](../planning/confirmed-decisions.md), [source references](../planning/resources.md).
