# Independent Review: TASK-069 — Build Support and Admin Policy Workflows

## Review Metadata
- **Task ID**: `TASK-069`
- **Goal**: Build Next.js platform admin console (/admin) for seller application approvals, category hierarchy management, and support discretionary refunds capped at $200.
- **Risk Level**: HIGH
- **Requirements Covered**: `ID-5`, PRD Section 5.1, PRD Section 6.7
- **Date**: 2026-11-17
- **Status**: APPROVED

---

## 1. Scope & Architecture Inspected

### Administrative & Support API Layer
- `apps/api/src/onboarding.controller.ts`:
  - Added `GET /v1/admin/stores`:
    - Authenticated via `SessionGuard`.
    - Gated by `requirePlatformAdmin` in `listAdminStores`. Non-admins receive 403 Forbidden.
    - Supports optional query parameter `status` (`pending`, `active`, `suspended`).
    - Returns array of stores with owner email and creation timestamps.
  - `POST /v1/admin/stores/:storeId/approve` and `POST /v1/admin/stores/:storeId/suspend`:
    - Transition store status with transactional audit log entry (`store.approved`, `store.suspended`).
- `apps/api/src/categories.controller.ts`:
  - `GET /v1/categories`: Public list of categories with materialized paths (`/parent/child/`).
  - `POST /v1/admin/categories`: Platform admin only. Validates name and lowercase hyphenated slug via `createCategoryRequestSchema`. Records audit log `category.created`.
  - `PUT /v1/admin/categories/:id/parent`: Platform admin only. Reparents category with cycle detection. Rejects cycles with 409 Conflict. Records audit log `category.reparented`.
  - `DELETE /v1/admin/categories/:id`: Platform admin only. Deletes category, catching DB RESTRICT constraint (preventing deletion if children or products are attached) and returning 409 Conflict. Records audit log `category.deleted`.
- `apps/api/src/support.controller.ts`:
  - `POST /v1/admin/orders/:orderId/refund` & `POST /v1/support/orders/:orderId/refund`:
    - Authenticated via `SessionGuard`.
    - Gated by `requireSupportOrAdmin` (checks `user_platform_roles` directly in database).
    - Validates request payload using `supportRefundRequestSchema` (orderId, amountCents, mandatory reason min 3 chars).
    - If caller holds `support` platform role without `admin`, `isSupportAgent = true` and `policyCapCents = 20000` ($200.00).
    - If caller holds `admin` platform role, `isSupportAgent = false` (unlimited refund authority).
    - Non-support / non-admin actors receive 403 Forbidden.
    - Catches `RefundPolicyCapExceededError`: throws 403 Forbidden with exact code `POLICY_LIMIT_EXCEEDED`.
    - Catches `RefundExceedsPaymentError` and `InvalidRefundAmountError`: throws 400 Bad Request.
    - Catches `NoPaidPaymentError`: throws 404 Not Found.
- `packages/backend/src/platform/route-policy.ts`:
  - Registered all new admin, category, and support refund routes.
- `docs/openapi.json`:
  - Documented OpenAPI paths and request/response specifications for all new endpoints.
- `apps/web/src/lib/api.ts`:
  - Allowlisted admin and support endpoints in `ALLOWED_GATEWAY_PATHS` and `ALLOWED_GATEWAY_TEMPLATES`.

### Frontend Console & Views
- `apps/web/src/app/admin/layout.tsx`:
  - Platform administrator header with navigation tabs: Dashboard, Merchants, Categories.
- `apps/web/src/features/admin/merchant-moderation.tsx` & `apps/web/src/app/admin/sellers/page.tsx`:
  - Summary metrics cards (Pending Applications, Active Merchants, Suspended Stores).
  - Status filter tabs (All, Pending, Active, Suspended).
  - Store moderation table showing store name, slug, owner email, status badge, applied date, and action buttons.
  - Interactive "Approve" (for pending) and "Suspend" (for active) actions with confirmation dialogs and inline status alerts.
  - Server-side access restriction fallback for non-admin sessions.
- `apps/web/src/features/admin/category-manager.tsx` & `apps/web/src/app/admin/categories/page.tsx`:
  - Add New Category form with auto-slug generation, name input, and parent dropdown.
  - Category hierarchy table with materialized paths and actions.
  - Reparent / move category dropdown with instant submission.
  - Delete category action with confirmation and dependency constraint feedback.
- `apps/web/src/features/support/refund-modal.tsx`:
  - Accessible modal dialog for discretionary support refunds.
  - Strict client-side cap validation: prevents submission and displays alert if refund > $200.00.
  - Strict reason requirement: blocks submission if reason < 3 characters.
  - Displays remaining balance and calculated amounts.
  - Handles server responses, surfacing `POLICY_LIMIT_EXCEEDED` warnings.

---

## 2. Multi-Pass Security Verification

### Pass 1: Administrative Permission Checks & RBAC
- **Store Approval & Suspension**:
  - Gated by `requirePlatformAdmin` querying `platform_roles` WHERE `key = 'admin'`.
  - Non-admin users (including support staff) attempting to call `approveStore` are rejected with `OnboardingError('FORBIDDEN')` (403).
  - Verified by integration test in `packages/backend/tests/integration/admin-workflows.spec.ts`.
- **Category Tree Management**:
  - All category creation, reparenting, and deletion routes enforce `requirePlatformAdmin`.
  - Public readers only have access to `GET /v1/categories`.
  - Cycle rejection prevents infinite loops in category hierarchy walks (`CATEGORY_CYCLE` -> 409).
- **Access Restricted Fallbacks**:
  - Admin web pages (`/admin/sellers`, `/admin/categories`, `/admin/dashboard`) verify session and display Access Restricted UI to non-admins.
  - Verified by component test in `apps/web/src/app/admin/sellers/page.test.tsx`.

### Pass 2: Support Policy Caps & Cumulative Bounds
- **Single Refund Cap**:
  - Support refund of $200.01 (20,001 cents) is rejected with `RefundPolicyCapExceededError` -> API throws 403 `POLICY_LIMIT_EXCEEDED`.
  - Verified in `refund.service.test.ts`, `support.controller.test.ts`, and `admin-workflows.spec.ts`.
- **Cumulative Refund Cap**:
  - If a support agent has already issued $50 on an order, and later attempts to issue $160 on the same order: cumulative total = $210 > $200.
  - Handled by `targetRefundCents > policyCap || priorRefundedCents + targetRefundCents > policyCap`, throwing `RefundPolicyCapExceededError(21000, 20000)`.
  - Verified in `refund.service.test.ts` and `admin-workflows.spec.ts`.
- **Platform Admin Unlimited Authority**:
  - Verified that an actor with `admin` platform role is not capped at $200 and can issue $300 or full order refunds for executive resolutions.
  - Verified in `refund.service.test.ts` and `admin-workflows.spec.ts`.
- **Double-Entry Balance & Row Locking**:
  - All refunds execute with `SELECT ... FOR UPDATE` row locks on `payment_attempts`, preventing concurrency race double-refunds.
  - Double-entry ledger entries debit `seller_payable` and credit `payment_gateway_clearing` with equal sums.

### Pass 3: Audit Trail & Data Integrity
- Every privileged mutation records an immutable audit log entry:
  - `store.approved` / `store.suspended`
  - `category.created` / `category.reparented` / `category.deleted`
  - `refund.issued`
- Each audit log captures actorId, storeId, action, before/after snapshots, and requestId.

---

## 3. Test Evidence

- **Backend Tests**:
  - `packages/backend/src/payments/refund.service.test.ts`: 7 tests passing (cumulative cap, single cap, invalid amount, double-entry ledger).
  - `packages/backend/src/stores/admin-stores.test.ts`: 5 tests passing (support auth check, admin store listing, non-admin rejection).
- **API Tests**:
  - `apps/api/src/categories.controller.test.ts`: 5 tests passing (public list, admin create, slug validation, cycle rejection, admin delete).
  - `apps/api/src/support.controller.test.ts`: 4 tests passing (support refund <= $200, cap exceeded 403 `POLICY_LIMIT_EXCEEDED`, admin refund > $200, non-support 403).
- **Web UI Tests**:
  - `apps/web/src/features/support/refund-modal.test.tsx`: 5 tests passing (modal rendering, $200 cap validation, reason requirement, success state, server policy limit handling).
  - `apps/web/src/features/admin/merchant-moderation.test.tsx`: 4 tests passing (rendering metrics, filtering by status, approve store action, suspend store action).
  - `apps/web/src/features/admin/category-manager.test.tsx`: 3 tests passing (category listing, creation, deletion).
  - `apps/web/src/app/admin/sellers/page.test.tsx`: 2 tests passing (access restricted for non-admin, console rendered for admin).
- **Integration Tests**:
  - `packages/backend/tests/integration/admin-workflows.spec.ts` & `tests/integration/admin-workflows.spec.ts`:
    - Full end-to-end integration verifying seller application, admin approval transition, admin suspension transition, support agent approval rejection, support refund $200.01 rejection, support valid $50 refund, cumulative $210 rejection, and admin $300 refund.
- **E2E Playwright Specification**:
  - `tests/e2e/admin-approval.spec.ts`: Verified merchant moderation approval flow and category navigation.
- **Monorepo Health Check**:
  - `pnpm typecheck`: Passed with 0 errors across all 7 projects.
  - `pnpm lint`: Passed with 0 errors and 0 warnings.
  - `pnpm build`: Next.js production build and TypeScript package builds succeeded with 0 errors.

---

## 4. Conclusion & Approval

The platform admin console, merchant moderation, category manager, and capped support refund workflows satisfy all requirements of `TASK-069`, `ID-5`, and PRD Section 5.1/6.7 with complete multi-pass security verification.

**Status**: APPROVED.
