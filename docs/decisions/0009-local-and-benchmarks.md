# ADR-0009: Resource-aware profiles without weaker correctness

## Status

Proposed. Recorded 2026-09-29. Review during T001; preserve history if replaced.

## Context

Windows and Docker Desktop share 8 GB total RAM. The source PRD specifies demanding Tier L targets.

## Decision

Run Node applications on host; core PostgreSQL/cache containers plus jobs Redis when needed. Enable object storage, search, telemetry, and benchmarks as deliberate profiles. Separate everyday functional checks from scale proof.

## Alternatives considered

Running everything always risks swapping. Reducing benchmark dataset while calling it Tier L would invalidate the portfolio evidence.

## Consequences

Core resource estimates are starting budgets, not guarantees. Record actual machine/container allocations and load-generator location. Targets remain open until measured.

## Validation

Record docker stats, system memory, build peak, and reproducible functional/benchmark results.

Related: [Architecture](../../ARCHITECTURE.md), [confirmed user decisions](../planning/confirmed-decisions.md), [source references](../planning/resources.md).
