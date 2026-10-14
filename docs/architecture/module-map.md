# Capability map

Status: proposed module boundaries, organized around confirmed product choices. Review at T001 before implementation. Arrows in the dependency column refer to provider ports, never direct foreign-table writes.

| Module | Responsibility | Depends on | Spec |
| --- | --- | --- | --- |
| platform | Platform foundation | None | [Contract](../modules/platform.md) |
| identity | Identity and sessions | platform | [Contract](../modules/identity.md) |
| stores | Stores and staff authorization | identity | [Contract](../modules/stores.md) |
| catalog | Catalog and publication | stores | [Contract](../modules/catalog.md) |
| inventory | Inventory and reservation accounting | catalog | [Contract](../modules/inventory.md) |
| cart | Channel carts | catalog, identity | [Contract](../modules/cart.md) |
| payments | Payment effects and webhook receipts | platform | [Contract](../modules/payments.md) |
| commerce | Checkout, orders, and after-sales | cart, inventory, payments, stores, promotions | [Contract](../modules/commerce.md) |
| promotions | Coupons and limits | identity, stores | [Contract](../modules/promotions.md) |
| search | Search and projections | catalog, inventory | [Contract](../modules/search.md) |
| engagement | Reviews and wishlists | commerce, catalog | [Contract](../modules/engagement.md) |
| notifications | Notifications and documents | identity, commerce | [Contract](../modules/notifications.md) |
| reporting | Reporting, audit, and administration | commerce, stores, engagement | [Contract](../modules/reporting.md) |
| operations | Reliability and delivery | commerce, search, notifications, reporting | [Contract](../modules/operations.md) |

## Build order

Foundation → identity → stores → catalog → durable events/search → inventory/cart → promotions contract + checkout/payment → fulfillment/after-sales → engagement/reporting → reliability/scale/release.

Some modules land incrementally. Payment provider ports and promotion stubs/contracts are implemented before checkout consumes them; advanced refund/coupon management UI arrives later. API route availability follows the task dependency graph, not the apparent order of this table.

Commerce orchestrates provider ports; payments and promotions do not import commerce. Asynchronous application handlers are wired at the worker composition root. Search consumes inventory events without inventory importing search. These rules keep the module graph acyclic.

## Shared vocabulary

Business is the seller's organization. Store is its single branded storefront and security scope. Marketplace is a sales channel, not a store or a second product owner. ChannelKey identifies marketplace or one store. Order is a customer's checkout; seller_order is one seller's fulfillment unit. Available stock is a calculation, not an independently writable counter.
