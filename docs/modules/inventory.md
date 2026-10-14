# Inventory and reservation accounting

Status: proposed module specification. Module ID: **inventory**.

## Responsibility

Stock counters, reservations, expiry, restocking, append-only movement ledger.

## Dependencies and boundary

Provider modules: catalog.

reserve(tx,checkoutId,sortedLines,expiresAt); confirm(tx,checkoutId); release(tx,checkoutId,reason); adjust(tx,variantId,delta,operationKey). Returns typed insufficient-stock details without other store information.

## Invariants

available=on_hand-reserved. Reserve: reserved+=q only if available>=q. Confirm ACTIVE: on_hand-=q and reserved-=q. Release ACTIVE: reserved-=q. Transitions and ledger rows share a transaction; retries are no-ops. Adjustments cannot set on_hand below reserved. Lock variants in stable ID order.

## Acceptance scenarios

50 units, 500 mixed-channel buyers: exactly 50 successful reservations when no expiry/failure is injected. Expiry and payment confirmation serialize on the same reservation/order locks. A late successful payment after release is refunded/voided; never silently re-reserve or drive counters negative.

## Out of scope

Redis as stock authority, multi-warehouse allocation, backorders.

## Implementation and learning

Task range: T037–T040, T053. Use the [task tracker](../../tasks/todo.md) for exact ordering/dependencies. Read [07-inventory lesson](../learning/lessons/07-inventory.md), or attempt its [challenge](../learning/challenges/07-inventory.md) first.

The [data model](../architecture/data-model.md), [API contracts](../architecture/api-contracts.md), and [event contracts](../architecture/events.md) define shared types and constraints. Each implementation must add positive, negative, and replay/concurrency checks appropriate to these scenarios; passing a unit mock alone is insufficient for database or browser claims.
