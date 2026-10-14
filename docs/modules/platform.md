# Platform foundation

Status: proposed module specification. Module ID: **platform**.

## Responsibility

Configuration, HTTP conventions, database transaction boundary, telemetry bootstrap, transactional AuditWriter port, build and test tooling.

## Dependencies and boundary

Provider modules: None.

UnitOfWork.run(callback) gives participating module ports one database transaction without exposing repositories across boundaries. Configuration validation fails at boot. Liveness is process health; readiness includes only dependencies needed to serve the advertised capability.

## Invariants

No credentials in logs. No production defaults for secrets. App tooling excludes downloaded skills and example applications. Every route is explicitly public or declares permission metadata.

## Acceptance scenarios

Boot with missing DATABASE_URL must fail with a redacted useful error; a database outage fails readiness but not liveness. A public route is marked public rather than relying on a guard omission.

## Out of scope

Business logic, user-facing store management, and external deployment provisioning.

## Implementation and learning

Task range: T001–T008. Use the [task tracker](../../tasks/todo.md) for exact ordering/dependencies. Read [01-foundations lesson](../learning/lessons/01-foundations.md), or attempt its [challenge](../learning/challenges/01-foundations.md) first.

The [data model](../architecture/data-model.md), [API contracts](../architecture/api-contracts.md), and [event contracts](../architecture/events.md) define shared types and constraints. Each implementation must add positive, negative, and replay/concurrency checks appropriate to these scenarios; passing a unit mock alone is insufficient for database or browser claims.
