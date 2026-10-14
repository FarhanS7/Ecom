# Challenge: Relational modeling, snapshots, and stable pagination

Prerequisites: SELECT/JOIN, indexes, primary and foreign keys.

Related tasks: T019–T028, T078. Use a scratch branch or the relevant implementation task; do not modify an unrelated completed feature. This exercise is not completed by reading its answer.

## Problem

Implement ascending price pagination for two stores with many tied prices. Reject a cursor from store A used in B and a cursor reused after changing filters.

## Required observable results

On an unchanged dataset, walking pages returns each eligible ID once in (price,id) order. Invalid/mismatched cursor yields 400. Store-only products never appear in marketplace results.

## Constraints

Respect [architecture](../../../ARCHITECTURE.md) and the task's store/actor scope. Use real PostgreSQL for concurrency/constraint claims and actual browser interaction for UI claims. Do not mock the exact boundary you are trying to prove.

## Your deliverable

1. State the invariant in one sentence.
2. Write a failing test and record why it fails.
3. Implement the behavior and show actual result/evidence.
4. Explain a naive alternative and a concrete failure case.
5. Complete the variation below without copying the solution.

## Variation

Add descending popularity order and explain which tuple comparison and index direction changes.

## Self-check before opening the answer

Can you predict the behavior for a duplicate, missing, unauthorized, or delayed input where applicable? Are your assertions about persisted/public outcomes rather than only helper calls?

[Hints](../hints/04-catalog.md) · [Solution reasoning](../solutions/04-catalog.md) · [Guided lesson](../lessons/04-catalog.md)
