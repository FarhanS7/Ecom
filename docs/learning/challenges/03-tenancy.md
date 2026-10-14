# Challenge: Store isolation, ownership, and channel context

Prerequisites: Identity lesson and SQL foreign keys.

Related tasks: T014–T018, T068–T069. Use a scratch branch or the relevant implementation task; do not modify an unrelated completed feature. This exercise is not completed by reading its answer.

## Problem

Give user U catalog-editor access to store A and no access to B. Implement one product mutation and one report read that remain safe when U substitutes every relevant ID with B's IDs.

## Required observable results

A mutation in A succeeds; B mutation and report access are denied without B data. A revoked membership fails with an existing token. Store-specific cache entries never appear in marketplace reads.

## Constraints

Respect [architecture](../../../ARCHITECTURE.md) and the task's store/actor scope. Use real PostgreSQL for concurrency/constraint claims and actual browser interaction for UI claims. Do not mock the exact boundary you are trying to prove.

## Your deliverable

1. State the invariant in one sentence.
2. Write a failing test and record why it fails.
3. Implement the behavior and show actual result/evidence.
4. Explain a naive alternative and a concrete failure case.
5. Complete the variation below without copying the solution.

## Variation

Make U a shopper who has purchased from B; confirm their own order access does not grant B staff permissions.

## Self-check before opening the answer

Can you predict the behavior for a duplicate, missing, unauthorized, or delayed input where applicable? Are your assertions about persisted/public outcomes rather than only helper calls?

[Hints](../hints/03-tenancy.md) · [Solution reasoning](../solutions/03-tenancy.md) · [Guided lesson](../lessons/03-tenancy.md)
