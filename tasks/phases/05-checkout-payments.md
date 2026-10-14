# Milestone 5: Checkout and mock payments

Status: proposed; track completion in [the task tracker](../todo.md).

## Observable outcome

Retry-safe multi-seller checkout, signed callbacks, compensation, and provable one-charge behavior.

## Entry conditions

Previous milestone [Carts and shared inventory](04-carts-inventory.md) is integrated; satisfy each task's exact prerequisites before starting.

## Ordered work

| Task | Outcome | Dependencies |
| --- | --- | --- |
| [T045](../items/T045.md) | Implement totals and coupon allocation contracts | T041, T019 |
| [T046](../items/T046.md) | Model orders and seller suborders | T037, T045 |
| [T047](../items/T047.md) | Implement idempotent checkout creation | T046, T038, T041, T029, T091 |
| [T048](../items/T048.md) | Build checkout review and pending-order UI | T047, T043 |
| [T049](../items/T049.md) | Implement the persistent mock provider | T046 |
| [T050](../items/T050.md) | Implement payment dispatch and webhook ingestion | T049, T029, T047 |
| [T051](../items/T051.md) | Confirm paid orders and compensate failures | T050, T039, T047 |
| [T052](../items/T052.md) | Reconcile uncertain payment outcomes | T050, T051 |
| [T053](../items/T053.md) | Prove the checkout expiry race | T051, T052, T044 |
| [T054](../items/T054.md) | Prove retry and duplicate-webhook safety | T052, T051 |

## Checkpoints

Pause for integrated verification after every three tasks and at the end. This is a quality/learning checkpoint, not a fixed calendar interval. Run the changed flow through the actual API/browser when applicable; link evidence and explain one failure case.

## Learning path

Start with [08-checkout](../../docs/learning/lessons/08-checkout.md), or its [challenge](../../docs/learning/challenges/08-checkout.md). Follow additional lesson links in individual tasks. Attempt a small variation without looking at the solution before declaring the topic understood.

## Exit gate

Retry-safe multi-seller checkout, signed callbacks, compensation, and provable one-charge behavior. Demonstrate it with deterministic data, permission boundaries, and a recorded failure/recovery case. Required tasks must pass; T076 is explicitly stretch. Scale-proof tasks may be resource-blocked but cannot be reported passed. No fixed completion date is imposed.

## Review artifact

Create `docs/reviews/milestone-5-context.md` and the separate review report during implementation. They are future artifacts, not fabricated reviews in this plan. Apply [review workflow](../../docs/operations/development-workflow.md).
