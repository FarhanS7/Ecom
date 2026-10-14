# Solution reasoning: Durable carts, caching, and merge semantics

This is an expected approach, not a claim that the code is implemented, tested, or reviewed. Attempt [the challenge](../challenges/06-carts.md) before reading.

## Reasoning

Use database uniqueness for one cart per owner/channel and lock or version-check mutations. For merge, verify the guest proof, lock both carts in a stable order, insert a unique merge receipt, combine quantities with a cap, and commit together. A second attempt sees the receipt and returns current state without another addition. Invalidate or update the cache only after commit, and rebuild it from DB after failure. Checkout intentionally bypasses cached price/stock authority and rereads canonical values.

## Expected evidence

Merged quantity remains 5, unrelated channel unchanged, DB-backed reload returns the same cart, and other users cannot retrieve it by guessing the cart ID.

Record the actual outcome, command, environment and commit during implementation. A matching explanation without a verified behavior is not sufficient.

## Why a naive solution fails

Global cart cache key without channel; trusting displayed price at checkout; merging all store carts together; retrying cache writes in a way that reverses a newer DB state; reserving stock at add-to-cart time.

Use a concrete input from the lesson to explain the failure. Do not memorize a pattern name without being able to show what it prevents.

## Alternative and tradeoff exercise

Propose one other valid design, identify its added cost, and state the workload or product requirement that would make it preferable. Compare against the related ADR instead of assuming the chosen approach is universally best.

## Review your understanding

- What survives a Redis flush?
- How is merge retry different from setting quantity to a desired value?
- Why should the cart remain visible when a line becomes unavailable?

Then attempt: Make the sum exceed 99 and design an explicit adjustment notice without silently dropping an entire line.

After implementation, add a task-specific walkthrough in your journal pointing to actual code lines and explaining review fixes. This reference solution cannot predict line numbers or fixes that do not exist yet.
