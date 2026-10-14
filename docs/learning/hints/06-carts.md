# Hints: Durable carts, caching, and merge semantics

Read one hint at a time. Stop when you can make the next experiment yourself.

## Hint 1

Set-quantity is naturally easier to replay than increment-quantity.

## Hint 2

A unique merge record and cart mutation must commit together.

## Hint 3

Version the cached representation and validate owner/channel from the request context.

Return to [the challenge](../challenges/06-carts.md). The [solution reasoning](../solutions/06-carts.md) is separate so it does not spoil the attempt by default.
