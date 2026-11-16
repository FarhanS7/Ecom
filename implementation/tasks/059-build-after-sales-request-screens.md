# TASK-059 — Build After-Sales Request Screens

## Status

COMPLETED

## Goal

Build Next.js screens for customer return requests (/account/orders/[id]/return) and seller return inspection/approval console (/seller/returns).

## Why This Task Exists

Provides shoppers with self-service return workflows and merchants with physical return inspection controls.

## Requirement References

- REQ-COMM-003
- design.md

## Dependencies

### Blocked By
- TASK-057
- TASK-058

### Blocks
- TASK-069

## Architecture References

- ARCHITECTURE.md -> Frontend
- docs/architecture/frontend.md

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: frontend-ui-engineering
- Skill: frontend-ui-engineering
- Location: `skills/agent-skills-main/skills/frontend-ui-engineering/SKILL.md`
- Why required: Governs after-sales form controls, reason selectors, and seller decision modals.
- Installation/activation required: No
- Instructions that apply to this task:
  - Provide reason dropdown with text area for notes
  - Include 'Restock Item' checkbox on seller approval

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `apps/web/src/app/account/orders/[id]/page.tsx`
- `apps/web/src/features/seller/actions.ts`
- `apps/web/src/components/ui/modal.tsx`

## Current Behavior

No UI exists for customer return requests or seller return approvals.

## Required Behavior

Customer can select items to return with reasons; seller can review pending returns, approve with restocking option, or reject with reason note.

## Inputs / Outputs / Contracts

ReturnFormProps and SellerReturnReviewProps in apps/web/src/features/returns/.

## Implementation Commands

Execute in this order:

1. Build customer return request page in apps/web/src/app/account/orders/[id]/return/page.tsx.
2. Build ReturnReasonSelector component with preset options (Defective, Wrong Item, Changed Mind).
3. Build seller return queue dashboard in apps/web/src/app/seller/returns/page.tsx.
4. Build SellerInspectionModal component allowing approval with restock toggle or rejection.
5. Write component tests and form interaction tests.

## Data / Database Changes

None.

## Security Requirements

Enforces store scoping: seller can inspect only returns for items sold by their store.

## Error Handling

Displays inline error if return window has expired.

## Edge Cases

- Customer re-submitting return request while previous request is pending (form indicates existing active return)

## Observability

Return request submission telemetry.

## Tests Required

### Unit
- apps/web/src/features/returns/return-form.test.tsx (reason selection, quantity validation)

### Integration
- apps/web/src/features/returns/seller-approval.test.ts (seller action submits approval decision)

### End-to-End
- tests/e2e/returns.spec.ts (customer submits return; seller approves with restock; verify status updates)

### Security / Regression
- None.

Do not mark the task complete until required tests pass.

## Manual Verification

Submit return request in customer view; open /seller/returns; approve return; verify return status is APPROVED.

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

## Independent Review Requirement

Risk Level:
LOW

Review requirements:
Single review pass focusing on customer usability and seller decision audit trails. Documented in docs/reviews/t059-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(web): build customer return request screens and seller inspection console`

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
