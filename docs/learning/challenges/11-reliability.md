# Challenge: Outbox delivery, repeat-safe workers, and tracing

Prerequisites: Database transactions and the payment lesson's uncertain-outcome model.

Related tasks: T029–T030, T061, T071–T074. Use a scratch branch or the relevant implementation task; do not modify an unrelated completed feature. This exercise is not completed by reading its answer.

## Problem

Kill relay after enqueue but before mark, then kill a consumer after its DB commit but before acknowledgment. Repeat the same event.

## Required observable results

The business mutation occurs once, delivery may repeat, receipt and mutation agree, and every required order effect eventually completes or remains visibly failed.

## Constraints

Respect [architecture](../../../ARCHITECTURE.md) and the task's store/actor scope. Use real PostgreSQL for concurrency/constraint claims and actual browser interaction for UI claims. Do not mock the exact boundary you are trying to prove.

## Your deliverable

1. State the invariant in one sentence.
2. Write a failing test and record why it fails.
3. Implement the behavior and show actual result/evidence.
4. Explain a naive alternative and a concrete failure case.
5. Complete the variation below without copying the solution.

## Variation

Recreate the jobs Redis container with empty data while retaining PostgreSQL; recover published-but-unconsumed effects through reconciliation.

## Self-check before opening the answer

Can you predict the behavior for a duplicate, missing, unauthorized, or delayed input where applicable? Are your assertions about persisted/public outcomes rather than only helper calls?

[Hints](../hints/11-reliability.md) · [Solution reasoning](../solutions/11-reliability.md) · [Guided lesson](../lessons/11-reliability.md)
