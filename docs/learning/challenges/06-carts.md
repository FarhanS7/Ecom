# Challenge: Durable carts, caching, and merge semantics

Prerequisites: Store/channel scope and optimistic version checks.

Related tasks: T033, T041–T043. Use a scratch branch or the relevant implementation task; do not modify an unrelated completed feature. This exercise is not completed by reading its answer.

## Problem

Implement separate marketplace and store carts. Merge guest quantity 3 into authenticated quantity 2 twice, then flush Redis and reload.

## Required observable results

Merged quantity remains 5, unrelated channel unchanged, DB-backed reload returns the same cart, and other users cannot retrieve it by guessing the cart ID.

## Constraints

Respect [architecture](../../../ARCHITECTURE.md) and the task's store/actor scope. Use real PostgreSQL for concurrency/constraint claims and actual browser interaction for UI claims. Do not mock the exact boundary you are trying to prove.

## Your deliverable

1. State the invariant in one sentence.
2. Write a failing test and record why it fails.
3. Implement the behavior and show actual result/evidence.
4. Explain a naive alternative and a concrete failure case.
5. Complete the variation below without copying the solution.

## Variation

Make the sum exceed 99 and design an explicit adjustment notice without silently dropping an entire line.

## Self-check before opening the answer

Can you predict the behavior for a duplicate, missing, unauthorized, or delayed input where applicable? Are your assertions about persisted/public outcomes rather than only helper calls?

[Hints](../hints/06-carts.md) · [Solution reasoning](../solutions/06-carts.md) · [Guided lesson](../lessons/06-carts.md)
