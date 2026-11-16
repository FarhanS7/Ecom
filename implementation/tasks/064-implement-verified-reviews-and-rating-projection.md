# TASK-064 — Implement Verified Reviews and Rating Projection

## Status

COMPLETED

## Goal

Build review submission requiring verified purchaser status, UNIQUE(product_id, user_id) constraint, and asynchronous rating rollup projector.

## Why This Task Exists

Eliminates fraudulent reviews and provides shoppers with trustworthy star ratings and customer feedback.

## Requirement References

- RV-1
- RV-2
- PRD Section 6.6

## Dependencies

### Blocked By
- TASK-019
- TASK-030
- TASK-056

### Blocks
- TASK-075

## Architecture References

- ARCHITECTURE.md -> Catalog
- docs/modules/engagement.md

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: test-driven-development
- Skill: test-driven-development
- Location: `skills/agent-skills-main/skills/test-driven-development/SKILL.md`
- Why required: Enforces testing verified purchaser verification and review deduplication.
- Installation/activation required: No
- Instructions that apply to this task:
  - Test unpurchased review rejection (403)
  - Test duplicate review on same product (409)

### Skill 2: api-and-interface-design
- Skill: api-and-interface-design
- Location: `skills/agent-skills-main/skills/api-and-interface-design/SKILL.md`
- Why required: Governs review submission and listing contracts.
- Installation/activation required: No
- Instructions that apply to this task:
  - Validate rating is integer 1 to 5
  - Emit ReviewChanged event on write

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `packages/backend/src/commerce/schema.ts`
- `packages/backend/src/search/projector.ts`
- `docs/modules/engagement.md`

## Current Behavior

Not implemented. Products have static placeholder rating counts; customers cannot write reviews.

## Required Behavior

Only customers with a DELIVERED order containing the product variant can submit a review; enforced 1 review per user per product; ReviewChanged outbox event asynchronously updates rating_avg and rating_count.

## Inputs / Outputs / Contracts

CreateReviewDto: { rating: 1 | 2 | 3 | 4 | 5, body: string }. ReviewDto: { id: string, rating: number, body: string, authorName: string, createdAt: string }.

## Implementation Commands

Execute in this order:

1. Author migration db/migrations/0021-reviews.sql creating reviews table with UNIQUE(product_id, user_id).
2. Implement ReviewService in packages/backend/src/engagement/review.service.ts.
3. Verify customer has an order_item for this product with seller_orders.fulfillment_status = 'DELIVERED'.
4. Insert review and write ReviewChanged event to outbox.
5. Build ReviewProjector worker consumer updating products.rating_sum, rating_count, and search_documents.rating_avg.
6. Build Next.js reviews list and submission form on PDP.
7. Write integration tests in tests/integration/reviews.spec.ts.

## Data / Database Changes

Creates reviews table in migration 0021-reviews.sql; updates products and search_documents.

## Security Requirements

Enforces verified purchaser check; fully refunded purchases cannot review.

## Error Handling

Returns 403 Forbidden with code NOT_VERIFIED_PURCHASER if user has not purchased item; 409 Conflict if already reviewed.

## Edge Cases

- Customer bought product twice (still restricted to exactly 1 review for that product)

## Observability

Tracks review submissions and average rating calculation duration.

## Tests Required

### Unit
- packages/backend/src/engagement/review.service.test.ts (purchaser eligibility, rating boundaries, rating average calculation)

### Integration
- tests/integration/reviews.spec.ts (unverified customer denied; verified purchaser submits; assert unique constraint; assert rating projected to search_documents)

### End-to-End
- tests/e2e/reviews.spec.ts (customer delivers order, leaves 5-star review, verifies review appears on PDP)

### Security / Regression
- Assert user cannot review a product they never purchased

Do not mark the task complete until required tests pass.

## Manual Verification

Submit 5-star review as customer1; check product PDP; verify new review displays with 'Verified Purchaser' badge.

## Definition of Done

- [ ] Required skills inspected and activated
- [ ] Requirement behavior implemented
- [ ] Architecture rules followed
- [ ] Security requirements satisfied
- [ ] Tests added
- [ ] Relevant tests pass
- [ ] Lint passes
- [ ] Typecheck passes
- [ ] Build passes
- [ ] Documentation updated where required
- [ ] Requirement traceability updated
- [ ] Independent review completed according to risk
- [ ] No unresolved blocking review findings
- [ ] Manual verification completed when required
- [x] Required skills inspected and activated
- [x] Requirement behavior implemented
- [x] Architecture rules followed
- [x] Security requirements satisfied
- [x] Tests added
- [x] Relevant tests pass
- [x] Lint passes
- [x] Typecheck passes
- [x] Build passes
- [x] Documentation updated where required
- [x] Requirement traceability updated
- [x] Independent review completed according to risk
- [x] No unresolved blocking review findings
- [x] Manual verification completed when required

## Independent Review Requirement

Risk Level:
MEDIUM

Review requirements:
Single thorough review pass focusing on purchaser eligibility checks and denormalized rating math. Documented in docs/reviews/t064-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(engagement): implement verified purchaser reviews and asynchronous rating projection`

Only commit a meaningful green change.

## Completion Report

When finished, report:

- files changed,
- migrations created,
- tests added,
- commands executed,
- test results,
- assumptions,
- known limitations,
- review status,
- manual verification status.

Do not simply report "done."
