# Implementation task tracker

All items are not started. This is the sole implementation status checklist; phase documents link here rather than maintaining competing task status.

## 0. Foundation

- [x] [T001: Review scope and proposed decisions](items/T001.md)
- [x] [T002: Establish the TypeScript workspace](items/T002.md)
- [x] [T003: Create the database migration harness](items/T003.md)
- [x] Checkpoint after T003: focused tests/build pass, integrated behavior observed, learning questions answered, evidence recorded (docs/reviews/t003-context.md; live Docker migration run pending bench host — declared in milestone-0-context.md).
- [x] [T004: Define the minimal Docker profile](items/T004.md)
- [x] [T005: Add validated configuration and health routes](items/T005.md)
- [x] [T006: Establish API and error conventions](items/T006.md)
- [x] Checkpoint after T006: focused tests/build pass, integrated behavior observed, learning questions answered, evidence recorded (docs/reviews/t006-context.md; backend 9/9, api 10/10 at commit).
- [x] [T007: Create the Next.js application shell](items/T007.md)
- [x] [T008: Add initial continuous integration gates](items/T008.md)
- [x] Checkpoint after T008: focused tests/build pass, integrated behavior observed, learning questions answered, evidence recorded (see docs/reviews/milestone-0-context.md).

## 1. Identity and stores

- [x] [T009: Model global accounts and session records](items/T009.md)
- [x] [T010: Implement registration and login](items/T010.md)
- [x] [T011: Implement refresh rotation and logout](items/T011.md)
- [x] Checkpoint after T011: focused tests/build pass, integrated behavior observed, learning questions answered, evidence recorded (T009–T011 contexts; failure cases: duplicate-registration collapse, refresh race revocation, generic-401 indistinguishability).
- [x] [T012: Implement account recovery and verification](items/T012.md)
- [x] [T013: Add authentication throttling and browser protections](items/T013.md)
- [x] [T014: Implement scoped store memberships](items/T014.md)
- [x] Checkpoint after T014: focused tests/build pass, integrated behavior observed, learning questions answered, evidence recorded (T012–T014 contexts; failure cases: replay/supersede, threshold/cooldown, cross-store denial, stale-membership retry).
- [x] [T015: Implement seller applications and invitations](items/T015.md)
- [x] [T016: Resolve storefront channels and themes](items/T016.md)
- [x] [T017: Build account and recovery screens](items/T017.md)
- [x] Checkpoint after T017: focused tests/build pass, integrated behavior observed, learning questions answered, evidence recorded (docs/reviews/t017-context.md; failure cases: generic-401 indistinguishability, zero-redirect loop-freedom, storage grep clean).
- [x] [T018: Build the authorization matrix harness](items/T018.md)
- [x] Checkpoint after T018: focused tests/build pass, integrated behavior observed, learning questions answered, evidence recorded (docs/reviews/t018-context.md; gate caught live openapi drift during T091a).
- [x] [T091: Implement the customer address book](items/T091.md) (T091a+T091b; docs/reviews/t091-context.md)
- [ ] Checkpoint after T091: owned address CRUD and browser form verified (prod loopback: all 5 verbs through gateway prefix → API 401 auth guard; UI on /account; e2e written, not run — browsers absent); historical snapshot regression **deferred by design to checkout work** (T046+) per T091b risk note — leave unchecked until then.

## 2. Catalog and storefront

- [ ] [T019: Model products and variants](items/T019.md)
- [ ] [T020: Implement seller catalog mutations](items/T020.md)
- [ ] [T021: Implement channel-aware catalog reads](items/T021.md)
- [ ] Checkpoint after T021: focused tests/build pass, integrated behavior observed, learning questions answered, evidence recorded.
- [ ] [T022: Add stable keyset pagination](items/T022.md)
- [ ] [T023: Build the token-based component foundation](items/T023.md)
- [ ] [T024: Build connected storefront home pages](items/T024.md)
- [ ] Checkpoint after T024: focused tests/build pass, integrated behavior observed, learning questions answered, evidence recorded.
- [ ] [T025: Build product listing and filters](items/T025.md)
- [ ] [T026: Build product detail and variant selection](items/T026.md)
- [ ] [T027: Build seller catalog editing screens](items/T027.md)
- [ ] Checkpoint after T027: focused tests/build pass, integrated behavior observed, learning questions answered, evidence recorded.
- [ ] [T028: Seed a deterministic catalog skeleton](items/T028.md)
- [ ] Checkpoint after T028: focused tests/build pass, integrated behavior observed, learning questions answered, evidence recorded.

## 3. Events, search, and media

- [ ] [T029: Implement transactional outbox and relay](items/T029.md)
- [ ] [T030: Implement idempotent projection consumers](items/T030.md)
- [ ] [T031: Implement text search, typo fallback and facets](items/T031.md)
- [ ] Checkpoint after T031: focused tests/build pass, integrated behavior observed, learning questions answered, evidence recorded.
- [ ] [T032: Implement autocomplete and search UI](items/T032.md)
- [ ] [T033: Add scoped product caching and stampede control](items/T033.md)
- [ ] [T034: Implement safe full reindex](items/T034.md)
- [ ] Checkpoint after T034: focused tests/build pass, integrated behavior observed, learning questions answered, evidence recorded.
- [ ] [T035: Implement validated asset uploads](items/T035.md)
- [ ] [T036: Connect media editing and responsive images](items/T036.md)
- [ ] Checkpoint after T036: focused tests/build pass, integrated behavior observed, learning questions answered, evidence recorded.

## 4. Carts and shared inventory

- [ ] [T037: Model stock invariants and movement ledger](items/T037.md)
- [ ] [T038: Implement atomic basket reservations](items/T038.md)
- [ ] [T039: Implement expiry and stock adjustments](items/T039.md)
- [ ] Checkpoint after T039: focused tests/build pass, integrated behavior observed, learning questions answered, evidence recorded.
- [ ] [T040: Build seller stock management UI](items/T040.md)
- [ ] [T041: Implement durable channel carts](items/T041.md)
- [ ] [T042: Implement guest cart ownership and merge](items/T042.md)
- [ ] Checkpoint after T042: focused tests/build pass, integrated behavior observed, learning questions answered, evidence recorded.
- [ ] [T043: Build cart and add-to-cart interactions](items/T043.md)
- [ ] [T044: Prove cross-channel stock contention](items/T044.md)
- [ ] Checkpoint after T044: focused tests/build pass, integrated behavior observed, learning questions answered, evidence recorded.

## 5. Checkout and mock payments

- [ ] [T045: Implement totals and coupon allocation contracts](items/T045.md)
- [ ] [T046: Model orders and seller suborders](items/T046.md)
- [ ] [T047: Implement idempotent checkout creation](items/T047.md)
- [ ] Checkpoint after T047: focused tests/build pass, integrated behavior observed, learning questions answered, evidence recorded.
- [ ] [T048: Build checkout review and pending-order UI](items/T048.md)
- [ ] [T049: Implement the persistent mock provider](items/T049.md)
- [ ] [T050: Implement payment dispatch and webhook ingestion](items/T050.md)
- [ ] Checkpoint after T050: focused tests/build pass, integrated behavior observed, learning questions answered, evidence recorded.
- [ ] [T051: Confirm paid orders and compensate failures](items/T051.md)
- [ ] [T052: Reconcile uncertain payment outcomes](items/T052.md)
- [ ] [T053: Prove the checkout expiry race](items/T053.md)
- [ ] Checkpoint after T053: focused tests/build pass, integrated behavior observed, learning questions answered, evidence recorded.
- [ ] [T054: Prove retry and duplicate-webhook safety](items/T054.md)
- [ ] Checkpoint after T054: focused tests/build pass, integrated behavior observed, learning questions answered, evidence recorded.

## 6. Fulfillment and after-sales

- [ ] [T055: Implement scoped order history and detail](items/T055.md)
- [ ] [T056: Implement seller fulfillment transitions](items/T056.md)
- [ ] [T057: Build customer and seller order screens](items/T057.md)
- [ ] Checkpoint after T057: focused tests/build pass, integrated behavior observed, learning questions answered, evidence recorded.
- [ ] [T058: Implement cancellation and return requests](items/T058.md)
- [ ] [T059: Build after-sales request screens](items/T059.md)
- [ ] [T060: Implement partial refunds and balanced ledger](items/T060.md)
- [ ] Checkpoint after T060: focused tests/build pass, integrated behavior observed, learning questions answered, evidence recorded.
- [ ] [T061: Implement invoices and demo notifications](items/T061.md)
- [ ] [T062: Audit all privileged business mutations](items/T062.md)
- [ ] Checkpoint after T062: focused tests/build pass, integrated behavior observed, learning questions answered, evidence recorded.

## 7. Engagement and administration

- [ ] [T063: Build coupon management and redemption UI](items/T063.md)
- [ ] [T064: Implement verified reviews and rating projection](items/T064.md)
- [ ] [T065: Implement shared customer wishlist](items/T065.md)
- [ ] Checkpoint after T065: focused tests/build pass, integrated behavior observed, learning questions answered, evidence recorded.
- [ ] [T066: Implement scoped sales read models](items/T066.md)
- [ ] [T067: Build seller and platform dashboards](items/T067.md)
- [ ] [T068: Build team, theme and store-content settings](items/T068.md)
- [ ] Checkpoint after T068: focused tests/build pass, integrated behavior observed, learning questions answered, evidence recorded.
- [ ] [T069: Build support and admin policy workflows](items/T069.md)
- [ ] [T070: Implement simulated seller settlement](items/T070.md)
- [ ] Checkpoint after T070: focused tests/build pass, integrated behavior observed, learning questions answered, evidence recorded.

## 8. Reliability and quality

- [ ] [T071: Trace requests through API and workers](items/T071.md)
- [ ] [T072: Add metrics dashboards and alerts](items/T072.md)
- [ ] [T073: Run failure recovery and broker-loss tests](items/T073.md)
- [ ] Checkpoint after T073: focused tests/build pass, integrated behavior observed, learning questions answered, evidence recorded.
- [ ] [T074: Complete security regression coverage](items/T074.md)
- [ ] [T075: Complete accessibility and responsive verification](items/T075.md)
- [ ] [T076: Add low-stock and feature-flag extensions](items/T076.md)
- [ ] Checkpoint after T076: focused tests/build pass, integrated behavior observed, learning questions answered, evidence recorded.

## 9. Performance and scale evidence

- [ ] [T077: Generate realistic seed tiers and verify distributions](items/T077.md)
- [ ] [T078: Prove index and pagination improvements](items/T078.md)
- [ ] [T079: Build SLO and throughput load suites](items/T079.md)
- [ ] Checkpoint after T079: focused tests/build pass, integrated behavior observed, learning questions answered, evidence recorded.
- [ ] [T080: Measure frontend performance](items/T080.md)
- [ ] [T081: Compare optional OpenSearch adapter](items/T081.md)
- [ ] [T082: Explore partitioning and read replicas](items/T082.md)
- [ ] Checkpoint after T082: focused tests/build pass, integrated behavior observed, learning questions answered, evidence recorded.
- [ ] [T083: Run soak and contention analysis](items/T083.md)
- [ ] [T084: Assemble honest benchmark evidence](items/T084.md)
- [ ] Checkpoint after T084: focused tests/build pass, integrated behavior observed, learning questions answered, evidence recorded.

## 10. Release and portfolio

- [ ] [T085: Rehearse backups and restoration](items/T085.md)
- [ ] [T086: Prepare demo deployment and rollback](items/T086.md)
- [ ] [T087: Complete runbooks and operating drills](items/T087.md)
- [ ] Checkpoint after T087: focused tests/build pass, integrated behavior observed, learning questions answered, evidence recorded.
- [ ] [T088: Perform independent milestone review](items/T088.md)
- [ ] [T089: Prepare portfolio narrative and demonstration](items/T089.md)
- [ ] [T090: Close the demo and define production handoff](items/T090.md)
- [ ] Checkpoint after T090: focused tests/build pass, integrated behavior observed, learning questions answered, evidence recorded.
