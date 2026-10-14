# Challenge: Uncertain outcomes, webhooks, refunds, and ledgers

Prerequisites: Idempotency and durable events.

Related tasks: T049–T062, T070. Use a scratch branch or the relevant implementation task; do not modify an unrelated completed feature. This exercise is not completed by reading its answer.

## Problem

Simulate provider success followed by a dropped response. Restart the worker and recover. Then race two refunds whose sum exceeds the remaining captured balance.

## Required observable results

One captured charge; worker resolves its status using the same effect key; cumulative pending/completed refunds stay within captured balance; duplicate callback creates no second ledger entry.

## Constraints

Respect [architecture](../../../ARCHITECTURE.md) and the task's store/actor scope. Use real PostgreSQL for concurrency/constraint claims and actual browser interaction for UI claims. Do not mock the exact boundary you are trying to prove.

## Your deliverable

1. State the invariant in one sentence.
2. Write a failing test and record why it fails.
3. Implement the behavior and show actual result/evidence.
4. Explain a naive alternative and a concrete failure case.
5. Complete the variation below without copying the solution.

## Variation

Let stock expire before the success callback; prove the customer gets a tracked refund/void rather than an oversold order.

## Self-check before opening the answer

Can you predict the behavior for a duplicate, missing, unauthorized, or delayed input where applicable? Are your assertions about persisted/public outcomes rather than only helper calls?

[Hints](../hints/09-payments.md) · [Solution reasoning](../solutions/09-payments.md) · [Guided lesson](../lessons/09-payments.md)
