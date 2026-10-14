# Challenge: Search projections, facets, and eventual consistency

Prerequisites: Catalog queries, events, and basic text normalization.

Related tasks: T030–T034, T081. Use a scratch branch or the relevant implementation task; do not modify an unrelated completed feature. This exercise is not completed by reading its answer.

## Problem

Build a projection that receives product versions 1, 3, 2, 3 in that order. Version 3 disables marketplace publication. Add a typo query and a store-specific facet check.

## Required observable results

Final source_version is 3, marketplace never exposes the disabled product after canonical gating, duplicate delivery causes no duplicate document, and the known typo fixture returns an eligible target.

## Constraints

Respect [architecture](../../../ARCHITECTURE.md) and the task's store/actor scope. Use real PostgreSQL for concurrency/constraint claims and actual browser interaction for UI claims. Do not mock the exact boundary you are trying to prove.

## Your deliverable

1. State the invariant in one sentence.
2. Write a failing test and record why it fails.
3. Implement the behavior and show actual result/evidence.
4. Explain a naive alternative and a concrete failure case.
5. Complete the variation below without copying the solution.

## Variation

Delete/archive the canonical product during a full reindex and prove no delayed event makes it public again.

## Self-check before opening the answer

Can you predict the behavior for a duplicate, missing, unauthorized, or delayed input where applicable? Are your assertions about persisted/public outcomes rather than only helper calls?

[Hints](../hints/05-search.md) · [Solution reasoning](../solutions/05-search.md) · [Guided lesson](../lessons/05-search.md)
