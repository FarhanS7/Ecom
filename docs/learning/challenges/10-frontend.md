# Challenge: Server/client boundaries, accessible UI, and real flows

Prerequisites: React/Next.js familiarity and the project's API/channel contracts.

Related tasks: T023–T027, T032, T043, T048, T057–T059, T064–T069, T075, T080. Use a scratch branch or the relevant implementation task; do not modify an unrelated completed feature. This exercise is not completed by reading its answer.

## Problem

Build a channel-aware cart UI and checkout pending state. It must work by keyboard at 390px width and recover from a stale cart version without losing the user's context.

## Required observable results

Store cart never shows marketplace-only lines; errors are announced; focus remains usable; 202 is pending; subsequent paid response changes state; repeated submit uses the same intended operation key.

## Constraints

Respect [architecture](../../../ARCHITECTURE.md) and the task's store/actor scope. Use real PostgreSQL for concurrency/constraint claims and actual browser interaction for UI claims. Do not mock the exact boundary you are trying to prove.

## Your deliverable

1. State the invariant in one sentence.
2. Write a failing test and record why it fails.
3. Implement the behavior and show actual result/evidence.
4. Explain a naive alternative and a concrete failure case.
5. Complete the variation below without copying the solution.

## Variation

Switch between two store themes with long product titles and reduced motion enabled; preserve layout and contrast.

## Self-check before opening the answer

Can you predict the behavior for a duplicate, missing, unauthorized, or delayed input where applicable? Are your assertions about persisted/public outcomes rather than only helper calls?

[Hints](../hints/10-frontend.md) · [Solution reasoning](../solutions/10-frontend.md) · [Guided lesson](../lessons/10-frontend.md)
