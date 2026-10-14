# Idempotency, totals, and multi-seller checkout

Learning status: reference material for future implementation. Examples are reasoning sketches, not tested application code.

Related implementation: T045–T048, T051, T063. Prerequisites: Cart, inventory, transaction boundaries, and integer money.

## Choose your route

Guided: read this lesson, implement the linked task, then attempt the [challenge](../challenges/08-checkout.md). Challenge-first: open that file now, use [hints](../hints/08-checkout.md) only if needed, then compare [solution reasoning](../solutions/08-checkout.md).

## Mental model

A retry is a repeated request for the same intended operation, not a new purchase. Idempotency records bind identity, operation, channel, key and normalized request hash to a durable result. Checkout orchestrates modules without handing control of its transaction to external networks.

## Worked example

Two units at 2500 cents and one seller's 500-cent shipping total 5500. A 101-cent discount split across equal line weights becomes 51/50 with deterministic tie-break. Twenty identical requests must return one order, not twenty stock reservations.

```
// Transaction plan, not runnable code.
claimIdempotency(actor, channel, key, requestHash);
loadAndValidateCanonicalCart();
quoteAndHoldCoupon();
reserveAllVariantsInStableOrder();
writeOrderAndSellerSnapshots();
writeOutboxAndExactResponse();
commit(); // only now can payment dispatch begin
```

## Guided implementation

1. Define canonical request normalization and key scope.
2. Calculate immutable per-line/suborder totals using integer cents and a deterministic remainder rule. Present a server-issued signed quote before confirmation; bind it to the actor/cart/channel/address/coupon and reject changed or expired quotes for new checkouts.
3. Persist the idempotency claim/result with the order/reservations/outbox transaction.
4. Separate payment state from fulfillment state and show PENDING in UI after 202.
5. Test duplicate requests, changed payload, partial stock failure, and delayed payment.

Use [the task tracker](../../../tasks/todo.md) for the concrete implementation order. Do not implement a lesson's later-stage example before its task prerequisites are present.

## Common mistakes

Idempotency only in memory/Redis; recording the key after charging; trusting client totals; one order status trying to encode payment and every seller's shipping state; allocating cents with nondeterministic rounding.

## Explain it without looking

- Why must a reused key with a different payload fail?
- Why is an HTTP 202 not proof of a successful charge?
- Which effects roll back when the last cart line cannot reserve?

Write answers in your own learning journal. Include one counterexample to the naive approach, a test that catches it, and a condition under which a different design would be better.

## Transfer exercise

Cause the final variant reservation to fail and prove no coupon hold survives.

## Reference

[Checkout API](../../architecture/api-contracts.md). Project-specific choices are explained in [architecture](../../../ARCHITECTURE.md); framework documentation does not establish that our future implementation passes its tests.
