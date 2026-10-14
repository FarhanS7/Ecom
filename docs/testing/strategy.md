# Test and verification strategy

| Level | Tool proposal | Proves | Does not prove |
| --- | --- | --- | --- |
| Unit | Jest/Vitest | Money allocation, state transitions, token validation, query normalization | DB concurrency or distributed delivery |
| Component | Testing Library/Vitest | Accessible interactions and error states | Real API integration |
| Integration | Jest + real PostgreSQL/Redis (Testcontainers or isolated Compose) | Constraints, transactions, locking, cache and module interactions | Full browser UX |
| Contract | OpenAPI/event schema checks | DTO compatibility, route metadata, consumer schema | Correct business outcome alone |
| Browser | Playwright + accessibility checks | Store/marketplace/customer/staff journeys | Payment-provider durability alone |
| Load | k6 + SQL/telemetry evidence | Latency, throughput, contention under measured workload | Unmeasured hardware or production guarantees |
| Failure | Controlled process/service interruption | Recovery at explicit failure windows | Arbitrary failures never tested |
| Review | Different model/fresh session per framework | Independent analysis of evidence and risks | Formal correctness |

## Fixtures and isolation

Deterministic clock for expiry, deterministic IDs/seed, separate users/stores, explicit expected money sums. Each suite owns a test database/schema or resettable isolated stack, never the developer's real data. CI service names and storage buckets are uniquely scoped. Tests involving concurrency use independent DB connections and synchronization barriers, not Promise.all over one shared transaction.

## Critical scenario matrix

| Scenario | Exact oracle |
| --- | --- |
| 500 buyers, 50 units, mock always succeeds, no expiry | 50 paid orders, 50 charges, on_hand=0, reserved=0 |
| Reserve 2 from 5, confirm once, replay | on_hand=3, reserved=0; one confirmation movement |
| Reserve final line fails | Entire order/stock/coupon transaction rolled back |
| Same key 20 concurrent requests | One order/charge; matching response replay |
| Same key, changed request | 409 conflict, no second effect |
| Accepted key replayed after quote expiry | Original accepted response, no new reservation or charge |
| New checkout with expired/changed quote | 409 QUOTE_EXPIRED/PRICE_CHANGED before business effects |
| Customer substitutes another address ID | Denied; no foreign address returned or copied |
| Duplicate/late webhooks | One transition or tracked compensation |
| Store A IDs used by store B | Denial without foreign detail/aggregate leakage |
| Guest merge called twice | Quantities merged once in same channel |
| Concurrent refunds | Pending+completed allocation never exceeds captured amount |
| Membership revoked, old session reused | Privileged action denied |
| Search reindex during edits | Latest visibility/version survives switch |
| Jobs Redis lost and recreated | Durable reconciliation recovers required effects |
| Customer page rendered for another customer | No private response reuse |

## Execution resource strategy

On the 8 GB host, integration and browser workers default to one; concurrency tests create only the connections required by the scenario and tune pools deliberately. Full 500-buyer HTTP proof must report actual connection/queue behavior. Tier S CI checks use reduced datasets but preserve the same invariants; they are not Tier L benchmark evidence.

## Evidence format

For each run: date, commit SHA, command, versions, OS/CPU/RAM, container budgets, dataset/seed/checksum, warmup, duration, workload, expected thresholds, actual outcome, raw artifacts and limitations. Record failures and skipped runs. Never backfill a passing status from the existence of a test file.
