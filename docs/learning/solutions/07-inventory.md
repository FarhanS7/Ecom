# Solution reasoning: Concurrency, reservations, and stock ledgers

This is an expected approach, not a claim that the code is implemented, tested, or reviewed. Attempt [the challenge](../challenges/07-inventory.md) before reading.

## Reasoning

Use conditional stock update within an encompassing transaction, lock/create ACTIVE reservations and insert uniquely keyed movements. Confirm/release lock the reservation and relevant inventory rows and check terminal state before applying deltas. Stable variant order reduces deadlock cycles; bounded whole-transaction retry handles deadlock victims. When expiry wins, commerce records cancellation/release and a later successful payment triggers an idempotent compensation, not a forced negative-stock sale. The exact-50 proof uses independent connections and deterministic provider success with expiry disabled, followed by separate expiry-failure tests.

## Expected evidence

All-success/no-expiry case: 50 reservations, no negative counters. After confirmation, on_hand=0 and reserved=0. Expiry race has exactly one terminal reservation transition; late paid order enters compensation if release won.

Record the actual outcome, command, environment and commit during implementation. A matching explanation without a verified behavior is not sufficient.

## Why a naive solution fails

Read then decrement without a lock/condition; deducting on_hand at reservation and again at confirmation; expiry blindly incrementing stock; lock ordering inconsistent between reserve and expiry; Redis treated as final inventory authority.

Use a concrete input from the lesson to explain the failure. Do not memorize a pattern name without being able to show what it prevents.

## Alternative and tradeoff exercise

Propose one other valid design, identify its added cost, and state the workload or product requirement that would make it preferable. Compare against the related ADR instead of assuming the chosen approach is universally best.

## Review your understanding

- Why does reservation change available without changing on_hand?
- Which lock/state decision resolves expiry racing payment?
- Why does a unit test with mocked repository prove little about overselling?

Then attempt: Reserve two variants where the second has no stock; prove the first reservation and its ledger movement roll back.

After implementation, add a task-specific walkthrough in your journal pointing to actual code lines and explaining review fixes. This reference solution cannot predict line numbers or fixes that do not exist yet.
