# Solution reasoning: Sessions, token rotation, and browser security

This is an expected approach, not a claim that the code is implemented, tested, or reviewed. Attempt [the challenge](../challenges/02-identity.md) before reading.

## Reasoning

Lock the refresh row and inspect the family in the same transaction. Consuming R1 and storing the hash of R2 must commit together. A competing request that observes R1 consumed revokes the family, invalidating any successor from that family according to the chosen strict policy. Serializing legitimate browser refresh reduces accidental revocations but does not replace server checks. Every protected request checks current family state and privileged store requests check current membership. Password reset uses a purpose-bound one-use proof and revokes existing sessions. This is a project policy to validate, not a universal refresh behavior every library automatically supplies.

## Expected evidence

One rotation creates one successor. Reuse rejects and revokes the family. Subsequent protected requests fail after revocation. Expired proofs never create a session. Responses/logs contain no raw refresh token except its intended cookie transport.

Record the actual outcome, command, environment and commit during implementation. A matching explanation without a verified behavior is not sufficient.

## Why a naive solution fails

Treating localStorage as a safe long-lived credential store; forgetting CSRF because cookies are HttpOnly; trusting roles forever from a stale token; using one token purpose for both reset and verification.

Use a concrete input from the lesson to explain the failure. Do not memorize a pattern name without being able to show what it prevents.

## Alternative and tradeoff exercise

Propose one other valid design, identify its added cost, and state the workload or product requirement that would make it preferable. Compare against the related ADR instead of assuming the chosen approach is universally best.

## Review your understanding

- Why can HttpOnly cookies still require CSRF protection?
- What happens if a consumed refresh token arrives after logout?
- How can a valid JWT accompany a forbidden store mutation?

Then attempt: Revoke a store membership while the user's general shopping session remains valid; store editing must fail but their own order history remains accessible.

After implementation, add a task-specific walkthrough in your journal pointing to actual code lines and explaining review fixes. This reference solution cannot predict line numbers or fixes that do not exist yet.
