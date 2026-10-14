# ADR-0006: Outbox, BullMQ, and durable deduplication

## Status

Proposed. Recorded 2026-09-29. Review during T001; preserve history if replaced.

## Context

An order must not disappear between a DB commit and job publication; workers and webhooks may repeat.

## Decision

Commit outbox with business data; relay to BullMQ on a separate Redis jobs instance; consumers use transactional receipts and effect keys. Reconcile pending effects after broker loss.

## Alternatives considered

Direct publish after commit creates a lost-event window. RabbitMQ remains an optional comparison; using two brokers initially offers little learning value relative to cost.

## Consequences

Delivery is at least once, not exactly once. External side effects need provider idempotency and uncertain-outcome reconciliation. Jobs Redis is distinct from evictable cache Redis.

## Validation

Kill relay/worker at transaction boundaries and replay the same event ID.

Related: [Architecture](../../ARCHITECTURE.md), [confirmed user decisions](../planning/confirmed-decisions.md), [source references](../planning/resources.md).
