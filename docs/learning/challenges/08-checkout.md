# Challenge: Idempotency, totals, and multi-seller checkout

Prerequisites: Cart, inventory, transaction boundaries, and integer money.

Related tasks: T045–T048, T051, T063. Use a scratch branch or the relevant implementation task; do not modify an unrelated completed feature. This exercise is not completed by reading its answer.

## Problem

Create one multi-seller checkout with two products, then submit it 20 times using the same key. Repeat with the same key but a different address or coupon.

## Required observable results

One parent order, one suborder per seller, one reservation per variant, one eventual charge, identical successful replay response. Changed normalized payload returns 409 with no new effects.

## Constraints

Respect [architecture](../../../ARCHITECTURE.md) and the task's store/actor scope. Use real PostgreSQL for concurrency/constraint claims and actual browser interaction for UI claims. Do not mock the exact boundary you are trying to prove.

## Your deliverable

1. State the invariant in one sentence.
2. Write a failing test and record why it fails.
3. Implement the behavior and show actual result/evidence.
4. Explain a naive alternative and a concrete failure case.
5. Complete the variation below without copying the solution.

## Variation

Cause the final variant reservation to fail and prove no coupon hold survives.

## Self-check before opening the answer

Can you predict the behavior for a duplicate, missing, unauthorized, or delayed input where applicable? Are your assertions about persisted/public outcomes rather than only helper calls?

[Hints](../hints/08-checkout.md) · [Solution reasoning](../solutions/08-checkout.md) · [Guided lesson](../lessons/08-checkout.md)
