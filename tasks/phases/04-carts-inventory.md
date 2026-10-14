# Milestone 4: Carts and shared inventory

Status: proposed; track completion in [the task tracker](../todo.md).

## Observable outcome

Independent channel carts and a stock pool that survives simultaneous buyers and reservation expiry.

## Entry conditions

Previous milestone [Events, search, and media](03-events-search-media.md) is integrated; satisfy each task's exact prerequisites before starting.

## Ordered work

| Task | Outcome | Dependencies |
| --- | --- | --- |
| [T037](../items/T037.md) | Model stock invariants and movement ledger | T019, T003 |
| [T038](../items/T038.md) | Implement atomic basket reservations | T037, T029 |
| [T039](../items/T039.md) | Implement expiry and stock adjustments | T038 |
| [T040](../items/T040.md) | Build seller stock management UI | T039, T023 |
| [T041](../items/T041.md) | Implement durable channel carts | T021, T011, T004 |
| [T042](../items/T042.md) | Implement guest cart ownership and merge | T041, T017 |
| [T043](../items/T043.md) | Build cart and add-to-cart interactions | T041, T042, T026 |
| [T044](../items/T044.md) | Prove cross-channel stock contention | T038, T039, T043, T018 |

## Checkpoints

Pause for integrated verification after every three tasks and at the end. This is a quality/learning checkpoint, not a fixed calendar interval. Run the changed flow through the actual API/browser when applicable; link evidence and explain one failure case.

## Learning path

Start with [07-inventory](../../docs/learning/lessons/07-inventory.md), or its [challenge](../../docs/learning/challenges/07-inventory.md). Follow additional lesson links in individual tasks. Attempt a small variation without looking at the solution before declaring the topic understood.

## Exit gate

Independent channel carts and a stock pool that survives simultaneous buyers and reservation expiry. Demonstrate it with deterministic data, permission boundaries, and a recorded failure/recovery case. Required tasks must pass; T076 is explicitly stretch. Scale-proof tasks may be resource-blocked but cannot be reported passed. No fixed completion date is imposed.

## Review artifact

Create `docs/reviews/milestone-4-context.md` and the separate review report during implementation. They are future artifacts, not fabricated reviews in this plan. Apply [review workflow](../../docs/operations/development-workflow.md).
