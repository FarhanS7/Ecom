# Solution reasoning: Relational modeling, snapshots, and stable pagination

This is an expected approach, not a claim that the code is implemented, tested, or reviewed. Attempt [the challenge](../challenges/04-catalog.md) before reading.

## Reasoning

Use a validated cursor containing version, channel, filters, sort, and last sort values. Apply row-value comparison with matching order and an index beginning with the relevant equality predicates. Keep product status/publication conditions in the query. Fetch one extra row to decide whether nextCursor exists. For unchanged data the tie-breaker yields deterministic traversal; concurrent edits can move rows, so the UI may refresh rather than promise an immutable listing snapshot. Copy title/SKU/unit price into order_items during checkout to preserve historical facts.

## Expected evidence

On an unchanged dataset, walking pages returns each eligible ID once in (price,id) order. Invalid/mismatched cursor yields 400. Store-only products never appear in marketplace results.

Record the actual outcome, command, environment and commit during implementation. A matching explanation without a verified behavior is not sufficient.

## Why a naive solution fails

Duplicating editable prices at product and variant level; assuming UUID alone protects ownership; index every column blindly; promising a stable historical snapshot across live changing catalog pages without a snapshot protocol.

Use a concrete input from the lesson to explain the failure. Do not memorize a pattern name without being able to show what it prevents.

## Alternative and tradeoff exercise

Propose one other valid design, identify its added cost, and state the workload or product requirement that would make it preferable. Compare against the related ADR instead of assuming the chosen approach is universally best.

## Review your understanding

- What happens when price ties lack an ID tie-breaker?
- Why is a product's current title unsuitable as the only invoice title?
- What mutation anomalies remain possible with keyset pagination over live data?

Then attempt: Add descending popularity order and explain which tuple comparison and index direction changes.

After implementation, add a task-specific walkthrough in your journal pointing to actual code lines and explaining review fixes. This reference solution cannot predict line numbers or fixes that do not exist yet.
