# Hints: Boundaries, TypeScript, and a reproducible workspace

Read one hint at a time. Stop when you can make the next experiment yourself.

## Hint 1

Separate parsing from business construction so invalid values fail before the HTTP server starts.

## Hint 2

Readiness can check a dependency with a bounded timeout; liveness should not call that dependency.

## Hint 3

Test the public response shape and startup outcome instead of private helper call counts.

Return to [the challenge](../challenges/01-foundations.md). The [solution reasoning](../solutions/01-foundations.md) is separate so it does not spoil the attempt by default.
