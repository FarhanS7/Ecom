# ADR-0005: Reservation-based shared inventory

## Status

Proposed. Recorded 2026-09-29. Review during T001; preserve history if replaced.

## Context

Both channels sell from one pool; decrementing only on_hand ignores active reservations.

## Decision

Reserve by increasing reserved with conditional availability; confirm by decrementing both counters; release by decrementing reserved. Every transition writes an append-only movement in the same transaction. Lock order and reservation transitions consistently.

## Alternatives considered

Read-then-write without locking oversells. Redis pre-decrement adds a second consistency problem and is deferred until a measured bottleneck.

## Consequences

Reservations reduce availability temporarily. Payment-after-expiry needs compensation rather than silent stock reacquisition. Stable lock order reduces deadlocks but retries remain bounded.

## Validation

500 concurrent buyers/50 units, cross-channel overlap, expiry/payment race, and ledger reconciliation.

Related: [Architecture](../../ARCHITECTURE.md), [confirmed user decisions](../planning/confirmed-decisions.md), [source references](../planning/resources.md).
