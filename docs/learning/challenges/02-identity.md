# Challenge: Sessions, token rotation, and browser security

Prerequisites: HTTP requests, cookies, hashing versus encryption, and a basic SQL transaction.

Related tasks: T009–T013, T017. Use a scratch branch or the relevant implementation task; do not modify an unrelated completed feature. This exercise is not completed by reading its answer.

## Problem

Implement refresh rotation with a family record. Prove normal rotation succeeds and old-token reuse revokes the family. Show what happens when two requests race the same refresh token.

## Required observable results

One rotation creates one successor. Reuse rejects and revokes the family. Subsequent protected requests fail after revocation. Expired proofs never create a session. Responses/logs contain no raw refresh token except its intended cookie transport.

## Constraints

Respect [architecture](../../../ARCHITECTURE.md) and the task's store/actor scope. Use real PostgreSQL for concurrency/constraint claims and actual browser interaction for UI claims. Do not mock the exact boundary you are trying to prove.

## Your deliverable

1. State the invariant in one sentence.
2. Write a failing test and record why it fails.
3. Implement the behavior and show actual result/evidence.
4. Explain a naive alternative and a concrete failure case.
5. Complete the variation below without copying the solution.

## Variation

Revoke a store membership while the user's general shopping session remains valid; store editing must fail but their own order history remains accessible.

## Self-check before opening the answer

Can you predict the behavior for a duplicate, missing, unauthorized, or delayed input where applicable? Are your assertions about persisted/public outcomes rather than only helper calls?

[Hints](../hints/02-identity.md) · [Solution reasoning](../solutions/02-identity.md) · [Guided lesson](../lessons/02-identity.md)
