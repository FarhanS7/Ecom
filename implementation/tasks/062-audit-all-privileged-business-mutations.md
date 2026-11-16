# TASK-062 — Audit All Privileged Business Mutations

## Status

COMPLETED

## Goal

Build global AuditWriter port capturing actor_id, store_id, action, entity_type, entity_id, and redacted before/after JSON for all privileged mutations.

## Why This Task Exists

Guarantees complete regulatory auditability for vendor, support, and administrative actions.

## Requirement References

- AD-1
- G4
- PRD Section 6.7

## Dependencies

### Blocked By
- TASK-003
- TASK-015
- TASK-020
- TASK-056
- TASK-060

### Blocks
- TASK-067
- TASK-069
- TASK-082

## Architecture References

- ARCHITECTURE.md -> Module boundaries
- docs/architecture/conventions.md

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: security-and-hardening
- Skill: security-and-hardening
- Location: `skills/agent-skills-main/skills/security-and-hardening/SKILL.md`
- Why required: Governs privileged mutation auditing and automatic PII redaction.
- Installation/activation required: No
- Instructions that apply to this task:
  - Redact passwords and session tokens
  - Make audit_logs append-only with no UPDATE/DELETE grants

### Skill 2: observability-and-instrumentation
- Skill: observability-and-instrumentation
- Location: `skills/agent-skills-main/skills/observability-and-instrumentation/SKILL.md`
- Why required: Governs structured audit logs and compliance tracking.
- Installation/activation required: No
- Instructions that apply to this task:
  - Capture actor IP and request ID
  - Record before and after state diffs

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `db/migrations/0003-audit.sql`
- `packages/backend/src/platform/security.ts`
- `docs/modules/platform.md`

## Current Behavior

0003-audit.sql exists with audit_logs table, but mutations across stores, catalog, fulfillment, and refunds do not invoke audit logging systematically.

## Required Behavior

All privileged mutations (seller approvals, product archival, fulfillment transitions, manual stock adjustments, refunds, policy edits) write append-only records to audit_logs.

## Inputs / Outputs / Contracts

AuditEntry: { actorId: string, storeId?: string, action: string, entityType: string, entityId: string, before?: Record<string, any>, after?: Record<string, any>, ip: string, requestId: string }.

## Implementation Commands

Execute in this order:

1. Implement AuditWriterPort in packages/backend/src/platform/audit.service.ts.
2. Build state sanitizer redacting passwords, session tokens, and credit card numbers from before/after payloads.
3. Wire AuditWriter into: StoreService.approveStore, SellerCatalogService.archiveProduct, InventoryService.adjustStock, FulfillmentService.transition, RefundService.issueRefund.
4. Expose GET /v1/admin/audit-logs restricted strictly to platform administrators.
5. Write integration tests in tests/integration/audit.spec.ts.

## Data / Database Changes

Inserts append-only rows into audit_logs table.

## Security Requirements

audit_logs table has no UPDATE or DELETE application paths; read access restricted strictly to admin and support roles.

## Error Handling

Audit write failures must abort the enclosing business transaction to prevent un-audited state mutations.

## Edge Cases

- Large JSON before/after payloads (truncates unbounded string fields to 1000 characters to prevent database bloat)

## Observability

Audit log emission metrics.

## Tests Required

### Unit
- packages/backend/src/platform/audit-sanitizer.test.ts (token redaction, password stripping, JSON truncation)

### Integration
- tests/integration/audit.spec.ts (perform seller approval, stock adjustment, and refund; verify audit_logs table contains matching rows with IP and requestId)

### End-to-End
- None.

### Security / Regression
- Assert non-admin cannot access GET /v1/admin/audit-logs

Do not mark the task complete until required tests pass.

## Manual Verification

Perform stock adjustment in seller console; query audit_logs table in psql; verify actor, old stock, and new stock recorded.

## Definition of Done

- [ ] Required skills inspected and activated
- [ ] Requirement behavior implemented
- [ ] Architecture rules followed
- [ ] Security requirements satisfied
- [ ] Tests added
- [ ] Relevant tests pass
- [ ] Lint passes
- [ ] Typecheck passes
- [ ] Build passes
- [ ] Documentation updated where required
- [ ] Requirement traceability updated
- [ ] Independent review completed according to risk
- [ ] No unresolved blocking review findings
- [ ] Manual verification completed when required
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
MEDIUM

Review requirements:
Single thorough review pass focusing on redaction of sensitive data and transaction coupling. Documented in docs/reviews/t062-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(platform): implement privileged mutation audit logging across all domain services`

Only commit a meaningful green change.

## Completion Report

When finished, report:

- files changed,
- migrations created,
- tests added,
- commands executed,
- test results,
- assumptions,
- known limitations,
- review status,
- manual verification status.

Do not simply report "done."
