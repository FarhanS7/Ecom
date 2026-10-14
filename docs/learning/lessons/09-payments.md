# Uncertain outcomes, webhooks, refunds, and ledgers

Learning status: reference material for future implementation. Examples are reasoning sketches, not tested application code.

Related implementation: T049–T062, T070. Prerequisites: Idempotency and durable events.

## Choose your route

Guided: read this lesson, implement the linked task, then attempt the [challenge](../challenges/09-payments.md). Challenge-first: open that file now, use [hints](../hints/09-payments.md) only if needed, then compare [solution reasoning](../solutions/09-payments.md).

## Mental model

A timeout tells you the caller did not receive an answer; it does not tell you whether the provider charged. Webhook delivery is an observation that can repeat or arrive late. A ledger records financial facts as append-only balanced entries rather than a mutable total with no explanation.

## Worked example

Charge effect K is accepted, but the connection drops. Retrying with a new key can charge twice. Looking up or repeating K under provider idempotency returns the same effect. Two concurrent refunds must reserve remaining refundable balance before either external call.

```
captured = 20000n;
completedRefunds = 8000n;
pendingRefunds = 5000n;
remainingRefundable = captured - completedRefunds - pendingRefunds; // 7000
// Reserve refund allocation under lock before provider dispatch.
```

## Guided implementation

1. Build a mock provider with its own persistent effect ledger and deterministic fault switches.
2. Verify webhook raw-body signature, age, provider/event identity and expected amount/currency.
3. Persist receipt before acknowledging, then apply business transition through a repeat-safe handler.
4. Allocate refunds under payment lock, dispatch by stable effect key, and reconcile uncertainty.
5. Post balanced entries for captured funds, seller payable, platform commission and reversals; explain every cent.

Use [the task tracker](../../../tasks/todo.md) for the concrete implementation order. Do not implement a lesson's later-stage example before its task prerequisites are present.

## Common mistakes

Treating timeout as decline; signing parsed/reformatted JSON instead of exact bytes; deduping webhook before verifying signature; allowing each refund to check remaining balance outside a lock; changing old settlement history after a later refund.

## Explain it without looking

- How can the order be pending while the provider already captured funds?
- What prevents two partial refunds exceeding the captured amount?
- Why should late refund create an adjustment after settlement?

Write answers in your own learning journal. Include one counterexample to the naive approach, a test that catches it, and a condition under which a different design would be better.

## Transfer exercise

Let stock expire before the success callback; prove the customer gets a tracked refund/void rather than an oversold order.

## Reference

[Payments module](../../modules/payments.md). Project-specific choices are explained in [architecture](../../../ARCHITECTURE.md); framework documentation does not establish that our future implementation passes its tests.
