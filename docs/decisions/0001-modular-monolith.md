# ADR-0001: Modular monolith and worker entry point

## Status

Proposed. Recorded 2026-09-29. Review during T001; preserve history if replaced.

## Context

The learning goal requires deep correctness and a maintainable full-stack application, while one learner and an 8 GB laptop cannot justify distributed-service overhead.

## Decision

Use a Nest modular monolith with explicit ports, shared PostgreSQL transactions, and a separate worker process using the same domain package. Next.js owns presentation and a narrow same-origin gateway.

## Alternatives considered

Microservices add deployment, tracing, consistency, and contract overhead before a measured need. A single unstructured service hides ownership and makes cross-store checks easy to miss.

## Consequences

Domain modules remain independently testable but share deployment/database failure domains. Extract a service only after measured operational or ownership pressure.

## Validation

Module import checks, integration tests across ports, and an end-to-end purchase.

Related: [Architecture](../../ARCHITECTURE.md), [confirmed user decisions](../planning/confirmed-decisions.md), [source references](../planning/resources.md).
