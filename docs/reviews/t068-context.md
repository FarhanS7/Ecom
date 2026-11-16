# Independent Review: TASK-068 — Build Team, Theme, and Store-Content Settings

## Review Metadata
- **Task ID**: `TASK-068`
- **Goal**: Build Next.js seller settings console (/seller/settings and /seller/[storeId]/settings) managing staff invitations, role permissions, token theme colors, and homepage banner content.
- **Risk Level**: LOW
- **Requirements Covered**: `REQ-STORE-003`, `ID-5`, PRD Section 5.1
- **Date**: 2026-11-16
- **Status**: APPROVED

---

## 1. Scope & Artifacts Inspected

### Contracts & Schemas
- `packages/contracts/src/channel.ts`:
  - `updateStoreThemeSchema` & `UpdateStoreThemeDto`: Strictly enforces 6 hex color tokens (`#RRGGBB` format via `/^#[0-9a-fA-F]{6}$/`) and border radius from 0 to 16px.
  - `storeStaffRoleSchema` (`'owner' | 'manager' | 'catalog-editor' | 'fulfillment'`).
  - `inviteStaffSchema` & `InviteStaffDto`: Validates staff email, role, and store context.
  - `storeMemberDtoSchema`, `storePendingInvitationSchema`, `storeTeamSummarySchema`.
  - `storeContentSchema` & `updateStoreContentSchema`: Validates banner text (max 200 chars), banner subtext (max 500 chars), and banner image URL.

### Backend Domain & API Layer
- `packages/backend/src/stores/theme.service.ts`:
  - `saveTheme`: Enforces store permission (`store:manage` or `team:manage`). Upserts theme into `store_themes` and logs audit entry `store.theme_updated`.
- `packages/backend/src/stores/content.service.ts`:
  - `getStoreContent` & `saveStoreContent`: Enforces store permission, updates `store_content` table, and logs audit entry `store.content_updated`.
- `packages/backend/src/stores/onboarding.service.ts`:
  - `listStoreTeam`: Queries active memberships, associated user profiles, roles, and non-expired pending invitations.
- `apps/api/src/stores.controller.ts`:
  - Endpoints exposed:
    - `GET /v1/seller/stores/:storeId/team`
    - `GET /v1/seller/stores/:storeId/theme`
    - `PUT /v1/seller/stores/:storeId/theme`
    - `GET /v1/seller/stores/:storeId/content`
    - `PUT /v1/seller/stores/:storeId/content`
  - All endpoints enforce store authorization via `authorizeStore({ userId, storeId, permission })`.
  - Registered in `apps/api/src/app.module.ts`, `apps/api/src/route-policy.ts`, and OpenAPI spec `docs/openapi.json`.
  - Gateway allowlist in `apps/web/src/lib/api.ts` updated to allow seller store settings paths.

### Frontend Components & Views
- `apps/web/src/features/seller/theme-customizer.tsx`:
  - Inputs for primary, background, surface, text, muted, and accent colors + border radius slider.
  - Strict hex code regex validation with user feedback.
  - Live interactive storefront mockup preview utilizing `tenantThemeStyle`.
- `apps/web/src/features/seller/team-management.tsx`:
  - Staff list with role badges, status, and role change controls.
  - Guard preventing demoting or revoking the sole active store owner (`assertNotLastOwner`).
  - Pending invitations table.
  - Staff invitation form with instant validation and error banners.
- `apps/web/src/features/seller/general-settings.tsx`:
  - Storefront homepage banner headline, subtext, and banner image URL configuration.
- `apps/web/src/features/seller/settings-workspace.tsx`:
  - Accessible ARIA tabbed container switching seamlessly between General, Team, and Theme.
- `apps/web/src/app/seller/[storeId]/settings/page.tsx`:
  - Scoped store settings page checking user's role on the store. Rejects non-owners and non-managers with 403 Access Denied.
- `apps/web/src/app/seller/settings/page.tsx`:
  - Seller settings index directing users to their active store's settings.
- `apps/web/src/app/seller/[storeId]/layout.tsx`:
  - Settings navigation item added to seller sidebar.

---

## 2. Invariant & Security Verification

1. **Role Gating & Permission Boundary**:
   - Only store owners or managers can access `/seller/[storeId]/settings`.
   - `catalog-editor` and `fulfillment` roles receive "Access Denied" when attempting to view or modify store settings.
   - Verified by security regression test in `apps/web/src/app/seller/[storeId]/settings/page.test.tsx`.
2. **Last Active Owner Protection**:
   - The system prevents removal or demotion of the last active owner of a store (`assertNotLastOwner`).
   - The UI disables the revoke action for the last owner and displays a clear explanatory tooltip/title.
3. **Color Sanitization & Injection Prevention**:
   - All color tokens are validated using a strict regular expression `^#[0-9a-fA-F]{6}$`.
   - Arbitrary CSS/HTML injection via theme tokens is completely blocked.
   - Border radius is bounded between 0px and 16px.
4. **Audit Logging**:
   - All theme updates and content updates record audit log entries with the actor ID and store ID.

---

## 3. Verification & Test Evidence

- **Unit & Integration Tests**:
  - `packages/backend/src/stores/settings.test.ts`: 7 tests passing (theme upsert, color validation rejection, store content upsert, team listing, permission checks).
  - `apps/api/src/stores.controller.test.ts`: 6 tests passing (settings endpoints authorization, 404 on unowned store, data persistence).
  - `apps/web/src/features/seller/theme-customizer.test.tsx`: 5 tests passing (color validation, preview updates, invalid hex rejection).
  - `apps/web/src/features/seller/settings-actions.test.ts`: 9 tests passing (server action execution, error handling).
  - `apps/web/src/features/seller/team-management.test.tsx`: 4 tests passing (rendering members, invite flow, last-owner guard).
  - `apps/web/src/app/seller/[storeId]/settings/page.test.tsx`: 3 tests passing (asserting catalog-editor receives Access Denied, owner receives settings workspace).
- **Monorepo Health Check**:
  - `pnpm test`: All unit and integration test suites passing across all workspace packages.
  - `pnpm typecheck`: Passed with 0 errors across all 7 projects.
  - `pnpm lint`: Passed with 0 errors and 0 warnings.
  - `pnpm build`: Next.js production build and TypeScript package builds succeeded with 0 errors.

---

## 4. Conclusion & Approval

The team, theme, and store-content settings fulfill all requirements of `TASK-068`, `REQ-STORE-003`, `ID-5`, and PRD Section 5.1.
**Status**: APPROVED.
