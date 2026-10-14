# Reporting, audit, and administration

Status: proposed module specification. Module ID: **reporting**.

## Responsibility

Scoped dashboards, materialized aggregates, platform policies, audit viewer, and simulated seller payout summaries.

## Dependencies and boundary

Provider modules: commerce, stores, engagement.

Sales reports define GMV as captured gross before refunds, net sales as captured minus completed refunds, and display as-of timestamp. Audit append uses the platform AuditWriter port in the same transaction as privileged mutation; reporting owns audit reads, not a dependency that lower modules import. Report queries use snapshot totals, not mutable catalog prices.

## Invariants

Every privileged change includes actor, scope, request ID, and redacted before/after. Support refund policy is DB-configured. Store staff see only own aggregates. Materialized-view staleness is shown. Audit rows never include secrets, full payment details, or password hashes.

## Acceptance scenarios

Changing product price does not rewrite historical revenue. Refresh failure displays stale/as-of indicator. Support cumulative refund above order cap is rejected even when split into smaller requests.

## Out of scope

Real accounting certification, production payout compliance, arbitrary SQL report builder.

## Implementation and learning

Task range: T062, T066–T070. Use the [task tracker](../../tasks/todo.md) for exact ordering/dependencies. Read [12-operations lesson](../learning/lessons/12-operations.md), or attempt its [challenge](../learning/challenges/12-operations.md) first.

The [data model](../architecture/data-model.md), [API contracts](../architecture/api-contracts.md), and [event contracts](../architecture/events.md) define shared types and constraints. Each implementation must add positive, negative, and replay/concurrency checks appropriate to these scenarios; passing a unit mock alone is insufficient for database or browser claims.
