# Definition of done

## Task gate

- Acceptance scenarios pass, including a meaningful negative case.
- Relevant lint/typecheck/build succeeds. No unrelated generated/reference files change.
- Pure logic uses focused unit tests; DB claims use real database tests; browser claims use actual UI checks.
- Scope-sensitive behavior proves cross-store/owner denial and avoids private cache leakage.
- Retry-sensitive behavior proves replay/concurrent-call safety and restart recovery where relevant.
- Schema changes have migration/rollback compatibility notes and empty/upgrade tests.
- Changed contracts update spec, OpenAPI/event schema and traceability.
- Evidence records command, environment, result and commit; a test planned or skipped is not “passed.”
- Independent review completed according to workflow; unresolved blocking findings keep task open.
- Learner can explain the implementation and solve a small variation.

## Milestone gate

Show one full user journey from browser through API and durable state, plus one failure/recovery scenario. No feature is accepted merely because a component renders. Verify all task prerequisites and update the sole tracker. Domain logic coverage target is >=80%; coverage does not replace invariant testing.

## Demo release gate

All required PRD P0/P1 and confirmed extensions are complete; security/accessibility regressions pass; restore and rollback rehearsals are recorded; demo data/secrets are isolated; README claims link to actual evidence. T076 stretch may remain open.

## Scale gate

All original Tier L performance targets require measured results under recorded conditions. Search stricter goal is <150ms p95. If hardware prevents measurement, keep the scale gate unverified and state the exact limitation. A functional portfolio demo may be shown with that label; full PRD acceptance cannot be claimed.

## Production gate

Separate [production roadmap](../production/roadmap.md). Mock payment success, simulated payouts, and a local restore exercise do not establish real-money operational readiness.
