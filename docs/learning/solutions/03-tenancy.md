# Solution reasoning: Store isolation, ownership, and channel context

This is an expected approach, not a claim that the code is implemented, tested, or reviewed. Attempt [the challenge](../challenges/03-tenancy.md) before reading.

## Reasoning

Resolve actor from session and channel from trusted route configuration. Authorize a specific store permission, then issue scoped queries whose WHERE clauses include the same store. Composite FKs reject inconsistent nested relationships even if application validation misses one. Serialize a seller DTO containing only own seller_order lines; customer order history uses customer ownership instead. On membership change, invalidate permission caches and require current membership for privileged operations. Cache keys encode channel/store, and projection queries apply visibility to counts as well as displayed records.

## Expected evidence

A mutation in A succeeds; B mutation and report access are denied without B data. A revoked membership fails with an existing token. Store-specific cache entries never appear in marketplace reads.

Record the actual outcome, command, environment and commit during implementation. A matching explanation without a verified behavior is not sufficient.

## Why a naive solution fails

Treating a URL store ID as permission; frontend-only filtering; granting platform admin because someone owns a store; forgetting scope on nested assets or counts; membership cached without revocation behavior.

Use a concrete input from the lesson to explain the failure. Do not memorize a pattern name without being able to show what it prevents.

## Alternative and tradeoff exercise

Propose one other valid design, identify its added cost, and state the workload or product requirement that would make it preferable. Compare against the related ADR instead of assuming the chosen approach is universally best.

## Review your understanding

- Why does a public marketplace list not authorize a private seller report?
- Which foreign key prevents attaching another store's variant?
- What cache key would accidentally leak a store-only product?

Then attempt: Make U a shopper who has purchased from B; confirm their own order access does not grant B staff permissions.

After implementation, add a task-specific walkthrough in your journal pointing to actual code lines and explaining review fixes. This reference solution cannot predict line numbers or fixes that do not exist yet.
