# Coupons and limits

Status: proposed module specification. Module ID: **promotions**.

## Responsibility

Scoped coupon definitions, global/per-user limits, holds, redemption, release, and deterministic allocation.

## Dependencies and boundary

Provider modules: identity, stores.

quoteCoupon(tx,actor,channel,lines,code) returns allocation; hold(tx,orderId,quote); redeem(tx,orderId); release(tx,orderId). Locks coupon and user counters consistently. Promotion ports do not import orders; orderId is an opaque reference.

## Invariants

One coupon per order in demo. Store coupon applies only to that store's lines; marketplace coupon applies across eligible marketplace lines. Discount excludes shipping and never exceeds eligible subtotal. Distribute cents by largest remainder with order-item ID tie-break. Refund returns net paid allocations, not original gross.

## Acceptance scenarios

Last coupon use raced by two buyers produces one hold. Timeout release frees both global and per-user counters exactly once. Example 101-cent discount over equal-priced lines allocates 51/50 deterministically. Partial refunds do not restore redeemed coupon usage automatically.

## Out of scope

Stacked coupons, gift cards, loyalty points, dynamic tax discounts.

## Implementation and learning

Task range: T045, T063. Use the [task tracker](../../tasks/todo.md) for exact ordering/dependencies. Read [08-checkout lesson](../learning/lessons/08-checkout.md), or attempt its [challenge](../learning/challenges/08-checkout.md) first.

The [data model](../architecture/data-model.md), [API contracts](../architecture/api-contracts.md), and [event contracts](../architecture/events.md) define shared types and constraints. Each implementation must add positive, negative, and replay/concurrency checks appropriate to these scenarios; passing a unit mock alone is insufficient for database or browser claims.
