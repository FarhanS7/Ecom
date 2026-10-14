# Milestone 0: Foundation

Status: proposed; track completion in [the task tracker](../todo.md).

## Observable outcome

A reproducible workspace, small Docker environment, real database tests, and web/API skeleton.

## Entry conditions

Scope review and user decisions are available. No application code exists yet.

## Ordered work

| Task | Outcome | Dependencies |
| --- | --- | --- |
| [T001](../items/T001.md) | Review scope and proposed decisions | None |
| [T002](../items/T002.md) | Establish the TypeScript workspace | T001 |
| [T003](../items/T003.md) | Create the database migration harness | T002 |
| [T004](../items/T004.md) | Define the minimal Docker profile | T002 |
| [T005](../items/T005.md) | Add validated configuration and health routes | T003, T004 |
| [T006](../items/T006.md) | Establish API and error conventions | T005 |
| [T007](../items/T007.md) | Create the Next.js application shell | T002, T005 |
| [T008](../items/T008.md) | Add initial continuous integration gates | T003, T006, T007 |

## Checkpoints

Pause for integrated verification after every three tasks and at the end. This is a quality/learning checkpoint, not a fixed calendar interval. Run the changed flow through the actual API/browser when applicable; link evidence and explain one failure case.

## Learning path

Start with [01-foundations](../../docs/learning/lessons/01-foundations.md), or its [challenge](../../docs/learning/challenges/01-foundations.md). Follow additional lesson links in individual tasks. Attempt a small variation without looking at the solution before declaring the topic understood.

## Exit gate

A reproducible workspace, small Docker environment, real database tests, and web/API skeleton. Demonstrate it with deterministic data, permission boundaries, and a recorded failure/recovery case. Required tasks must pass; T076 is explicitly stretch. Scale-proof tasks may be resource-blocked but cannot be reported passed. No fixed completion date is imposed.

## Review artifact

Create `docs/reviews/milestone-0-context.md` and the separate review report during implementation. They are future artifacts, not fabricated reviews in this plan. Apply [review workflow](../../docs/operations/development-workflow.md).
