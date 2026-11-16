# Review Context: TASK-059 — Customer Return Requests and Seller Inspection Console

## Review Metadata
- **Task ID**: TASK-059
- **Risk Level**: LOW
- **Review Scope**: Customer return request portal (`/account/orders/[id]/return`), item return reason selector, quantity validation against remaining returnable units, seller return inspection console (`/seller/[storeId]/returns`), physical inspection decision modal (`SellerInspectionModal`), restock toggle, and transactional state synchronization.
- **Reviewer**: Senior Technical Architect / Independent Reviewer
- **Outcome**: APPROVED

---

## 1. Executive Summary
TASK-059 delivers complete after-sales workflows connecting customers and merchants:
1. **Customer Self-Service Return Flow**:
   - `/account/orders/[id]/return`: Scoped to authenticated shoppers.
   - Restricts returns strictly to `DELIVERED` orders; displays clear advisory alerts if the order is still pending or in-transit.
   - Dynamically calculates remaining returnable units per line item (`item.qty - SUM(existing_returns.qty)`) preventing over-return submissions.
   - Preset `ReturnReasonSelector` with common categories (Defective/damaged, Wrong item, Changed mind, Not as described, Other).
   - Real-time inline feedback: Displays existing return requests with colored status tags (`PENDING_INSPECTION`, `APPROVED`, `REJECTED`) and seller feedback.
2. **Seller Inspection & Decision Console**:
   - `/seller/[storeId]/returns`: Scoped to merchants with `fulfillment:manage` grant.
   - Comprehensive queue displaying pending, approved, and rejected returns, filterable by status tabs.
   - `SellerInspectionModal`: Enables merchants to record physical inspection findings, choose an approval or rejection outcome, and toggle automatic inventory restocking.
   - Approving with `restock: true` automatically calls `inventoryService.adjustStock(..., reason: 'return_restock')` and records movement ledger entries.
   - Emits transactional outbox event `return.inspected`.
3. **Robust Security & Tenant Scoping**:
   - Store isolation: merchants can only inspect returns for products sold by their own store.
   - Customer isolation: shoppers can only view and submit returns for their own orders (no oracle on foreign IDs).

---

## 2. Invariant Verification

| Invariant | Status | Verification Evidence |
|---|---|---|
| **Return Permitted on DELIVERED Only** | PASS | Non-delivered orders display warning alert and inhibit return form submission. Tested in `return-form.test.tsx`. |
| **Cumulative Return Cap Enforcement** | PASS | Form limits quantity selector to `returnableQty` and validates on submit. Disables form when all items have active/approved returns. Tested in `return-form.test.tsx`. |
| **Preset Reason Selection & Notes** | PASS | `ReturnReasonSelector` provides standard dropdown presets alongside optional customer notes. |
| **Seller Restock Toggle on Approval** | PASS | `SellerInspectionModal` enables "Restock Item" checkbox on approval, driving stock adjustment in backend. Tested in `seller-approval.test.ts`. |
| **Tenant Scoping & Gate Security** | PASS | Seller routes gated by `authorizeStore(userId, storeId, 'fulfillment:manage')`. Mismatches throw 404. Tested in `orders.controller.test.ts`. |

---

## 3. Findings & Resolution
- None. All components adhere to design guidelines, accessibility semantics, and strict type constraints.

---

## 4. Conclusion
TASK-059 fulfills all customer usability and merchant inspection criteria. Production ready.
