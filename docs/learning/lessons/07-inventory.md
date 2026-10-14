# Concurrency, reservations, and stock ledgers

Learning status: reference material for future implementation. Examples are reasoning sketches, not tested application code.

Related implementation: T037–T040, T044, T053. Prerequisites: Transactions, conditional UPDATE, row locking, and the catalog variant model.

## Choose your route

Guided: read this lesson, implement the linked task, then attempt the [challenge](../challenges/07-inventory.md). Challenge-first: open that file now, use [hints](../hints/07-inventory.md) only if needed, then compare [solution reasoning](../solutions/07-inventory.md).

## Mental model

on_hand means physical units accounted for; reserved means units promised temporarily; available is their difference. Two buyers cannot each make a decision from the same stale available value. The database must evaluate and change the invariant atomically.

## Worked example

Start (on_hand=5,reserved=0). Reserve 2 → (5,2), available 3. Confirm → (3,0), available 3. Releasing after confirmation is a no-op because the reservation is no longer ACTIVE. A ledger records deltas (0,+2), then (-2,-2).

```
UPDATE inventory
SET reserved = reserved + $2, version = version + 1
WHERE variant_id = $1
  AND on_hand - reserved >= $2
RETURNING on_hand, reserved;
-- Require positive validated quantity. Zero returned rows means no reservation.
-- Reservation state and ledger writes belong in the same transaction.
```

## Guided implementation

1. Write counter arithmetic as pure examples before SQL.
2. Add DB CHECK constraints as a last line of defense.
3. Reserve sorted variant IDs within one transaction; roll back the whole basket on any shortage.
4. Gate confirm/release by reservation state and commit movement rows with counters.
5. Race requests using independent connections; inspect final database state and ledger, not just HTTP status.

Use [the task tracker](../../../tasks/todo.md) for the concrete implementation order. Do not implement a lesson's later-stage example before its task prerequisites are present.

## Common mistakes

Read then decrement without a lock/condition; deducting on_hand at reservation and again at confirmation; expiry blindly incrementing stock; lock ordering inconsistent between reserve and expiry; Redis treated as final inventory authority.

## Explain it without looking

- Why does reservation change available without changing on_hand?
- Which lock/state decision resolves expiry racing payment?
- Why does a unit test with mocked repository prove little about overselling?

Write answers in your own learning journal. Include one counterexample to the naive approach, a test that catches it, and a condition under which a different design would be better.

## Transfer exercise

Reserve two variants where the second has no stock; prove the first reservation and its ledger movement roll back.

## Reference

[PostgreSQL locking](https://www.postgresql.org/docs/current/explicit-locking.html). Project-specific choices are explained in [architecture](../../../ARCHITECTURE.md); framework documentation does not establish that our future implementation passes its tests.
