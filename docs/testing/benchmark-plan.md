# Benchmark protocol and targets

No benchmarks have run. This document defines the experiment, not its result.

## Targets retained from the PRD

| Metric | Required target / interpretation |
| --- | --- |
| Cached product list p95 | <50ms |
| Cache-miss list p95 | <150ms |
| Product detail p95 | <80ms |
| Search p95 | <150ms stricter G1; also report source section 7 baseline <200ms |
| Autocomplete p95 | <50ms |
| Add to cart p95 | <60ms |
| Checkout acceptance p95 | <500ms; durable pending order, not full async payment latency |
| Mixed browse throughput | >=1000 requests/second for 10 minutes |
| Error rate | <0.5% |
| Flash sale | 500 concurrent buyers, 50 units, exactly 50 paid orders in controlled success case |
| Retry storm | 20 same-key requests, exactly one order and charge |
| Recovery | Required order completes within 60s after worker restart with healthy dependencies |
| Soak | 30 minutes at 40% of measured peak, stable latency and no sustained memory growth |
| Domain coverage | >=80%, plus meaningful integration tests |
| Seed S / L | S <30 seconds, L <10 minutes, measured separately |

The source target environment is 4 vCPU/8 GB at Tier L. The user's 8 GB Windows host also runs OS/editor/Docker overhead and its CPU is unknown. Record actual environment and compare honestly. A larger dedicated benchmark host may provide useful additional evidence but cannot be silently presented as meeting the original machine profile.

## Seed tiers

| Entity | S | M | L | XL stretch |
| --- | ---: | ---: | ---: | ---: |
| Customers | 1,000 | 10,000 | 100,000 | 1,000,000 |
| Sellers | 20 | 100 | 500 | 2,000 |
| Categories | 30 | 120 | 400 | 400 |
| Products | 1,000 | 10,000 | 100,000 | 1,000,000 |
| Variants / inventory rows | 2,500 | 25,000 | 250,000 | 2,500,000 |
| Addresses | 1,400 | 14,000 | 140,000 | 1,400,000 |
| Orders / payments | 5,000 | 100,000 | 1,000,000 | 10,000,000 |
| Order items | 9,000 | 180,000 | 1,800,000 | 18,000,000 |
| Stock movements | 20,000 | 400,000 | 4,000,000 | 40,000,000 |
| Reviews | 3,000 | 60,000 | 600,000 | 6,000,000 |
| Coupons | 20 | 100 | 300 | 1,000 |
| Audit rows | 5,000 | 100,000 | 1,000,000 | 10,000,000 |

These are source benchmark fixture targets; invariant-valid generation takes precedence over padding impossible records. Every review needs an eligible delivered purchase, and stock ledger counts must accommodate the chosen order/reservation history. Report any reconciled count change explicitly in the seed manifest.

Generate in FK order with deterministic seed 42, streaming COPY, bounded memory and no private customer data. Maintain the source's skewed popularity/price/order-date/status/stock/rating distributions. The 20k-product deep-pagination fixture belongs only to tiers large enough to contain it. Generate the 50k CSV validation fixture separately from Tier S DB size.

## Experiment procedure

1. Record OS/CPU/RAM, Docker limits, Node/PostgreSQL/Redis/search versions, commit, data checksum and service set.
2. Verify data/invariants before load. Disable random payment failure in the exact-50 success test.
3. Identify load-generator host and network path. Do not hide generator contention on the same machine.
4. Run smoke first. Define warmup and cache state; separate cold/warm results.
5. Run three controlled repetitions; preserve each raw result and report median summary, not a handpicked fastest run.
6. Collect latency distributions, error counts, CPU/memory, DB pool/lock waits and queue lag. Measure async paid completion separately.
7. Restore baseline before before/after comparisons and verify result equivalence.
8. Mark each target passed/failed/not run and link raw artifacts. Investigate failure before tuning.

Performance fixes must preserve stock, idempotency, and scope invariants. Fast but wrong is a failed test.
