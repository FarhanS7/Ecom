# Milestone 6: Fulfillment and after-sales

Status: proposed; track completion in [the task tracker](../todo.md).

## Observable outcome

Independent seller fulfillment, customer history, cancellations, returns, refunds, and invoices.

## Entry conditions

Previous milestone [Checkout and mock payments](05-checkout-payments.md) is integrated; satisfy each task's exact prerequisites before starting.

## Ordered work

| Task | Outcome | Dependencies |
| --- | --- | --- |
| [T055](../items/T055.md) | Implement scoped order history and detail | T051, T018 |
| [T056](../items/T056.md) | Implement seller fulfillment transitions | T055 |
| [T057](../items/T057.md) | Build customer and seller order screens | T055, T056, T023 |
| [T058](../items/T058.md) | Implement cancellation and return requests | T056, T052 |
| [T059](../items/T059.md) | Build after-sales request screens | T058, T057 |
| [T060](../items/T060.md) | Implement partial refunds and balanced ledger | T058, T052 |
| [T061](../items/T061.md) | Implement invoices and demo notifications | T051, T035, T060, T029 |
| [T062](../items/T062.md) | Audit all privileged business mutations | T056, T060, T015, T020 |

## Checkpoints

Pause for integrated verification after every three tasks and at the end. This is a quality/learning checkpoint, not a fixed calendar interval. Run the changed flow through the actual API/browser when applicable; link evidence and explain one failure case.

## Learning path

Start with [09-payments](../../docs/learning/lessons/09-payments.md), or its [challenge](../../docs/learning/challenges/09-payments.md). Follow additional lesson links in individual tasks. Attempt a small variation without looking at the solution before declaring the topic understood.

## Exit gate

Independent seller fulfillment, customer history, cancellations, returns, refunds, and invoices. Demonstrate it with deterministic data, permission boundaries, and a recorded failure/recovery case. Required tasks must pass; T076 is explicitly stretch. Scale-proof tasks may be resource-blocked but cannot be reported passed. No fixed completion date is imposed.

## Review artifact

Create `docs/reviews/milestone-6-context.md` and the separate review report during implementation. They are future artifacts, not fabricated reviews in this plan. Apply [review workflow](../../docs/operations/development-workflow.md).
