# Relational data model

Status: proposed logical schema. Each implementation task supplies reviewed SQL, rollback/recovery notes, constraints, and integration tests. Migrations are additive-first; no destructive schema sync against shared data.

## Conventions

UUID primary keys unless a natural/composite key is explicitly listed. All timestamps are timestamptz in UTC. Money is bigint integer cents with a fixed currency code and nonnegative checks; serialize monetary values as decimal strings at JSON boundaries to avoid JavaScript integer overflow. Quantities are positive bounded integers (demo maximum 99 per cart line); ledger deltas may be signed. Mutable rows have updated_at and relevant optimistic version fields.

FKs use RESTRICT for financial and order history. Disable/archive businesses, products, and users rather than cascade-delete historical records. Join-only records may cascade where history is not required. Every store-owned relationship carries store_id and uses a composite FK to reject cross-store associations at the database boundary.

## Identity and stores

| Table | Principal columns / relationships | Constraints / indexes |
| --- | --- | --- |
| users | id, email_normalized, password_hash, status, created_at, updated_at | UNIQUE email_normalized; normalize once; no email in public DTO |
| platform_roles | id, key | UNIQUE key |
| permissions | id, key | UNIQUE key |
| platform_role_permissions | role_id FK platform_roles, permission_id FK permissions | composite PK |
| user_platform_roles | user_id FK users, role_id FK platform_roles | composite PK |
| session_families | id, user_id FK users, revoked_at, expires_at | index user_id; family revocation authoritative in DB |
| refresh_tokens | id, family_id FK session_families, token_hash, used_at, expires_at, replacement_id self FK | UNIQUE token_hash; index family_id; never store raw tokens |
| identity_tokens | id, user_id FK users, purpose, token_hash, expires_at, consumed_at | UNIQUE token_hash; reset and verification purposes separated |
| businesses | id, owner_user_id FK users, status, commission_bps, created_at | commission in 0..10000; owner transfer outside demo |
| stores | id, business_id FK businesses, slug, name, status, created_at | UNIQUE business_id (one store); UNIQUE slug |
| store_roles | id, key | owner, manager, catalog-editor, fulfillment; UNIQUE key |
| store_role_permissions | role_id FK store_roles, permission_id FK permissions | composite PK |
| store_memberships | store_id FK stores, user_id FK users, role_id FK store_roles, status, version | PK(store_id,user_id); index user_id |
| store_invitations | id, store_id FK stores, email_normalized, role_id FK store_roles, token_hash, expires_at, accepted_at | UNIQUE token_hash; pending invitation dedupe |
| store_themes | store_id PK/FK stores, version, approved_tokens JSONB, logo_asset_id FK media_assets nullable | strict allowed token schema; no arbitrary CSS or HTML |
| store_content | store_id PK/FK stores, version, featured_ids JSONB, headline, socials JSONB, swatches JSONB | validate IDs belong to store; http(s) URL allowlist |
| addresses | id, user_id FK users, fields JSONB, created_at | index user_id; validate structured fields; encrypted transport |

## Catalog and discovery

| Table | Principal columns / relationships | Constraints / indexes |
| --- | --- | --- |
| categories | id, parent_id FK categories, slug, name, path | UNIQUE slug; indexed parent/path; reject category cycles |
| products | id, store_id FK stores, category_id FK categories, slug, title, description, brand, status, attributes JSONB, min_price_cents, currency, rating_sum, rating_count, sales_count, version, created_at, updated_at | UNIQUE(store_id,id), UNIQUE(store_id,slug); channel sort indexes below |
| product_variants | id, product_id, store_id, sku, price_cents, attributes JSONB, status | FK(store_id,product_id) products; UNIQUE(store_id,id), UNIQUE(store_id,sku) |
| product_publications | product_id PK/FK products, marketplace_enabled, store_enabled, published_at | catalog write increments product version and emits visibility event |
| media_assets | id, store_id FK stores, object_key, declared_type, verified_type, bytes, status, checksum, created_at | UNIQUE object_key; UNIQUE(store_id,id) for scoped FKs; status quarantined/ready/rejected |
| product_images | id, store_id, product_id, asset_id, position, alt | composite FKs to scoped product/asset; unique(product_id,position) |
| search_documents | product_id PK/FK products, store_id, source_version, title, brand, category_path, attributes JSONB, tsv, min_price_cents, available, visibility, rating_avg, sales_count, created_at | GIN tsv; trigram title; indexes for price/category/channel; projection not stock authority |
| wishlists | user_id FK users, product_id FK products, created_at | PK(user_id,product_id); hidden products render unavailable, never leak private details |
| reviews | id, product_id FK products, user_id FK users, order_item_id FK order_items, rating, body, status, created_at | UNIQUE(product_id,user_id); rating 1..5; eligibility checked transactionally |

products.min_price_cents is derived from active variants for sorting, not a second editable price. Store canonical rating_sum/count to avoid rounding drift; presentation computes average.

## Stock and carts

| Table | Principal columns / relationships | Constraints / indexes |
| --- | --- | --- |
| inventory | variant_id PK/FK product_variants, on_hand, reserved, version | CHECK 0 <= reserved AND reserved <= on_hand; CHECK on_hand >= 0 |
| stock_reservations | id, checkout_id FK orders, variant_id FK inventory, qty, status, expires_at, created_at | UNIQUE(checkout_id,variant_id); positive qty; partial expires_at index WHERE status='ACTIVE' |
| stock_movements | id, variant_id FK inventory, delta_on_hand, delta_reserved, reason, operation_key, ref_id, created_at | UNIQUE(operation_key,variant_id,reason); append-only; index(variant_id,created_at,id) |
| carts | id, user_id FK users nullable, guest_token_hash nullable, channel_key, store_id FK stores nullable, version, updated_at | exactly one owner type; channel_key='marketplace' or store UUID; unique owner/channel via separate partial indexes |
| cart_items | cart_id FK carts, variant_id FK product_variants, qty, updated_at | PK(cart_id,variant_id); qty 1..99; store cart membership checked |
| cart_merges | guest_cart_id FK carts, user_cart_id FK carts, merged_at | UNIQUE guest_cart_id; repeated login merge cannot add quantities again |

A database cart commit precedes cache refresh. Redis holds versioned cart snapshots; PostgreSQL is the durable source. Cached copies may be discarded. Checkout reloads durable cart and canonical catalog/inventory.

## Checkout, fulfillment, and payments

| Table | Principal columns / relationships | Constraints / indexes |
| --- | --- | --- |
| idempotency_requests | id, user_id FK users, operation, channel_key, key, request_hash, status, response_status, response_body JSONB, order_id FK orders nullable, created_at | UNIQUE(user_id,operation,channel_key,key); retained with order in demo; bounded response size |
| orders | id, user_id FK users, channel_key, store_id FK stores nullable, payment_status, fulfillment_status, total_cents, currency, address_snapshot JSONB, expires_at, version, created_at | index(user_id,created_at DESC,id DESC); currency uniform |
| seller_orders | id, order_id FK orders, store_id FK stores, fulfillment_status, subtotal_cents, discount_cents, shipping_cents, total_cents, commission_bps_snapshot, created_at | UNIQUE(order_id,store_id); UNIQUE(store_id,id); index(store_id,created_at DESC,id DESC) |
| order_items | id, order_id FK orders, seller_order_id, store_id, variant_id FK product_variants, title_snapshot, sku_snapshot, qty, unit_price_cents, discount_cents, created_at | composite FK seller_order; historical immutable amounts; index(store_id,created_at DESC,id DESC) |
| payment_attempts | id, order_id FK orders, provider, effect_key, provider_ref nullable, amount_cents, currency, status, created_at | UNIQUE(provider,effect_key); UNIQUE(provider,provider_ref); separate attempt from order status |
| webhook_events | provider, event_id, payload_hash, payload JSONB, received_at, processed_at, status | PK(provider,event_id); same ID/different hash quarantined |
| refunds | id, order_id FK orders, seller_order_id FK seller_orders nullable, actor_id FK users, effect_key, amount_cents, reason, status, created_at | UNIQUE effect_key; lock parent payment when allocating remaining refundable amount |
| refund_items | refund_id FK refunds, order_item_id FK order_items, qty, amount_cents | composite PK; cumulative qty/amount enforced under locks |
| financial_entries | id, operation_key, order_id FK orders, refund_id FK refunds nullable, store_id FK stores nullable, account, debit_cents, credit_cents, created_at | UNIQUE(operation_key,account,store_id) with explicit null handling; one positive debit or credit; each operation balances |
| return_requests | id, order_item_id FK order_items, user_id FK users, qty, reason, status, inspection_result, created_at | locks prevent returning more than purchased; transitions audited |
| fulfillment_events | id, seller_order_id FK seller_orders, actor_id FK users, old_status, new_status, tracking_ref nullable, created_at | append-only; no external carrier dependence |
| seller_payouts | id, store_id FK stores, period_start, period_end, amount_cents, status, effect_key | UNIQUE effect_key; simulated settlement only; refund reserves considered |

Use separate payment and fulfillment states so PARTIALLY_REFUNDED does not erase shipping progress. Financial balances are enforced by the application transaction with reconciliation tests; SQL CHECK cannot validate cross-row balances alone.

## Promotions, events, and operations

| Table | Principal columns / relationships | Constraints / indexes |
| --- | --- | --- |
| coupons | id, store_id FK stores nullable, code, kind, value, starts_at, ends_at, global_limit, per_user_limit, held_count, redeemed_count, status | normalized unique code per scope with explicit NULL semantics; bounded percent |
| coupon_uses | id, coupon_id FK coupons, user_id FK users, order_id FK orders, status, expires_at | UNIQUE(coupon_id,order_id); lock coupon and per-user counter before hold |
| coupon_user_counters | coupon_id FK coupons, user_id FK users, held_count, redeemed_count | composite PK; prevents per-user concurrent oversubscription |
| outbox | id, aggregate_type, aggregate_id, aggregate_version, type, schema_version, payload JSONB, created_at, published_at, lease_until, attempts | partial index(created_at,id) WHERE published_at IS NULL |
| consumer_receipts | consumer_name, event_id, processed_at | composite PK; committed with consumer state mutation |
| notification_deliveries | id, effect_key, user_id FK users, channel, template, status, attempts, provider_ref nullable, created_at | UNIQUE effect_key; payload references minimize PII |
| audit_logs | id, actor_id FK users nullable, store_id FK stores nullable, action, entity_type, entity_id, redacted_before JSONB, redacted_after JSONB, request_id, created_at | append-only; index(store_id,created_at,id); no secrets |
| policy_settings | key PK, value JSONB, version, updated_by FK users | schema validated; support refund limit seeded as 20000 cents |
| feature_flags | key PK, enabled, store_allowlist JSONB, version | default off; admin changes audited |

Reports use materialized views for daily sales/refunds and store summaries, with unique keys for refresh and explicit refreshed_at. A replica is a later comparison, not the demo's source for checkout correctness.

## Index and migration plan

Start with measured access paths: products(store_id,created_at DESC,id DESC), products(category_id,min_price_cents,id), products(category_id,sales_count DESC,id DESC) filtered to active rows; equivalent marketplace publication queries must prove efficient joins. Tie-breaking id is required for every cursor order.

Partitioning is an experiment in T082: prefer append-only audit_logs/stock_movements. Partitioning orders may change uniqueness/FK design; never silently invalidate idempotency uniqueness to demonstrate partitioning.

Every migration must run from empty DB and previous schema. Backfill in bounded batches, validate constraints, then switch readers. Rehearse restores before destructive changes. The table list describes the final schema, not a command to create later-module FKs before their targets exist: T037 initially uses an opaque checkout UUID, T046 adds its order FK, and T035 adds the theme-logo asset FK after media_assets exists. Update integration fixtures when constraints are introduced. ER relationships are explained in module specs; no migration files are created by this planning task.
