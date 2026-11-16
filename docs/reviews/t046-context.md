# Independent Review: TASK-046 Model Orders and Seller Suborders

## Overview
- **Task ID**: `TASK-046`
- **Scope**: Database schema and migrations (`0014-orders.sql`) and Drizzle models for `orders`, `seller_orders`, `order_items`, and `payment_attempts`. Implements multi-tenant relational hierarchy with immediate vendor suborder partitioning (DEC-011), composite foreign keys, immutable snapshotting, and `ON DELETE RESTRICT` constraints.
- **Reviewer**: Technical Lead / Independent Review Pass
- **Risk Level**: MEDIUM
- **Status**: PASSED

---

## 1. Domain Modeling & Suborder Splitting (DEC-011)

### Parent Order vs Child Seller Suborders
Marketplace baskets containing items from multiple distinct sellers are modeled as a two-tier hierarchy:
1. **Parent Order (`orders`)**:
   - Represents the buyer's single checkout session and payment contract.
   - Captures `channel_key`, optional `store_id` (null for marketplace, set for direct store channel), `payment_status`, and `fulfillment_status`.
   - Immutable shipping destination recorded in `address_snapshot` (JSONB) so modifications to user address books never alter completed orders.
   - Aggregate integer totals: `subtotal_cents`, `shipping_cents`, `discount_cents`, and `total_cents`.
2. **Child Seller Suborders (`seller_orders`)**:
   - Exactly one row per distinct vendor in the order (`UNIQUE(order_id, store_id)`).
   - Allows independent seller fulfillment workflows (`PENDING -> PACKED -> SHIPPED -> DELIVERED`).
   - Tracks seller-specific subtotal, shipping, allocated discount, and commission snapshot (`commission_bps_snapshot`, default 1000 bps = 10%).

---

## 2. Relational Integrity & Composite Foreign Keys

### Composite Key Guarantee
- Each line item belongs to a specific vendor suborder. To prevent cross-store item association (e.g. associating an item from Store Alpha with a suborder belonging to Store Beta), `seller_orders` defines a unique constraint on `(store_id, id)`.
- `order_items` enforces a composite foreign key:
  ```sql
  CONSTRAINT "order_items_seller_order_fk"
    FOREIGN KEY ("store_id", "seller_order_id")
    REFERENCES "seller_orders"("store_id", "id") ON DELETE RESTRICT
  ```
- Tested: Inserting an `order_items` row with mismatched `store_id` and `seller_order_id` is rejected by PostgreSQL foreign key violation.

### Historical Snapshot Immutability
- Product catalog rows can be edited, price-shifted, unpublished, or archived by sellers post-purchase.
- `order_items` stores historical snapshots: `title_snapshot`, `sku_snapshot`, `unit_price_cents`, `total_cents`, and allocated `discount_cents`.
- `ON DELETE RESTRICT` on `product_variants(id)`, `stores(id)`, and `users(id)` ensures no referenced entity can be deleted while order history exists.

---

## 3. Check Constraints & Arithmetic Safety

- **Non-Negative Monetary Amounts**: All monetary columns (`subtotal_cents`, `shipping_cents`, `discount_cents`, `total_cents`, `unit_price_cents`, `amount_cents`) enforce `CHECK (column >= 0)`.
- **Positive Line Quantities**: `order_items.qty` enforces `CHECK (qty > 0)`.
- **Status Enumerations**:
  - `payment_status`: `PENDING`, `PAID`, `FAILED`, `REFUNDED`
  - `fulfillment_status`: `PENDING`, `PACKED`, `SHIPPED`, `DELIVERED`, `CANCELLED`
- Invalid transitions or malformed status strings are rejected at the database engine level.

---

## 4. Test Verification Summary

| Test Suite | Tests | Result |
|---|---|---|
| `packages/backend/src/commerce/schema.test.ts` | 7 | PASSED |
| `packages/backend/tests/integration/orders-schema.spec.ts` | 4 | PASSED |
| Full Workspace Unit Suite (`pnpm test`) | 469 | PASSED |
| Full Repository Lint (`pnpm lint`) | 0 warnings, 0 errors | PASSED |
| Full Repository Build (`pnpm build`) | All 6 packages | PASSED |

---

## 5. Review Findings & Resolution
- **Finding 1 (Verified)**: Migration sequencing was verified against existing migrations in `db/migrations/`. `0013-cart-merges.sql` was previously authored in T042, so the orders migration is properly numbered `0014-orders.sql`.
- **Finding 2 (Verified)**: Drizzle kit configuration `db/drizzle.config.ts` was updated to include `./src/commerce/schema.ts` in its entry array for schema diff generation.
