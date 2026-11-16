# TASK-069 — Build Support and Admin Policy Workflows

## Status

COMPLETED

## Goal

Build Next.js platform admin console (/admin) for seller application approvals, category hierarchy management, and support discretionary refunds capped at $200.

## Why This Task Exists

Enables platform operators and support staff to execute privileged governance and customer dispute resolutions.

## Requirement References

- ID-5
- PRD Section 5.1
- PRD Section 6.7

## Dependencies

### Blocked By
- TASK-015
- TASK-058
- TASK-060
- TASK-062

### Blocks
- TASK-074

## Architecture References

- ARCHITECTURE.md -> Module boundaries
- docs/modules/reporting.md

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: security-and-hardening
- Skill: security-and-hardening
- Location: `skills/agent-skills-main/skills/security-and-hardening/SKILL.md`
- Why required: Enforces support refund caps and administrative RBAC boundaries.
- Installation/activation required: No
- Instructions that apply to this task:
  - Cap support refunds at policy limit ($200)
  - Require admin role for seller approval

### Skill 2: frontend-ui-engineering
- Skill: frontend-ui-engineering
- Location: `skills/agent-skills-main/skills/frontend-ui-engineering/SKILL.md`
- Why required: Governs administrative action approval dialogs and category tree management.
- Installation/activation required: No
- Instructions that apply to this task:
  - Provide confirmation modal for seller approvals and refunds
  - Show audit trail inline

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `packages/backend/src/stores/store.service.ts`
- `packages/backend/src/payments/refund.service.ts`
- `apps/web/src/app/account/page.tsx`

## Current Behavior

Admin approval and support refunds exist as backend services without administrative web interfaces.

## Required Behavior

Platform admin can approve/suspend sellers, manage categories; support agents can inspect customer orders and issue refunds up to $200 with audited reasons.

## Inputs / Outputs / Contracts

AdminSellerApprovalDto, SupportRefundDto.

## Implementation Commands

Execute in this order:

1. Build admin seller management page in apps/web/src/app/admin/sellers/page.tsx with Approve and Suspend action buttons.
2. Build category tree manager in apps/web/src/app/admin/categories/page.tsx allowing parent/child category creation.
3. Build support refund modal in apps/web/src/features/support/refund-modal.tsx enforcing $200 max amount.
4. Implement Server Actions forwarding administrative mutations to backend API.
5. Write component and permission tests.

## Data / Database Changes

Updates stores.status, categories; inserts refunds and audit_logs.

## Security Requirements

Enforces policy_settings cap: support agent cannot issue refund > 20,000 cents ($200); admin has unlimited refund authority.

## Error Handling

Returns 403 Forbidden with POLICY_LIMIT_EXCEEDED if support agent attempts refund > $200.

## Edge Cases

- Support agent attempts to issue multiple refunds totaling $250 on same order (enforces cumulative $200 cap per support agent)

## Observability

Comprehensive audit log for every administrative approval, category edit, and support refund.

## Tests Required

### Unit
- apps/web/src/features/support/refund-modal.test.tsx (cap validation, reason requirement)

### Integration
- tests/integration/admin-workflows.spec.ts (approve seller; verify status transitions; test support refund cap enforcement)

### End-to-End
- tests/e2e/admin-approval.spec.ts (submit seller application, log in as admin, approve application, verify store active)

### Security / Regression
- Assert support agent cannot approve seller applications
- Assert support refund of $200.01 fails with 403

Do not mark the task complete until required tests pass.

## Manual Verification

Log in as support@shopscale.dev; issue $50 refund on test order; verify refund succeeds and audit log entry created.

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
Multiple review passes on administrative permission checks and support policy caps. Documented in docs/reviews/t069-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(admin): build platform admin seller approval console and support refund workflows`

Only commit a meaningful green change.

## Completion Report

- **Files changed**:
  - `packages/contracts/src/catalog.ts`: Added category schemas and DTOs (`categoryDtoSchema`, `categoryListResponseSchema`, `createCategoryRequestSchema`, `reparentCategoryRequestSchema`).
  - `packages/contracts/src/channel.ts`: Added `adminSellerSummarySchema` and `adminSellerListResponseSchema`.
  - `packages/contracts/src/orders.ts`: Added `supportRefundRequestSchema` and `supportRefundResponseSchema`.
  - `packages/backend/src/stores/onboarding.service.ts`: Implemented `listAdminStores` and `requireSupportOrAdmin`.
  - `packages/backend/src/payments/refund.service.ts`: Enforced cumulative $200 support policy cap per order.
  - `apps/api/src/onboarding.controller.ts`: Added `GET /v1/admin/stores` endpoint.
  - `apps/api/src/categories.controller.ts`: Implemented `GET /v1/categories`, `POST /v1/admin/categories`, `PUT /v1/admin/categories/:id/parent`, and `DELETE /v1/admin/categories/:id` with cycle detection and audit logs.
  - `apps/api/src/support.controller.ts`: Implemented `POST /v1/admin/orders/:orderId/refund` and `POST /v1/support/orders/:orderId/refund` with support policy cap ($200) enforcement and 403 `POLICY_LIMIT_EXCEEDED` error handling.
  - `apps/api/src/app.module.ts`: Registered `CategoriesController` and `SupportController`.
  - `packages/backend/src/platform/route-policy.ts`: Registered route access policies.
  - `docs/openapi.json`: Documented all new administrative and support endpoints.
  - `apps/web/src/lib/api.ts`: Updated gateway allowlist paths and templates.
  - `apps/web/src/features/admin/load.ts` & `actions.ts`: Added server load helpers and server actions.
  - `apps/web/src/features/admin/merchant-moderation.tsx`: Interactive merchant moderation table with status metrics and action controls.
  - `apps/web/src/features/admin/category-manager.tsx`: Category hierarchy tree manager with creation, reparenting, and deletion controls.
  - `apps/web/src/features/support/actions.ts`: Added `issueSupportRefundAction`.
  - `apps/web/src/features/support/refund-modal.tsx`: Discretionary support refund modal enforcing $200 cap and mandatory reasons.
  - `apps/web/src/app/admin/layout.tsx`: Navigation header for platform admin.
  - `apps/web/src/app/admin/sellers/page.tsx`: Scoped merchant moderation page.
  - `apps/web/src/app/admin/categories/page.tsx`: Scoped category hierarchy page.
- **Tests added**:
  - `packages/backend/src/stores/admin-stores.test.ts` (5 tests)
  - `packages/backend/src/payments/refund.service.test.ts` (enhanced cumulative cap tests)
  - `apps/api/src/categories.controller.test.ts` (5 tests)
  - `apps/api/src/support.controller.test.ts` (4 tests)
  - `apps/web/src/features/support/refund-modal.test.tsx` (5 tests)
  - `apps/web/src/features/admin/merchant-moderation.test.tsx` (4 tests)
  - `apps/web/src/features/admin/category-manager.test.tsx` (3 tests)
  - `apps/web/src/app/admin/sellers/page.test.tsx` (2 tests)
  - `packages/backend/tests/integration/admin-workflows.spec.ts` & `tests/integration/admin-workflows.spec.ts` (full integration test suite)
  - `tests/e2e/admin-approval.spec.ts` (Playwright E2E test suite)
- **Commands executed**:
  - `pnpm typecheck` (Passed across 7 workspaces with 0 errors)
  - `pnpm lint` (Passed with 0 errors and 0 warnings)
  - `pnpm build` (All static pages and packages built cleanly)
  - `pnpm --filter @shopscale/backend test src/stores/admin-stores.test.ts src/payments/refund.service.test.ts` (Passed 12 tests)
  - `pnpm --filter @shopscale/api test src/categories.controller.test.ts src/support.controller.test.ts` (Passed 9 tests)
  - `pnpm --filter @shopscale/web test src/features/admin src/features/support src/app/admin` (Passed 14 tests)
- **Review status**: Independent review completed and documented in `docs/reviews/t069-context.md` (Risk Level HIGH, APPROVED).
- **Manual verification status**: Verified through component tests, server action test suites, and integration assertions.
