# Solution reasoning: Outbox delivery, repeat-safe workers, and tracing

This is an expected approach, not a claim that the code is implemented, tested, or reviewed. Attempt [the challenge](../challenges/11-reliability.md) before reading.

## Reasoning

Commit outbox in the order transaction. Claim relay work with a lease, enqueue stable IDs, then mark published. Duplicate publication is normal. A DB consumer inserts its unique receipt and performs mutation in one transaction, so post-commit replay skips without reapplying. External effects use a provider/local sink key and reconciliation on uncertainty. A recovery scan checks required event consumers/effects rather than assuming published_at means completion, allowing loss of broker data to be repaired. Traces correlate stages; metrics count lag/failures with bounded labels.

## Expected evidence

The business mutation occurs once, delivery may repeat, receipt and mutation agree, and every required order effect eventually completes or remains visibly failed.

Record the actual outcome, command, environment and commit during implementation. A matching explanation without a verified behavior is not sufficient.

## Why a naive solution fails

Claiming exactly-once delivery; inserting receipt before a transaction and never rolling it back; deleting jobs to hide failures; high-cardinality metric labels; queue-only durability with no reconciliation after Redis loss.

Use a concrete input from the lesson to explain the failure. Do not memorize a pattern name without being able to show what it prevents.

## Alternative and tradeoff exercise

Propose one other valid design, identify its added cost, and state the workload or product requirement that would make it preferable. Compare against the related ADR instead of assuming the chosen approach is universally best.

## Review your understanding

- Which crash creates duplicate delivery even with a correct outbox?
- Why can a receipt not by itself guarantee one external email?
- How would you recover if a published queue job vanished before consumption?

Then attempt: Recreate the jobs Redis container with empty data while retaining PostgreSQL; recover published-but-unconsumed effects through reconciliation.

After implementation, add a task-specific walkthrough in your journal pointing to actual code lines and explaining review fixes. This reference solution cannot predict line numbers or fixes that do not exist yet.
