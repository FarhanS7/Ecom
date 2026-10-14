# Milestone 7: Engagement and administration

Status: proposed; track completion in [the task tracker](../todo.md).

## Observable outcome

Coupons, reviews, wishlists, dashboards, team management, support workflows, and simulated settlements.

## Entry conditions

Previous milestone [Fulfillment and after-sales](06-fulfillment-returns.md) is integrated; satisfy each task's exact prerequisites before starting.

## Ordered work

| Task | Outcome | Dependencies |
| --- | --- | --- |
| [T063](../items/T063.md) | Build coupon management and redemption UI | T045, T047, T060 |
| [T064](../items/T064.md) | Implement verified reviews and rating projection | T056, T030, T060 |
| [T065](../items/T065.md) | Implement shared customer wishlist | T021, T017 |
| [T066](../items/T066.md) | Implement scoped sales read models | T060, T062 |
| [T067](../items/T067.md) | Build seller and platform dashboards | T066, T023 |
| [T068](../items/T068.md) | Build team, theme and store-content settings | T015, T016, T035, T023 |
| [T069](../items/T069.md) | Build support and admin policy workflows | T062, T060, T015 |
| [T070](../items/T070.md) | Implement simulated seller settlement | T060, T066 |

## Checkpoints

Pause for integrated verification after every three tasks and at the end. This is a quality/learning checkpoint, not a fixed calendar interval. Run the changed flow through the actual API/browser when applicable; link evidence and explain one failure case.

## Learning path

Start with [10-frontend](../../docs/learning/lessons/10-frontend.md), or its [challenge](../../docs/learning/challenges/10-frontend.md). Follow additional lesson links in individual tasks. Attempt a small variation without looking at the solution before declaring the topic understood.

## Exit gate

Coupons, reviews, wishlists, dashboards, team management, support workflows, and simulated settlements. Demonstrate it with deterministic data, permission boundaries, and a recorded failure/recovery case. Required tasks must pass; T076 is explicitly stretch. Scale-proof tasks may be resource-blocked but cannot be reported passed. No fixed completion date is imposed.

## Review artifact

Create `docs/reviews/milestone-7-context.md` and the separate review report during implementation. They are future artifacts, not fabricated reviews in this plan. Apply [review workflow](../../docs/operations/development-workflow.md).
