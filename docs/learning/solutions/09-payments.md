# Solution reasoning: Uncertain outcomes, webhooks, refunds, and ledgers

This is an expected approach, not a claim that the code is implemented, tested, or reviewed. Attempt [the challenge](../challenges/09-payments.md) before reading.

## Reasoning

Persist an attempt before dispatch and choose a stable operation key. The provider stores one result per key. When acknowledgment is missing, keep the attempt uncertain and reconcile by lookup/retry with that same key. Verify and store webhook receipts uniquely, then let commerce validate order/reservation state. For refunds, lock the captured-payment aggregate, reserve an amount from remaining balance and commit a dispatch event; external acknowledgment finalizes the refund ledger, while a failure releases or reconciles the allocation according to known outcome. Each financial operation balances, and repeated events hit unique operation keys instead of reposting entries.

## Expected evidence

One captured charge; worker resolves its status using the same effect key; cumulative pending/completed refunds stay within captured balance; duplicate callback creates no second ledger entry.

Record the actual outcome, command, environment and commit during implementation. A matching explanation without a verified behavior is not sufficient.

## Why a naive solution fails

Treating timeout as decline; signing parsed/reformatted JSON instead of exact bytes; deduping webhook before verifying signature; allowing each refund to check remaining balance outside a lock; changing old settlement history after a later refund.

Use a concrete input from the lesson to explain the failure. Do not memorize a pattern name without being able to show what it prevents.

## Alternative and tradeoff exercise

Propose one other valid design, identify its added cost, and state the workload or product requirement that would make it preferable. Compare against the related ADR instead of assuming the chosen approach is universally best.

## Review your understanding

- How can the order be pending while the provider already captured funds?
- What prevents two partial refunds exceeding the captured amount?
- Why should late refund create an adjustment after settlement?

Then attempt: Let stock expire before the success callback; prove the customer gets a tracked refund/void rather than an oversold order.

After implementation, add a task-specific walkthrough in your journal pointing to actual code lines and explaining review fixes. This reference solution cannot predict line numbers or fixes that do not exist yet.
