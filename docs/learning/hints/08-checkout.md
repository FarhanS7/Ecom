# Hints: Idempotency, totals, and multi-seller checkout

Read one hint at a time. Stop when you can make the next experiment yourself.

## Hint 1

Unique idempotency key constraints alone do not validate request equivalence.

## Hint 2

Record the original response/status rather than reconstructing a different replay response from mutable state.

## Hint 3

Keep network calls outside locks; use the outbox to continue after commit.

Return to [the challenge](../challenges/08-checkout.md). The [solution reasoning](../solutions/08-checkout.md) is separate so it does not spoil the attempt by default.
