# Notifications and documents

Status: proposed module specification. Module ID: **notifications**.

## Responsibility

Template rendering, demo email/SMS delivery, retries, invoice generation and authorized download.

## Dependencies and boundary

Provider modules: identity, commerce.

Consume OrderPaid/SuborderTransitioned/RefundCompleted with effect keys. Render invoices from immutable snapshots; write object under deterministic key; mark delivery only after write acknowledgment. Local delivery sink simulates providers without contacting customers.

## Invariants

Retries do not send duplicate demo messages. Invoice routes verify owning customer or scoped authorized staff. Worker failure does not roll back a paid order. PDFs escape untrusted text and avoid embedding arbitrary remote URLs.

## Acceptance scenarios

Crash after object write but before receipt commit: retry finds deterministic object and finishes. Failed template becomes visible, not a lost task. Store A staff cannot download store B invoice content.

## Out of scope

Live SMS/email campaigns and tax-valid invoice guarantees.

## Implementation and learning

Task range: T061. Use the [task tracker](../../tasks/todo.md) for exact ordering/dependencies. Read [11-reliability lesson](../learning/lessons/11-reliability.md), or attempt its [challenge](../learning/challenges/11-reliability.md) first.

The [data model](../architecture/data-model.md), [API contracts](../architecture/api-contracts.md), and [event contracts](../architecture/events.md) define shared types and constraints. Each implementation must add positive, negative, and replay/concurrency checks appropriate to these scenarios; passing a unit mock alone is insufficient for database or browser claims.
