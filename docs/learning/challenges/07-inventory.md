# Challenge: Concurrency, reservations, and stock ledgers

Prerequisites: Transactions, conditional UPDATE, row locking, and the catalog variant model.

Related tasks: T037–T040, T044, T053. Use a scratch branch or the relevant implementation task; do not modify an unrelated completed feature. This exercise is not completed by reading its answer.

## Problem

Prove 50 units cannot produce more than 50 reservations when 500 requests use both channels. Then race confirmation against expiry for one reservation.

## Required observable results

All-success/no-expiry case: 50 reservations, no negative counters. After confirmation, on_hand=0 and reserved=0. Expiry race has exactly one terminal reservation transition; late paid order enters compensation if release won.

## Constraints

Respect [architecture](../../../ARCHITECTURE.md) and the task's store/actor scope. Use real PostgreSQL for concurrency/constraint claims and actual browser interaction for UI claims. Do not mock the exact boundary you are trying to prove.

## Your deliverable

1. State the invariant in one sentence.
2. Write a failing test and record why it fails.
3. Implement the behavior and show actual result/evidence.
4. Explain a naive alternative and a concrete failure case.
5. Complete the variation below without copying the solution.

## Variation

Reserve two variants where the second has no stock; prove the first reservation and its ledger movement roll back.

## Self-check before opening the answer

Can you predict the behavior for a duplicate, missing, unauthorized, or delayed input where applicable? Are your assertions about persisted/public outcomes rather than only helper calls?

[Hints](../hints/07-inventory.md) · [Solution reasoning](../solutions/07-inventory.md) · [Guided lesson](../lessons/07-inventory.md)
