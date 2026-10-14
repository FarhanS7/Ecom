# Payment effects and webhook receipts

Status: proposed module specification. Module ID: **payments**.

## Responsibility

Payment attempts, provider effect keys, raw signed webhook receipts, refund effects, financial entries, reconciliation, and the mock adapter.

## Dependencies and boundary

Provider modules: platform.

requestCharge(effectKey,amount,currency,metadata); requestRefund(effectKey,providerRef,amount); lookupEffect(effectKey). Webhook ingestion validates signature over raw bytes and event timestamp before storing receipt/outbox. It does not import commerce.

## Invariants

A stable effect key identifies an operation across retries. Unknown provider outcome is not failure. Amount/currency/order reference must match a known attempt. Unique provider/event IDs dedupe receipts; reused ID with different content is quarantined. Mock provider persists effect ledger separately from the commerce transaction.

## Acceptance scenarios

Provider accepts charge but client times out: lookup/retry by same key yields one charge. Two concurrent partial refunds cannot exceed captured amount. Invalid signature makes no business write. A duplicate event creates no second financial entry.

## Out of scope

Real card data, live payment credentials, actual seller transfers.

## Implementation and learning

Task range: T049–T050, T052–T054, T060, T070. Use the [task tracker](../../tasks/todo.md) for exact ordering/dependencies. Read [09-payments lesson](../learning/lessons/09-payments.md), or attempt its [challenge](../learning/challenges/09-payments.md) first.

The [data model](../architecture/data-model.md), [API contracts](../architecture/api-contracts.md), and [event contracts](../architecture/events.md) define shared types and constraints. Each implementation must add positive, negative, and replay/concurrency checks appropriate to these scenarios; passing a unit mock alone is insufficient for database or browser claims.
