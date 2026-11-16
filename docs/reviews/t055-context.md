# Review Context: TASK-055 — Scoped Order History, Detail, and PII Masking

## Review Metadata
- **Task ID**: TASK-055
- **Risk Level**: MEDIUM
- **Review Scope**: Customer order queries, seller suborder isolation, PII masking rules, keyset pagination, OpenAPI contracts.
- **Reviewer**: Senior Technical Architect / Independent Reviewer
- **Outcome**: APPROVED

---

## 1. Executive Summary
TASK-055 implements scoped customer order listing, customer order detail retrieval, seller-scoped suborder listing, seller suborder detail retrieval, and customer PII masking. The implementation strictly adheres to:
1. **Multi-tenancy isolation**: Sellers can only view suborders (`seller_orders`) and line items (`order_items`) linked to their own `store_id`. Attempts to access another store's suborder returns `SuborderNotFoundError` (HTTP 404), providing no oracle about foreign suborders.
2. **Customer privacy**: For unpaid orders (`payment_status !== 'PAID'`), customer PII (recipient name, street address lines, phone number) is redacted in both customer detail (if unauthenticated/unpaid) and seller fulfillment queries. Once `payment_status === 'PAID'`, recipient information is provided to authorized store staff for shipping.
3. **Authorization gates**:
   - Customer endpoints (`GET /v1/orders`, `GET /v1/orders/:id`) enforce authenticated customer session and ownership (`order.customer_id === user.id`). Foreign order lookup returns 404.
   - Seller endpoints (`GET /v1/seller/stores/:storeId/orders`, `GET /v1/seller/stores/:storeId/orders/:suborderId`) require store authorization with the `'fulfillment:manage'` permission.
4. **Scalable keyset pagination**: Keyset cursor encoding `(created_at DESC, id DESC)` in base64url format ensures constant-time pagination without deep SQL `OFFSET` performance degradation.

---

## 2. Invariant Verification

| Invariant | Status | Verification Evidence |
|---|---|---|
| **Multi-seller isolation** | PASS | `OrderQueryService.listSellerOrders` queries `seller_orders WHERE store_id = $1` and joins `order_items WHERE store_id = $1`. Non-matching store items are never fetched. |
| **No Oracle on foreign IDs** | PASS | `getCustomerOrder` throws `OrderNotFoundError` if `customer_id` does not match; `getSellerOrder` throws `SuborderNotFoundError` if `store_id` does not match. |
| **PII Redaction when Unpaid** | PASS | `maskAddressSnapshot` replaces `recipientName` with `Customer (Unpaid)`, masks street lines, and redacts phone number when `isPaid === false`. Unit tested in `pii-masker.test.ts`. |
| **OpenAPI & Route Policy Alignment** | PASS | Routes registered in `route-policy.ts` and OpenAPI specification: `/v1/orders`, `/v1/orders/{id}`, `/v1/seller/stores/{storeId}/orders`, `/v1/seller/stores/{storeId}/orders/{suborderId}`. |
| **Cursor pagination security** | PASS | Base64url cursor with strict JSON schema validation and `limit` capped between 1 and 100. |

---

## 3. Findings & Resolution
- **Finding 1**: Ensure cursor schema does not clash with existing catalog cursor types.
  - *Resolution*: Exported as `OrderCursorPayload`, `encodeOrderCursor`, and `decodeOrderCursor`.
- **Finding 2**: Ensure seller order items accurately reflect subtotal, tax, and shipping amounts for their slice of the multi-vendor order.
  - *Resolution*: `seller_orders` records individual subtotal, tax, and shipping amounts computed by the quote and checkout engines.

---

## 4. Conclusion
TASK-055 satisfies all functional, architectural, and security requirements. Ready for production and subsequent seller fulfillment workflow tasks.
