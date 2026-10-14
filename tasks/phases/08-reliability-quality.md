# Milestone 8: Reliability and quality

Status: proposed; track completion in [the task tracker](../todo.md).

## Observable outcome

Observable failures, tested recovery, authorization regression coverage, and accessible complete journeys.

## Entry conditions

Previous milestone [Engagement and administration](07-engagement-admin.md) is integrated; satisfy each task's exact prerequisites before starting.

## Ordered work

| Task | Outcome | Dependencies |
| --- | --- | --- |
| [T071](../items/T071.md) | Trace requests through API and workers | T029, T051, T062 |
| [T072](../items/T072.md) | Add metrics dashboards and alerts | T071 |
| [T073](../items/T073.md) | Run failure recovery and broker-loss tests | T054, T061, T071 |
| [T074](../items/T074.md) | Complete security regression coverage | T018, T035, T069 |
| [T075](../items/T075.md) | Complete accessibility and responsive verification | T067, T068, T069, T065 |
| [T076](../items/T076.md) | Add low-stock and feature-flag extensions | T072, T069, T039 |

## Checkpoints

Pause for integrated verification after every three tasks and at the end. This is a quality/learning checkpoint, not a fixed calendar interval. Run the changed flow through the actual API/browser when applicable; link evidence and explain one failure case.

## Learning path

Start with [11-reliability](../../docs/learning/lessons/11-reliability.md), or its [challenge](../../docs/learning/challenges/11-reliability.md). Follow additional lesson links in individual tasks. Attempt a small variation without looking at the solution before declaring the topic understood.

## Exit gate

Observable failures, tested recovery, authorization regression coverage, and accessible complete journeys. Demonstrate it with deterministic data, permission boundaries, and a recorded failure/recovery case. Required tasks must pass; T076 is explicitly stretch. Scale-proof tasks may be resource-blocked but cannot be reported passed. No fixed completion date is imposed.

## Review artifact

Create `docs/reviews/milestone-8-context.md` and the separate review report during implementation. They are future artifacts, not fabricated reviews in this plan. Apply [review workflow](../../docs/operations/development-workflow.md).
