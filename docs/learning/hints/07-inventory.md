# Hints: Concurrency, reservations, and stock ledgers

Read one hint at a time. Stop when you can make the next experiment yourself.

## Hint 1

Count committed orders/reservations and inspect the ledger, not merely successful promises.

## Hint 2

Acquire locks in the same order in every competing flow.

## Hint 3

A payment callback can arrive after your TTL; releasing inventory does not cancel the external payment automatically.

Return to [the challenge](../challenges/07-inventory.md). The [solution reasoning](../solutions/07-inventory.md) is separate so it does not spoil the attempt by default.
