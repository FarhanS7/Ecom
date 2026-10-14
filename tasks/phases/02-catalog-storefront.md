# Milestone 2: Catalog and storefront

Status: proposed; track completion in [the task tracker](../todo.md).

## Observable outcome

Real products can be authored, published per channel, browsed, filtered, and viewed through accessible UI.

## Entry conditions

Previous milestone [Identity and stores](01-identity-stores.md) is integrated; satisfy each task's exact prerequisites before starting.

## Ordered work

| Task | Outcome | Dependencies |
| --- | --- | --- |
| [T019](../items/T019.md) | Model products and variants | T014, T003 |
| [T020](../items/T020.md) | Implement seller catalog mutations | T019, T018 |
| [T021](../items/T021.md) | Implement channel-aware catalog reads | T020, T016 |
| [T022](../items/T022.md) | Add stable keyset pagination | T021 |
| [T023](../items/T023.md) | Build the token-based component foundation | T016, T007 |
| [T024](../items/T024.md) | Build connected storefront home pages | T021, T023 |
| [T025](../items/T025.md) | Build product listing and filters | T022, T023 |
| [T026](../items/T026.md) | Build product detail and variant selection | T021, T023 |
| [T027](../items/T027.md) | Build seller catalog editing screens | T020, T023 |
| [T028](../items/T028.md) | Seed a deterministic catalog skeleton | T019, T015 |

## Checkpoints

Pause for integrated verification after every three tasks and at the end. This is a quality/learning checkpoint, not a fixed calendar interval. Run the changed flow through the actual API/browser when applicable; link evidence and explain one failure case.

## Learning path

Start with [04-catalog](../../docs/learning/lessons/04-catalog.md), or its [challenge](../../docs/learning/challenges/04-catalog.md). Follow additional lesson links in individual tasks. Attempt a small variation without looking at the solution before declaring the topic understood.

## Exit gate

Real products can be authored, published per channel, browsed, filtered, and viewed through accessible UI. Demonstrate it with deterministic data, permission boundaries, and a recorded failure/recovery case. Required tasks must pass; T076 is explicitly stretch. Scale-proof tasks may be resource-blocked but cannot be reported passed. No fixed completion date is imposed.

## Review artifact

Create `docs/reviews/milestone-2-context.md` and the separate review report during implementation. They are future artifacts, not fabricated reviews in this plan. Apply [review workflow](../../docs/operations/development-workflow.md).
