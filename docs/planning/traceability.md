# Requirement-to-task traceability

Status: coverage plan, not completion evidence. Every original functional requirement has a disposition. Track actual completion in [tasks/todo.md](../../tasks/todo.md).

## Original functional requirements

| ID | Requirement | Tasks | Scope |
| --- | --- | --- | --- |
| ID-1 | Register/login/logout/refresh/reset | [T009](../../tasks/items/T009.md), [T010](../../tasks/items/T010.md), [T011](../../tasks/items/T011.md), [T012](../../tasks/items/T012.md), [T017](../../tasks/items/T017.md) | P0 |
| ID-2 | Email verification | [T012](../../tasks/items/T012.md), [T017](../../tasks/items/T017.md) | P1 |
| ID-3 | Refresh rotation and reuse revocation | [T011](../../tasks/items/T011.md) | P0 |
| ID-4 | Account backoff/lockout | [T013](../../tasks/items/T013.md) | P1 |
| ID-5 | Seller onboarding approval | [T015](../../tasks/items/T015.md), [T069](../../tasks/items/T069.md) | P0 |
| CT-1 | Products, variants, images, attributes, categories | [T019](../../tasks/items/T019.md), [T020](../../tasks/items/T020.md), [T027](../../tasks/items/T027.md), [T035](../../tasks/items/T035.md), [T036](../../tasks/items/T036.md) | P0 |
| CT-2 | Cursor lists and price/newest/popularity sort | [T021](../../tasks/items/T021.md), [T022](../../tasks/items/T022.md), [T025](../../tasks/items/T025.md) | P0 |
| CT-3 | Typo search, filters and facets | [T030](../../tasks/items/T030.md), [T031](../../tasks/items/T031.md), [T032](../../tasks/items/T032.md) | P0 |
| CT-4 | Autocomplete under 50ms p95 | [T032](../../tasks/items/T032.md), [T079](../../tasks/items/T079.md) | P1 |
| CT-5 | Cache-aside detail and stampede protection | [T033](../../tasks/items/T033.md) | P0 |
| CT-6 | Async index updates and full reindex | [T029](../../tasks/items/T029.md), [T030](../../tasks/items/T030.md), [T034](../../tasks/items/T034.md) | P0 |
| CT-7 | Presigned uploads and thumbnails | [T035](../../tasks/items/T035.md), [T036](../../tasks/items/T036.md) | P1 |
| IN-1 | on_hand and reserved counters | [T037](../../tasks/items/T037.md) | P0 |
| IN-2 | Checkout reservation TTL and expiry | [T038](../../tasks/items/T038.md), [T039](../../tasks/items/T039.md), [T047](../../tasks/items/T047.md) | P0 |
| IN-3 | Atomic stock accounting | [T038](../../tasks/items/T038.md), [T044](../../tasks/items/T044.md), [T053](../../tasks/items/T053.md) | P0 |
| IN-4 | Append-only stock ledger | [T037](../../tasks/items/T037.md), [T038](../../tasks/items/T038.md), [T039](../../tasks/items/T039.md) | P0 |
| IN-5 | Low-stock alerts | [T076](../../tasks/items/T076.md) | P2 stretch |
| CA-1 | Redis cart with durable DB state | [T041](../../tasks/items/T041.md) | P0 |
| CA-2 | Guest login merge | [T042](../../tasks/items/T042.md), [T043](../../tasks/items/T043.md) | P1 |
| CA-3 | Server price/stock revalidation | [T045](../../tasks/items/T045.md), [T047](../../tasks/items/T047.md), [T048](../../tasks/items/T048.md) | P0 |
| OR-1 | Checkout idempotency and replay | [T047](../../tasks/items/T047.md), [T054](../../tasks/items/T054.md) | P0 |
| OR-2 | Order transitions | [T046](../../tasks/items/T046.md), [T051](../../tasks/items/T051.md), [T056](../../tasks/items/T056.md), [T058](../../tasks/items/T058.md) | P0 |
| OR-3 | Mock signed webhook and dedupe | [T049](../../tasks/items/T049.md), [T050](../../tasks/items/T050.md), [T054](../../tasks/items/T054.md) | P0 |
| OR-4 | Transactional outbox | [T029](../../tasks/items/T029.md), [T047](../../tasks/items/T047.md) | P0 |
| OR-5 | Reserve/charge/confirm compensation | [T051](../../tasks/items/T051.md), [T052](../../tasks/items/T052.md), [T053](../../tasks/items/T053.md) | P0 |
| OR-6 | Seller suborders and payout accounting | [T046](../../tasks/items/T046.md), [T055](../../tasks/items/T055.md), [T056](../../tasks/items/T056.md), [T070](../../tasks/items/T070.md) | P1 promoted for checkout |
| OR-7 | Invoice PDF and object storage | [T061](../../tasks/items/T061.md) | P1 |
| OR-8 | Partial/full refunds and ledger | [T060](../../tasks/items/T060.md), [T070](../../tasks/items/T070.md) | P1 |
| OR-9 | Coupons and atomic usage limits | [T045](../../tasks/items/T045.md), [T063](../../tasks/items/T063.md) | P1 |
| RV-1 | Verified purchaser, unique review | [T064](../../tasks/items/T064.md) | P0 |
| RV-2 | Async aggregate ratings | [T064](../../tasks/items/T064.md) | P1 |
| AD-1 | Privileged mutation audit | [T015](../../tasks/items/T015.md), [T029](../../tasks/items/T029.md), [T062](../../tasks/items/T062.md) | P0 |
| AD-2 | Sales/admin reports | [T066](../../tasks/items/T066.md), [T067](../../tasks/items/T067.md), [T082](../../tasks/items/T082.md) | P1 |
| AD-3 | Worker email/SMS retries and failed queue | [T061](../../tasks/items/T061.md), [T073](../../tasks/items/T073.md) | P1 demo adapters |
| AD-4 | Feature flags | [T076](../../tasks/items/T076.md) | P2 stretch |

## Confirmed additions and design requirements

| Requirement | Tasks / evidence |
| --- | --- |
| Shared marketplace + branded stores | T014–T016, T021, T024–T026 |
| One catalog/stock pool; optional marketplace listing | T020–T021, T038, T044, T053 |
| Global customer identity; scoped staff | T009–T018, T055 |
| Separate carts per store and marketplace | T041–T043, T047 |
| Owned customer address book and immutable delivery snapshots | T091, T047, T055 |
| Server-issued quote and price-change confirmation | T045, T047–T048 |
| One business/store with invited staff | T014–T015, T068 |
| Design token/theming contract | T016, T023–T027, T068, T075 |
| Homepage blocks and missing-data reflow | T024, T068 |
| Wishlist | T065 |
| Return requests and inspection | T058–T060 |
| Responsive/accessibility/error states | T023, every screen task, T075 |
| Frontend performance | T080 |
| Guided learning + challenge-first material | 12 lessons, 12 challenges, 12 hint files, 12 solutions; each task links relevant topic |
| Windows/Docker/8GB | T004, local-development guide, optional profiles |
| Flexible pace | milestone-based plan, no deadline estimates |
| Demo now / real production later | T049, T086–T090, production roadmap |

## Engineering goals and proof

| Goal | Tasks | Required artifact |
| --- | --- | --- |
| G1 catalog/search scale | T077–T084 | Query plans and raw load results; search stricter <150ms goal |
| G2 no overselling | T044, T053 | 500/50 concurrent cross-channel proof |
| G3 safe payments | T047, T052, T054, T060 | One-effect retry/replay/refund results |
| G4 RBAC/resource authorization | T018, T055, T074 | Complete route/role/resource matrix |
| G5 recovery | T029–T030, T052, T073 | Crash-window outcomes and <60s recovery measurement |
| G6 operability | T071–T072, T085–T087 | Traces, dashboards, restore and runbook drills |

## Original repository/evidence expectations

The proposed repository layout preserves apps/api, apps/worker, apps/web, db/migrations, db/seed, loadtests, infra, and docs. packages/backend supports shared domain logic without cross-app imports. pnpm is the portable command surface; optional Make wrappers can satisfy the original make examples without making Windows users install Make.

Tier S/M/L/XL generators and distribution verification are T077. Deep pagination, missing-index and N+1 experiments are T078/T083. The dirty 50k-product CSV fixture and validation report belong to seed-tooling exercises in T077; a public seller bulk-import feature is outside the stated P0/P1 API scope.

README diagrams, benchmarks, ADRs, demo accounts and walkthrough are T089. Final acceptance is T090. Missing/unverified scale evidence remains explicitly open.
