# Challenge: Measurement, release evidence, and operational learning

Prerequisites: Working end-to-end demo and meaningful correctness tests.

Related tasks: T066–T067, T071–T090. Use a scratch branch or the relevant implementation task; do not modify an unrelated completed feature. This exercise is not completed by reading its answer.

## Problem

Design and run one catalog benchmark with fixed seed and recorded environment. Then restore the dataset to an isolated target and verify a checkout.

## Required observable results

Report has command, commit, data counts, hardware/allocation, raw latency/error output and a clear pass/fail/unverified label. Restore does not overwrite source; invariant checks and purchase succeed or failure is documented.

## Constraints

Respect [architecture](../../../ARCHITECTURE.md) and the task's store/actor scope. Use real PostgreSQL for concurrency/constraint claims and actual browser interaction for UI claims. Do not mock the exact boundary you are trying to prove.

## Your deliverable

1. State the invariant in one sentence.
2. Write a failing test and record why it fails.
3. Implement the behavior and show actual result/evidence.
4. Explain a naive alternative and a concrete failure case.
5. Complete the variation below without copying the solution.

## Variation

Limit database memory and compare query plans/cache behavior without changing the dataset; explain the observed tradeoff.

## Self-check before opening the answer

Can you predict the behavior for a duplicate, missing, unauthorized, or delayed input where applicable? Are your assertions about persisted/public outcomes rather than only helper calls?

[Hints](../hints/12-operations.md) · [Solution reasoning](../solutions/12-operations.md) · [Guided lesson](../lessons/12-operations.md)
