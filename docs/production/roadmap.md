# Production roadmap

The user chose demo first, production later. The demo plan is implementation-ready at task level; production is a separately gated roadmap because real providers, operating country, budget and policies are unknown.

## Ordered gates

| Gate | Work | Prerequisite |
| --- | --- | --- |
| [P001](P001.md) | Product and operating discovery | Before any real-money integration |
| [P002](P002.md) | Provider and seller onboarding design | P001 |
| [P003](P003.md) | Custom domains and shared identity | P001 |
| [P004](P004.md) | Real shipping, taxes and invoices | P001 P002 |
| [P005](P005.md) | Production security and privacy | P001 P003 |
| [P006](P006.md) | Hosting and service-level capacity | P001 |
| [P007](P007.md) | Reconciliation and support operations | P002 P004 P005 P006 |
| [P008](P008.md) | Migration, pilot and staged launch | P002 P003 P004 P005 P006 P007 |

## What carries forward

Domain ports, stock accounting, idempotency, outbox, scoped permissions, immutable order snapshots, financial reconciliation, test scenarios and telemetry remain useful. A real provider adapter must prove the same business invariants against its actual guarantees.

## What must be revisited

Demo origin routing, mock provider, local message sink, tax assumptions, shipping charges, staff authentication, backup targets, storage security, capacity and retention. Do not treat a portfolio demonstration as a production audit.

## Handoff after T090

List accepted ADRs, tested evidence, known limitations, data migration needs, provider decisions and unresolved gates. Create a separate production task tree after P001/P002; never conceal discovery work behind a generic “deploy” task.
