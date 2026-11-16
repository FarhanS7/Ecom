# TASK-074 — Complete Security Regression Coverage

## Status

COMPLETED

## Goal

Build comprehensive security regression test suite covering authorization matrix, SQL injection, IDOR, brute-force bypass, and CSRF protection.

## Why This Task Exists

Provides complete verification of platform security requirements and guarantees zero regression before release.

## Requirement References

- G4
- PRD Section 5.1
- PRD Section 5.2
- SECURITY_PLAN.md

## Dependencies

### Blocked By
- TASK-018
- TASK-060
- TASK-069

### Blocks
- TASK-088

## Architecture References

- ARCHITECTURE.md -> Authorization
- SECURITY_PLAN.md

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: security-and-hardening
- Skill: security-and-hardening
- Location: `skills/agent-skills-main/skills/security-and-hardening/SKILL.md`
- Why required: Governs automated penetration testing, IDOR validation, and security regression suites.
- Installation/activation required: No
- Instructions that apply to this task:
  - Test IDOR on every resource ID parameter
  - Assert SQL injection fuzzing returns zero syntax errors

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `packages/backend/src/stores/permissions.test.ts`
- `packages/backend/src/platform/security.ts`
- `SECURITY_PLAN.md`

## Current Behavior

Basic authorization matrix test covers early routes; new routes in commerce, fulfillment, and refunds require full regression coverage.

## Required Behavior

Automated security suite tests 100% of declared routes against all roles; attempts IDOR parameter tampering; tests SQL injection payloads; asserts 100% pass rate.

## Inputs / Outputs / Contracts

Security regression suite in tests/security/security-regression.spec.ts.

## Implementation Commands

Execute in this order:

1. Expand authorization matrix harness to include all Milestone 3–7 routes (refunds, fulfillment, returns, coupons, settings).
2. Add IDOR fuzzing test: submit requests replacing {storeId}, {orderId}, {addressId} with IDs from another user/store.
3. Assert every unauthorized access returns 401, 403, or uniform 404.
4. Add SQL injection fuzzing suite testing tsquery and filter parameters.
5. Write test asserting CSRF token mismatch rejects mutating browser requests.
6. Execute full security suite and document report in docs/reviews/t074-context.md.

## Data / Database Changes

None.

## Security Requirements

Enforces complete defense-in-depth across the application API.

## Error Handling

All security violations return standard RFC 7807 problem details without leaking internal system state.

## Edge Cases

- Support agent attempting to refund $200.01 (blocked by policy cap check)
- Seller 1 attempting to view Seller 2's fulfillment events (blocked with 404)

## Observability

Security regression audit summary.

## Tests Required

### Unit
- None.

### Integration
- tests/security/security-regression.spec.ts (100% route x role matrix, IDOR resistance, SQL injection fuzzing, CSRF validation)

### End-to-End
- None.

### Security / Regression
- Full automated security regression suite execution

Do not mark the task complete until required tests pass.

## Manual Verification

Run 'pnpm test:security'; verify all security assertions pass with zero failures.

## Definition of Done

- [x] Required skills inspected and activated
- [x] Requirement behavior implemented
- [x] Architecture rules followed
- [x] Security requirements satisfied
- [x] Tests added
- [x] Relevant tests pass
- [x] Lint passes
- [x] Typecheck passes
- [x] Build passes
- [x] Documentation updated where required
- [x] Requirement traceability updated
- [x] Independent review completed according to risk
- [x] No unresolved blocking review findings
- [x] Manual verification completed when required

## Independent Review Requirement

Risk Level:
HIGH

Review requirements:
Multiple review passes on permission coverage and uniform 404 enforcement. Documented in docs/reviews/t074-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`test(security): complete comprehensive authorization matrix and idor regression suite`

Only commit a meaningful green change.

## Completion Report

### Files Changed
- `tests/security/security-regression.spec.ts` (Automated security regression test suite)
- `vitest.config.ts` (Root vitest configuration for integration, chaos, and security suites)
- `package.json` (Added `test:security` script)
- `docs/reviews/t074-context.md` (Independent review artifact across 5 passes)
- `implementation/tasks/074-complete-security-regression-coverage.md` (Status, DoD, and completion report)
- `implementation/REQUIREMENT_TRACEABILITY.md` (Traceability update for G4)

### Migrations Created
None.

### Tests Added
- `tests/security/security-regression.spec.ts` (12 tests covering RBAC/ABAC role boundaries, IDOR resistance, Uniform 404 rule, support $200 refund cap, SQL injection fuzzing, and CSRF same-origin validation)

### Commands Executed
- `pnpm test:security` (PASSED, 12/12 tests)
- `pnpm test:chaos` (PASSED, 4/4 tests)
- `pnpm typecheck` (PASSED, 7/7 projects)
- `pnpm lint` (PASSED, 0 errors)

### Assumptions
- Store endpoints strictly adhere to the Uniform 404 Rule to avoid leaking tenant resource existence or store UUIDs.
- Support agent refunds are capped at $200.00 (20,000 cents) cumulative per order unless escalated to platform administrators.

### Known Limitations
- None; the security regression suite runs standalone and completes in < 4s without external infrastructure dependencies.

### Review Status
APPROVED across 5 passes in `docs/reviews/t074-context.md` (Risk Level: HIGH).

### Manual Verification Status
Verified via running `pnpm test:security` which passed all 12 security regression tests with zero failures.
