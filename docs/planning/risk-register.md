# Risk register

| Risk | Impact | Early mitigation / proof | Revisit trigger |
| --- | --- | --- | --- |
| Scope expands from marketplace to SaaS platform | High | Confirmed one business/store, path-based demo, production roadmap | Custom domain/multi-store request |
| Cross-store data leak | High | Composite FKs, scoped ports, route/resource/cache matrix | Every new seller endpoint |
| Overselling between channels | High | Conditional reservation, ledger, 500/50 proof | Any stock transition change |
| Duplicate charge/refund | High | Effect keys, durable receipts, provider lookup | Provider adapter change |
| Event lost after broker failure | High | Outbox/receipt/effect reconciliation | Queue retention or persistence change |
| Coupon/refund race | High | Aggregate locks, deterministic allocation, concurrent tests | New pricing/promotion rule |
| 8GB host resource exhaustion | Medium | Minimal profile, one test worker, Tier S | Builds swap or tests fail from OOM |
| Stale search reveals private publication | High | Canonical visibility gate including facets | New engine/reindex path |
| Learning reduced to copying | Medium | Separate challenge/hints/solutions, transfer questions | Cannot explain a completed task |
| Review tooling unavailable | Medium | Preserve independent review gate; explicit amendment if needed | Named reviewer cannot be used |
| Unrealistic performance claims | High | Raw artifacts, exact environment, not-run labels | Benchmark published in portfolio |
| Production decisions inferred from demo | High | Separate discovery gates; mock labels | Real-money launch requested |

No risk is “resolved” by writing this table. Implementation evidence closes or reduces it.
