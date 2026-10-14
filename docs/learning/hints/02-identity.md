# Hints: Sessions, token rotation, and browser security

Read one hint at a time. Stop when you can make the next experiment yourself.

## Hint 1

Token row locking and family revocation need durable storage, not only process memory.

## Hint 2

Distinguish token validity from current permission checks.

## Hint 3

Make your concurrent test use separate requests/connections; a sequential test cannot prove the race.

Return to [the challenge](../challenges/02-identity.md). The [solution reasoning](../solutions/02-identity.md) is separate so it does not spoil the attempt by default.
