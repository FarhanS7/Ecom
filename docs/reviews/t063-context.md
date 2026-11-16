# Independent Review: TASK-063 — Build Coupon Management and Redemption UI

## Review Metadata
- **Task ID**: `TASK-063`
- **Goal**: Implement promotional coupon creation, validation, atomic holds, per-user limits, redemption tracking, and UI integration across seller consoles and checkout.
- **Risk Level**: MEDIUM
- **Requirements Covered**: `OR-9`, `CA-3`, PRD Section 6.5
- **Date**: 2026-11-16
- **Status**: APPROVED

---

## 1. Scope & Artifacts Inspected

### Database Migration
- `db/migrations/0021-coupons.sql`:
  - `coupons`: id, store_id (nullable for global), uppercase code, kind (`PERCENT` | `FIXED`), value, validity window (`starts_at`, `ends_at`), global_limit, per_user_limit, held_count, redeemed_count, status.
  - Unique index `idx_coupons_store_code` on `(store_id, UPPER(code))` and `idx_coupons_global_code` on `UPPER(code)`.
  - `coupon_user_counters`: Composite PK `(coupon_id, user_id)` to atomically track per-user held and redeemed counts under concurrency.
  - `coupon_uses`: id, coupon_id, user_id, order_id, status (`HELD` | `REDEEMED` | `RELEASED`), discount_cents, expires_at. Unique on `(coupon_id, order_id)`.

### Contracts & API Schemas
- `packages/contracts/src/promotions.ts`:
  - `CouponDto`, `createCouponSchema` (validates uppercase code, positive integer cents/percentage capped at 100%, future expiry).
  - `validateCouponRequestSchema`, `validateCouponResponseSchema`, `listCouponsResponseSchema`.
  - Exported via `packages/contracts/src/index.ts`.

### Domain Logic & Pricing Engine
- `packages/backend/src/promotions/coupon.service.ts`:
  - `createCoupon`: Normalizes code, verifies date window, prevents duplicate code within scope, writes audit record (`promotions.coupon_created`).
  - `validateAndCalculateDiscount`: Enforces active status, date validity, global limits, and per-user limits.
  - Store scoping: Store coupon strictly filters eligible basket items where `item.storeId === coupon.storeId`. If a marketplace basket contains products from Store A and Store B, a Store A coupon discounts only Store A's subtotal; Store B lines receive zero discount.
  - `holdCoupon`: Locks coupon row and per-user counter `FOR UPDATE`; atomically increments `held_count` and records `coupon_uses` with 15-minute TTL.
  - `redeemCoupon`: Atomically transitions held coupon to `REDEEMED` on order payment confirmation; decrements `held_count` and increments `redeemed_count`.
  - `releaseCoupon`: Decrements `held_count` on order cancellation or reservation timeout.
- `packages/backend/src/commerce/quote.service.ts`:
  - Dynamically invokes `couponService.validateAndCalculateDiscount` and allocates discount proportionally across eligible store lines without penny loss.
- `packages/backend/src/commerce/checkout.service.ts` & `order-completion.ts`:
  - Transactionally holds coupon during checkout initiation.
  - Transactionally confirms redemption upon `OrderPaid` or releases held coupon upon `OrderCancelled`.

### API Layer & Route Policy
- `apps/api/src/promotions.controller.ts`:
  - `GET /v1/seller/stores/:storeId/coupons`: Guarded by SessionGuard + `catalog:manage` store permission.
  - `POST /v1/seller/stores/:storeId/coupons`: Creates store-scoped coupon.
  - `POST /v1/coupons/validate`: Public/shopper coupon preview endpoint returning calculated discount.
  - `GET /v1/admin/coupons` & `POST /v1/admin/coupons`: Platform admin endpoints for global marketplace coupons.
- `packages/backend/src/platform/route-policy.ts`: Classified all 5 coupon routes.
- `docs/openapi.json`: Documented all 5 coupon routes.
- `apps/web/src/lib/api.ts`: Added coupon routes to gateway allowlist and templates.

### Presentation & User Experience
- `apps/web/src/features/checkout/coupon-input.tsx`:
  - Accessible promo code input, active discount badge with code and formatted discount, and removal button.
- `apps/web/src/features/checkout/order-summary.tsx`:
  - Integrated `CouponInput` with real-time quote refresh and removal.
- `apps/web/src/features/cart/cart-drawer.tsx`:
  - Integrated `CouponInput` in slide-over drawer with instant feedback.
- `apps/web/src/features/seller/coupon-management.tsx`:
  - Store console interface: coupon creation form (code, type, value, dates, limits) and active coupon table.
- Pages:
  - `apps/web/src/app/seller/[storeId]/coupons/page.tsx`
  - `apps/web/src/app/seller/coupons/page.tsx`
  - Navigation link added in `apps/web/src/app/seller/[storeId]/layout.tsx`.

---

## 2. Invariant Checklist

| Invariant | Status | Verification Detail |
|---|---|---|
| Non-negative integer cents | VERIFIED | Percentage discounts use `Math.floor(...)`; fixed amounts stored in cents; no float precision drift. |
| Store coupon boundary | VERIFIED | Verified in `coupon.service.test.ts` and `coupons.spec.ts`: items from other stores in a mixed basket receive $0.00 discount. |
| Atomic global usage limit | VERIFIED | Row lock `SELECT ... FOR UPDATE` on `coupons` prevents double-hold when limit is reached. |
| Atomic per-user limit | VERIFIED | `coupon_user_counters` composite PK `(coupon_id, user_id)` checked under lock; second checkout rejected. |
| Tenancy isolation (anti-oracle) | VERIFIED | Foreign store access returns uniform 404 via `gateStore`. |
| Lifecycle consistency | VERIFIED | Hold increments `held_count`; payment moves to `redeemed_count`; cancellation decrements `held_count`. |

---

## 3. Test Evidence

- `packages/backend/src/promotions/coupon.service.test.ts`: 11 passed.
- `apps/api/src/promotions.controller.test.ts`: 7 passed.
- `apps/web/src/features/checkout/coupon-input.test.tsx`: 5 passed.
- `apps/web/src/features/seller/coupon-management.test.tsx`: 4 passed.
- `tests/integration/coupons.spec.ts` & `packages/backend/tests/integration/coupons.spec.ts`: Passed.
- Workspace unit test suite: 695 tests passing across all packages.
- Zero TypeScript errors (`pnpm typecheck`), zero ESLint errors (`pnpm lint`).

---

## 4. Conclusion
Task `TASK-063` is completely and cleanly implemented according to PRD Section 6.5, Requirement `OR-9`, and design system guidelines. Approved.
