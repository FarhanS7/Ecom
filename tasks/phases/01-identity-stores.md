# Milestone 1: Identity and stores

Status: proposed; track completion in [the task tracker](../todo.md).

## Observable outcome

One global customer identity, scoped staff membership, seller approval, and two themed storefronts.

## Entry conditions

Previous milestone [Foundation](00-foundation.md) is integrated; satisfy each task's exact prerequisites before starting.

## Ordered work

| Task | Outcome | Dependencies |
| --- | --- | --- |
| [T009](../items/T009.md) | Model global accounts and session records | T003 |
| [T010](../items/T010.md) | Implement registration and login | T006, T009 |
| [T011](../items/T011.md) | Implement refresh rotation and logout | T010 |
| [T012](../items/T012.md) | Implement account recovery and verification | T010 |
| [T013](../items/T013.md) | Add authentication throttling and browser protections | T011 |
| [T014](../items/T014.md) | Implement scoped store memberships | T009, T011 |
| [T015](../items/T015.md) | Implement seller applications and invitations | T014 |
| [T016](../items/T016.md) | Resolve storefront channels and themes | T014, T007 |
| [T017](../items/T017.md) | Build account and recovery screens | T010, T011, T012, T013 |
| [T018](../items/T018.md) | Build the authorization matrix harness | T013, T014, T015 |
| [T091](../items/T091.md) | Implement the customer address book | T011, T017 |

## Checkpoints

Pause for integrated verification after every three tasks and at the end. This is a quality/learning checkpoint, not a fixed calendar interval. Run the changed flow through the actual API/browser when applicable; link evidence and explain one failure case.

## Learning path

Start with [03-tenancy](../../docs/learning/lessons/03-tenancy.md), or its [challenge](../../docs/learning/challenges/03-tenancy.md). Follow additional lesson links in individual tasks. Attempt a small variation without looking at the solution before declaring the topic understood.

## Exit gate

One global customer identity, scoped staff membership, seller approval, and two themed storefronts. Demonstrate it with deterministic data, permission boundaries, and a recorded failure/recovery case. Required tasks must pass; T076 is explicitly stretch. Scale-proof tasks may be resource-blocked but cannot be reported passed. No fixed completion date is imposed.

## Review artifact

Create `docs/reviews/milestone-1-context.md` and the separate review report during implementation. They are future artifacts, not fabricated reviews in this plan. Apply [review workflow](../../docs/operations/development-workflow.md).
