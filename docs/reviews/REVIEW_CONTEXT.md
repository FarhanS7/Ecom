# Master Review Context: Shipped V1 Architecture & Modules

This document provides the authoritative code-level map for adversarial architectural reviews, security audits, and correctness verification across the ShopScale platform.

---

## 1. Core Architectural Pillars

### Concurrency & Invariant Enforcement
- **Inventory Service**: `packages/backend/src/inventory/inventory.service.ts`
  - Deadlock prevention via `aggregateAndSortItems()` sorting variant IDs lexicographically ascending before acquiring row locks.
  - Conditional atomic decrement: `UPDATE inventory SET reserved = reserved + qty WHERE (on_hand - reserved) >= qty`.
  - Append-only stock movement ledger tracking all transitions (`reservation_created`, `reservation_released`, `order_confirmed`).
- **Checkout Coordinator**: `packages/backend/src/commerce/checkout.service.ts`
  - Mandatory client-provided `Idempotency-Key` validated via SHA-256 request payload hashing.
  - Multi-seller order atomicity: parent order and child seller suborders created in a single ACID transaction.
  - Cryptographic quote signature validation with mandatory expiry (`quoteService.verifyQuoteToken()`).

### Financial Accounting & Reconciliation
- **Double-Entry Financial Ledger**: `packages/backend/src/payments/financial-ledger.service.ts`
  - Strict mathematical invariant: `SUM(debits) === SUM(credits)` enforced prior to commit; unbalanced batches throw `UnbalancedLedgerError`.
  - Integer cents arithmetic preventing floating-point rounding drift.
  - Supported accounts: `customer_receivable`, `seller_payable`, `platform_commission`, `payment_gateway_clearing`.
- **Payment Webhook & Reconciliation**: `packages/backend/src/payments/webhook.service.ts` & `reconciliation.service.ts`
  - HMAC SHA-256 signature verification with tolerance against replay attacks.
  - Nightly provider status polling reconciling stranded checkouts and releasing expired stock.

### Multi-Tenant Isolation & Role-Based Access Control
- **Tenant Scoping**:
  - Store-scoped resources enforce `store_id` matching authenticated seller permissions.
  - Platform administrator scopes separated from merchant scopes via `hasRole('admin')`.
- **Customer Privacy & PII**:
  - PII masking (`pii-masker.ts`) redacts customer names, phone numbers, and physical addresses on shared merchant views.
  - Address access cryptographically restricted to authenticated customer owner.

### Resilience & Operability
- **Transactional Outbox**: `packages/backend/src/platform/outbox.service.ts`
  - Zero dual-write hazard: business mutation and domain event written to PostgreSQL in the same transaction.
  - BullMQ relay worker with lease expiration and dead-letter quarantine.
- **Search Engine Flexibility**: `packages/backend/src/search/`
  - Unified `SearchPort` interface with implementations for PostgreSQL Full-Text Search and OpenSearch.
  - Zero-downtime index aliasing pattern (`reindex-search.ts`).
- **Disaster Recovery & Packaging**:
  - Non-destructive expand-and-contract migrations.
  - Automated database backup and restore scripts with schema parity assertions (`backup-restore.ts`).
  - Production-grade multi-stage Dockerfiles running as unprivileged `USER node`.
