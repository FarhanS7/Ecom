# Production Handoff & Real-Money Roadmap

**Project**: ShopScale Multi-Tenant E-Commerce Platform  
**Status**: V1 Demonstration Baseline Frozen & Approved  
**Release**: `v1.0.0`

---

## 1. Executive Summary

ShopScale V1 successfully satisfies all architectural invariants, functional requirements, and performance SLOs defined in the PRD on reproducible physical hardware. All core distributed algorithms—deadlock-free inventory reservations, transactional outbox event relay, double-entry financial ledger accounting, and expand-and-contract database migrations—are verified by 997 passing automated tests.

This document serves as the formal **Production Handoff Specification** outlining the transition from the verified demonstration baseline to a real-money commercial production deployment.

---

## 2. Real-Money Integration Gates

### Gate P001: Live Payment Gateway & Multi-Seller Payouts (Stripe Connect)
- **Current Baseline**: Mock payment service (`@shopscale/mock-payments`) simulating Stripe payment intents, webhooks, HMAC signatures, and charge settlements.
- **Production Requirements**:
  1. **Stripe Connect (Custom or Express Accounts)**: Enable multi-seller marketplace split payments with destination charges (`transfer_data.destination = store.stripe_account_id`).
  2. **Payment Methods & Compliance**: Support 3D Secure 2 (SCA), Apple Pay, Google Pay, and localized bank transfers.
  3. **Dispute & Chargeback Webhooks**: Implement handlers for `charge.dispute.created` and `charge.dispute.closed`, recording debits against `seller_payable` with automated seller holdbacks.
  4. **Idempotency & Replay Protection**: Map `PaymentPort` to Stripe's native client `idempotency_key` headers.

### Gate P002: Real Shipping Carrier APIs & Automated Label Generation
- **Current Baseline**: Fixed flat-rate multi-seller shipping ($5/store base rate) with mock tracking number generation.
- **Production Requirements**:
  1. **Carrier Aggregator Adapter**: Implement `ShippingCarrierPort` using EasyPost or ShipEngine.
  2. **Live Dimensional Rating**: Query real-time rates based on product variant package dimensions, weight, origin warehouse, and destination postal code.
  3. **Automated Label Purchasing**: Webhook-driven label purchasing on seller order transition to `fulfillment_in_progress`, uploading PDF labels to S3 with pre-signed download URLs.
  4. **Carrier Tracking Webhooks**: Real-time webhook ingestion updating seller suborders to `in_transit` and `delivered`.

### Gate P003: Multi-Jurisdiction Automated Tax Engine (Avalara / Stripe Tax)
- **Current Baseline**: Deterministic tax calculation based on jurisdiction lookup table.
- **Production Requirements**:
  1. **Automated Tax Calculation**: Integrate Stripe Tax or Avalara AvaTax API to compute state, county, city, and special district sales tax in real-time at quote generation.
  2. **Economic Nexus Monitoring**: Track state-by-state sales volume and transaction count thresholds per seller.
  3. **Tax Exemption Certificate Handling**: Support B2B reseller tax exemption certificate validation.

### Gate P004: Custom Domain Routing & Dynamic SSL
- **Current Baseline**: Subdomain and path-based tenant routing (`/seller/:storeId`, `seed-*.local`).
- **Production Requirements**:
  1. **Edge SSL Termination**: Cloudflare for Platforms / Cloudflare for SaaS or AWS CloudFront with Custom Domain wildcards.
  2. **CNAME Verification**: Automated TXT record DNS verification before routing custom merchant domains (e.g., `store.auroragoods.com`) to platform edge.
  3. **Strict Multi-Tenant Origin Isolation**: Enforce header validation ensuring request host matches approved store record before serving tenant assets.

### Gate P005: Production Infrastructure, Zero-Trust Secrets & High Availability
- **Current Baseline**: Docker Compose production packaging (`infra/compose.prod.yml`) running unprivileged Node.js containers with local volume mounts.
- **Production Requirements**:
  1. **Managed PostgreSQL**: AWS RDS PostgreSQL Multi-AZ with automatic failover, read replicas for reporting (`DualPoolRouter`), and automated daily snapshots.
  2. **Managed Redis Cluster**: AWS ElastiCache for Redis (Multi-AZ with auto-failover) for BullMQ queues and single-flight cache-aside locks.
  3. **Zero-Trust Secrets**: Migration of `.env` configurations to AWS Secrets Manager or HashiCorp Vault with dynamic secret rotation for database passwords and JWT signing keys.
  4. **Container Orchestration**: Kubernetes (EKS) with Horizontal Pod Autoscaler (HPA) triggered by `http_request_duration_seconds` and BullMQ queue lag.

---

## 3. Production Architecture Port Verification

The clean hexagonal / modular architecture designed in V1 isolates all infrastructure concerns behind domain ports:

```text
Domain Core (Unchanged in Production)
  ├── InventoryService (Deadlock-Free Locking & Conditional Decrement)
  ├── CheckoutService (Multi-Seller Splitting & Idempotency)
  ├── FinancialLedgerService (Double-Entry Mathematical Balance)
  └── ReturnService (Fulfillment FSM & Refund Coordination)

Infrastructure Adapters (Swap Mock for Live in Production)
  ├── PaymentPort    ──► [MockPaymentAdapter]  ==> [StripeConnectAdapter]
  ├── SearchPort     ──► [PostgresSearch]       ==> [OpenSearchAdapter]
  ├── ShippingPort   ──► [FlatRateShipping]     ==> [EasyPostAdapter]
  ├── TaxPort        ──► [FixedTaxRate]         ==> [StripeTaxAdapter]
  └── StoragePort    ──► [LocalMinIO]           ==> [AWS S3 / CloudFront]
```

Because business invariants are enforced in the core domain and database schema, swapping these adapters requires zero changes to the underlying commerce state machine.

---

## 4. Production Launch Readiness Checklist

- [x] **Core Concurrency Proof**: 500 concurrent buyers / 50 stock units verified with 0 oversell and 0 deadlocks.
- [x] **Dual-Write Elimination**: Transactional outbox relay with BullMQ leasing verified.
- [x] **Double-Entry Balance**: Invariant `SUM(debits) === SUM(credits)` enforced in integer cents.
- [x] **Additive Migration Safety**: Non-destructive expand-and-contract migrations verified.
- [x] **Automated Disaster Recovery**: Scripted backup and restoration verified with schema parity assertions.
- [x] **Operational Incident Runbooks**: 5 copy-pasteable emergency playbooks authored and tested.
- [x] **Full Suite Green**: 997 tests passed across 174 test files; 0 TypeScript errors; 0 ESLint errors.
- [ ] **Live Gate P001 (Stripe Connect)**: Scheduled for Phase 6.
- [ ] **Live Gate P002 (Carrier APIs)**: Scheduled for Phase 6.
- [ ] **Live Gate P003 (Tax Engine)**: Scheduled for Phase 6.
- [ ] **Live Gate P004 (Custom Domains)**: Scheduled for Phase 6.
- [ ] **Live Gate P005 (Managed Cloud Infra)**: Scheduled for Phase 6.
