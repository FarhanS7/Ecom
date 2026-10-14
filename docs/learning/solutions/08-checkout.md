# Solution reasoning: Idempotency, totals, and multi-seller checkout

This is an expected approach, not a claim that the code is implemented, tested, or reviewed. Attempt [the challenge](../challenges/08-checkout.md) before reading.

## Reasoning

Claim the unique key within the transaction; compare normalized payload hashes on existing keys and replay the stored accepted result before checking whether its original quote has since expired. A concurrent duplicate can wait for commit or receive a documented in-progress response. A new checkout verifies its signed quote and rechecks the totals the customer reviewed. The transaction rereads durable cart and current catalog/stock, allocates totals, creates parent/suborders and immutable snapshots, reserves stock/coupon, and writes dispatch event plus exact 202 response. Failure rolls everything back. After commit, a worker uses the order's stable payment effect key. Partial fulfillment is derived from suborders, while payment/refund state remains an independent dimension.

## Expected evidence

One parent order, one suborder per seller, one reservation per variant, one eventual charge, identical successful replay response. Changed normalized payload returns 409 with no new effects.

Record the actual outcome, command, environment and commit during implementation. A matching explanation without a verified behavior is not sufficient.

## Why a naive solution fails

Idempotency only in memory/Redis; recording the key after charging; trusting client totals; one order status trying to encode payment and every seller's shipping state; allocating cents with nondeterministic rounding.

Use a concrete input from the lesson to explain the failure. Do not memorize a pattern name without being able to show what it prevents.

## Alternative and tradeoff exercise

Propose one other valid design, identify its added cost, and state the workload or product requirement that would make it preferable. Compare against the related ADR instead of assuming the chosen approach is universally best.

## Review your understanding

- Why must a reused key with a different payload fail?
- Why is an HTTP 202 not proof of a successful charge?
- Which effects roll back when the last cart line cannot reserve?

Then attempt: Cause the final variant reservation to fail and prove no coupon hold survives.

After implementation, add a task-specific walkthrough in your journal pointing to actual code lines and explaining review fixes. This reference solution cannot predict line numbers or fixes that do not exist yet.
