# Reliability and delivery

Status: proposed module specification. Module ID: **operations**.

## Responsibility

Observability, integration tests, load testing, resource profiles, CI gates, release evidence, backup/restore, and runbooks.

## Dependencies and boundary

Provider modules: commerce, search, notifications, reporting.

Emit consistent request/order/event correlation. Required checks produce artifacts with commands, machine profile, commit SHA, dataset seed, and pass/fail. Deployment begins with local rehearsals and does not provision or spend money during planning.

## Invariants

Mock tests cannot prove inventory concurrency. No performance claim without raw measurements. Never delete failed tests to satisfy a gate. Fault injection targets isolated test stacks only. Existing references remain outside workspace build globs.

## Acceptance scenarios

Worker killed mid-order resumes within required recovery target after dependencies recover. Redis outage degrades cached reads but does not lose durable orders/carts. Restore creates isolated database and verifies checksums/counts and a purchase flow.

## Out of scope

Guaranteeing SLOs before measurement or launching real transactions as part of the demo.

## Implementation and learning

Task range: T071–T090. Use the [task tracker](../../tasks/todo.md) for exact ordering/dependencies. Read [12-operations lesson](../learning/lessons/12-operations.md), or attempt its [challenge](../learning/challenges/12-operations.md) first.

The [data model](../architecture/data-model.md), [API contracts](../architecture/api-contracts.md), and [event contracts](../architecture/events.md) define shared types and constraints. Each implementation must add positive, negative, and replay/concurrency checks appropriate to these scenarios; passing a unit mock alone is insufficient for database or browser claims.
