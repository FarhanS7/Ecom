# Durable carts, caching, and merge semantics

Learning status: reference material for future implementation. Examples are reasoning sketches, not tested application code.

Related implementation: T033, T041–T043. Prerequisites: Store/channel scope and optimistic version checks.

## Choose your route

Guided: read this lesson, implement the linked task, then attempt the [challenge](../challenges/06-carts.md). Challenge-first: open that file now, use [hints](../hints/06-carts.md) only if needed, then compare [solution reasoning](../solutions/06-carts.md).

## Mental model

A cart expresses intent, not a guarantee of price or stock. A cache speeds a durable read model; it must not be the only place a logged-in basket exists. Guest-to-user merge is a business operation that may be retried.

## Worked example

Guest cart has quantity 3 and user cart has 2 for the same variant. Login merge should produce 5 once. If the callback runs again and naïvely sums again, quantity becomes 8. A merge receipt makes the repeated operation return the already-merged result.

```
// Key design sketch, not raw user-input concatenation.
cart:{ownerKind}:{ownerId}:{channelKey}:v{schemaVersion}
// Mutation: lock/version-check DB cart -> commit -> invalidate/refresh cache.
```

## Guided implementation

1. Model channelKey and owner type explicitly with unique constraints.
2. Commit durable cart mutation before cache refresh; add a version to avoid stale overwrites.
3. Issue random guest ownership proof and store its hash.
4. Merge in a transaction with a unique guest-cart receipt and a defined quantity cap.
5. Render unavailable/changed-price lines rather than silently pretending they are purchasable.

Use [the task tracker](../../../tasks/todo.md) for the concrete implementation order. Do not implement a lesson's later-stage example before its task prerequisites are present.

## Common mistakes

Global cart cache key without channel; trusting displayed price at checkout; merging all store carts together; retrying cache writes in a way that reverses a newer DB state; reserving stock at add-to-cart time.

## Explain it without looking

- What survives a Redis flush?
- How is merge retry different from setting quantity to a desired value?
- Why should the cart remain visible when a line becomes unavailable?

Write answers in your own learning journal. Include one counterexample to the naive approach, a test that catches it, and a condition under which a different design would be better.

## Transfer exercise

Make the sum exceed 99 and design an explicit adjustment notice without silently dropping an entire line.

## Reference

[Cart module](../../modules/cart.md). Project-specific choices are explained in [architecture](../../../ARCHITECTURE.md); framework documentation does not establish that our future implementation passes its tests.
