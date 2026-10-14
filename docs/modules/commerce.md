# Checkout, orders, and after-sales

Status: proposed module specification. Module ID: **commerce**.

## Responsibility

Checkout coordinator, parent order and seller suborders, state transitions, price/address snapshots, cancellation, return requests, and refund approvals.

## Dependencies and boundary

Provider modules: cart, inventory, payments, stores, promotions.

quoteCheckout(actor,input) returns signed, expiring canonical totals without reserving. startCheckout(actor,input,key) replays an existing accepted key first; otherwise it validates the quote and snapshots authoritative data, reserves stock/coupon, and persists PENDING order and outbox atomically. PaymentObserved handler invokes narrow payment/inventory ports and commits confirmed order state with events. No network provider call inside DB transaction.

## Invariants

A checkout reserves every line or none. Each seller gets one suborder. Different request payload under a used key returns conflict. Payment status and fulfillment status are separate. Parent fulfillment is derived from suborders; one shipped seller does not mark others shipped. Only unshipped eligible lines may cancel; charged cancellation requires durable refund compensation.

## Acceptance scenarios

Stock fails on the final cart line: no partial reservation/order/coupon hold survives. Price changes since cart display return a reviewable PRICE_CHANGED response before charging. Payment after expiry triggers tracked compensation. Full/partial return cannot exceed purchased minus already-returned quantity.

## Out of scope

Cross-currency baskets, silent substitution of unavailable variants, real carrier workflow.

## Implementation and learning

Task range: T045–T048, T051–T062. Use the [task tracker](../../tasks/todo.md) for exact ordering/dependencies. Read [08-checkout lesson](../learning/lessons/08-checkout.md), or attempt its [challenge](../learning/challenges/08-checkout.md) first.

The [data model](../architecture/data-model.md), [API contracts](../architecture/api-contracts.md), and [event contracts](../architecture/events.md) define shared types and constraints. Each implementation must add positive, negative, and replay/concurrency checks appropriate to these scenarios; passing a unit mock alone is insufficient for database or browser claims.
