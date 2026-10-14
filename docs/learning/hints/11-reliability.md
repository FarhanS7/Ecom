# Hints: Outbox delivery, repeat-safe workers, and tracing

Read one hint at a time. Stop when you can make the next experiment yourself.

## Hint 1

Separate event identity from worker attempt identity.

## Hint 2

A lease allows another relay to recover an abandoned claim.

## Hint 3

Use outbox/receipt/effect evidence to distinguish completed work from an event that only claims it was published.

Return to [the challenge](../challenges/11-reliability.md). The [solution reasoning](../solutions/11-reliability.md) is separate so it does not spoil the attempt by default.
