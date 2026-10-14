# Proposed role and resource matrix

This is a test design, not a passing test report. T018 implements route enumeration; T074 expands it to all routes.

> Measured (T018): `apps/api/tests/integration/permission-matrix.spec.ts`
> executes the implemented-route subset below (7 personas + anonymous) with
> honest skips without a database and live runs in CI. Scoped store routes
> collapse every scope failure to generic 404 (member-without-grant included);
> platform-admin routes 403; unauthenticated session routes 401. Membership
> bodies carry `{storeId, role, status}` only — no emails, no user lists.

| Capability | Guest | Customer | Store owner/manager | Catalog editor | Fulfillment staff | Support | Admin |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Browse public catalog | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Own channel cart | Guest proof | Own | As shopper | As shopper | As shopper | As shopper | As shopper |
| Checkout | No | Own | As shopper | As shopper | As shopper | As shopper | As shopper |
| Customer order history | No | Own | Own purchases only | Own purchases only | Own purchases only | Policy-scoped lookup | Authorized platform view |
| Store product/stock write | No | No | Own store | Own store | No stock adjustment by default | No | Explicit admin permission |
| Fulfillment transition | No | No | Own store | No | Own store | Read only | Explicit admin permission |
| Invite/manage team | No | No | Owner/manager with role-grant ceiling | No | No | No | Explicit admin permission |
| Theme/content write | No | No | Own store | Catalog content only | No | No | Explicit admin permission |
| Request return/refund | No | Own purchase | Own seller order request | No | Return receipt only | Policy approval | Approval |
| Approve refund | No | No | Request only | No | No | Up to cumulative policy cap | Full remaining captured balance |
| Store approval/suspension | No | No | No | No | No | No | Yes |
| Audit | No | No | Own scoped actions | No | No | Read-only policy scope | Platform |

Ownership is an additional condition, not another role. A user may be both customer and staff. Manager cannot grant owner or permissions exceeding their grant ceiling. Store owner removal/transfer is excluded.

Test resource substitution for store_id, product_id, variant_id, asset_id, order_id, suborder_id, invoice object key, report filters, search facets, and cache keys. Include anonymous public routes, webhook-specific verification, expired/revoked sessions, suspended stores, and stale memberships.
