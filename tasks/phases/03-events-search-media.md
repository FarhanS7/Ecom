# Milestone 3: Events, search, and media

Status: proposed; track completion in [the task tracker](../todo.md).

## Observable outcome

Durable async delivery, typo-tolerant search, safe reindexing, scoped caching, and usable product images.

## Entry conditions

Previous milestone [Catalog and storefront](02-catalog-storefront.md) is integrated; satisfy each task's exact prerequisites before starting.

## Ordered work

| Task | Outcome | Dependencies |
| --- | --- | --- |
| [T029](../items/T029.md) | Implement transactional outbox and relay | T003, T020, T015 |
| [T030](../items/T030.md) | Implement idempotent projection consumers | T029, T028 |
| [T031](../items/T031.md) | Implement text search, typo fallback and facets | T030, T022 |
| [T032](../items/T032.md) | Implement autocomplete and search UI | T031, T025 |
| [T033](../items/T033.md) | Add scoped product caching and stampede control | T029, T021 |
| [T034](../items/T034.md) | Implement safe full reindex | T030, T031 |
| [T035](../items/T035.md) | Implement validated asset uploads | T020, T029 |
| [T036](../items/T036.md) | Connect media editing and responsive images | T035, T026, T027 |

## Checkpoints

Pause for integrated verification after every three tasks and at the end. This is a quality/learning checkpoint, not a fixed calendar interval. Run the changed flow through the actual API/browser when applicable; link evidence and explain one failure case.

## Learning path

Start with [05-search](../../docs/learning/lessons/05-search.md), or its [challenge](../../docs/learning/challenges/05-search.md). Follow additional lesson links in individual tasks. Attempt a small variation without looking at the solution before declaring the topic understood.

## Exit gate

Durable async delivery, typo-tolerant search, safe reindexing, scoped caching, and usable product images. Demonstrate it with deterministic data, permission boundaries, and a recorded failure/recovery case. Required tasks must pass; T076 is explicitly stretch. Scale-proof tasks may be resource-blocked but cannot be reported passed. No fixed completion date is imposed.

## Review artifact

Create `docs/reviews/milestone-3-context.md` and the separate review report during implementation. They are future artifacts, not fabricated reviews in this plan. Apply [review workflow](../../docs/operations/development-workflow.md).
