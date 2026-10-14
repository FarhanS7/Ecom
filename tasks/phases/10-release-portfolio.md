# Milestone 10: Release and portfolio

Status: proposed; track completion in [the task tracker](../todo.md).

## Observable outcome

Restoration/deployment rehearsals, independent review, reproducible demo, and production handoff.

## Entry conditions

Previous milestone [Performance and scale evidence](09-performance-evidence.md) is integrated; satisfy each task's exact prerequisites before starting.

## Ordered work

| Task | Outcome | Dependencies |
| --- | --- | --- |
| [T085](../items/T085.md) | Rehearse backups and restoration | T077, T070 |
| [T086](../items/T086.md) | Prepare demo deployment and rollback | T085, T074, T075 |
| [T087](../items/T087.md) | Complete runbooks and operating drills | T072, T073, T085, T086 |
| [T088](../items/T088.md) | Perform independent milestone review | T084, T086, T087 |
| [T089](../items/T089.md) | Prepare portfolio narrative and demonstration | T088 |
| [T090](../items/T090.md) | Close the demo and define production handoff | T089 |

## Checkpoints

Pause for integrated verification after every three tasks and at the end. This is a quality/learning checkpoint, not a fixed calendar interval. Run the changed flow through the actual API/browser when applicable; link evidence and explain one failure case.

## Learning path

Start with [12-operations](../../docs/learning/lessons/12-operations.md), or its [challenge](../../docs/learning/challenges/12-operations.md). Follow additional lesson links in individual tasks. Attempt a small variation without looking at the solution before declaring the topic understood.

## Exit gate

Restoration/deployment rehearsals, independent review, reproducible demo, and production handoff. Demonstrate it with deterministic data, permission boundaries, and a recorded failure/recovery case. Required tasks must pass; T076 is explicitly stretch. Scale-proof tasks may be resource-blocked but cannot be reported passed. No fixed completion date is imposed.

## Review artifact

Create `docs/reviews/milestone-10-context.md` and the separate review report during implementation. They are future artifacts, not fabricated reviews in this plan. Apply [review workflow](../../docs/operations/development-workflow.md).
