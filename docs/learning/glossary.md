# Project glossary

| Term | Plain meaning in this project |
| --- | --- |
| Actor | Verified caller and current capabilities |
| Business | Seller organization; owns one store in the demo |
| Store / tenant scope | Branded storefront and boundary for seller-owned resources |
| Channel | Marketplace or a particular store |
| Membership | A user's role inside one store |
| RBAC | Permission granted through a role |
| Resource authorization | Permission additionally checked against the actual resource owner/scope |
| Variant | Purchasable SKU with its own price and stock |
| on_hand | Physical units currently accounted for |
| reserved | Units held for pending checkout |
| available | on_hand minus reserved |
| Reservation | Expiring promise of stock to one checkout |
| Parent order | One customer's checkout across one or more sellers |
| Seller suborder | One seller's independent fulfillment unit |
| Snapshot | Historical values copied when checkout occurs |
| Idempotency | Repeating the same intended operation has the same business effect |
| Request hash | Fingerprint of normalized operation input used to detect changed retries |
| Outbox | Durable events committed with the business mutation |
| Consumer receipt | Durable proof one consumer applied an event |
| At-least-once | Delivery may repeat; handlers must tolerate it |
| Compensation | A new action that counteracts an already committed effect |
| Uncertain outcome | The caller cannot tell whether an external operation happened |
| Projection | Read model rebuilt from canonical state/events |
| Eventual consistency | A read model may temporarily lag behind its source |
| Keyset pagination | Continue after the last ordered tuple instead of skipping N rows |
| Cache stampede | Many requests rebuild the same missing cached value |
| SLO | Measurable service target, not an automatic guarantee |
| p95 | 95% of observed values are at or below this percentile |
| RPO / RTO | Acceptable data-loss window / recovery-time target; set and measure before claiming |
| ADR | Record of a decision, alternatives, and consequences |
| Evidence | Actual commands/results supporting a claim |
