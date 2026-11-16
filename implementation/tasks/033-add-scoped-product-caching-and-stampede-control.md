# TASK-033 — Add Scoped Product Caching and Stampede Control

## Status

COMPLETED

## Goal

Build Redis cache-aside layer for Product Detail Pages with single-flight mutex lock, stale-while-revalidate, and event-driven invalidation.

## Why This Task Exists

Protects PostgreSQL from traffic spikes on hot products while guaranteeing sub-80ms PDP responses.

## Requirement References

- CT-5
- G1
- NFR-003
- PRD Section 6.2

## Dependencies

### Blocked By
- TASK-021
- TASK-026
- TASK-030

### Blocks
- TASK-079

## Architecture References

- ARCHITECTURE.md -> Caching Strategy
- DECISIONS.md -> DEC-007

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: performance-optimization
- Skill: performance-optimization
- Location: `skills/agent-skills-main/skills/performance-optimization/SKILL.md`
- Why required: Governs Redis cache-aside implementation and stampede mutex pattern.
- Installation/activation required: No
- Instructions that apply to this task:
  - Use SET lock:{key} 1 EX 5 NX
  - Apply TTL jitter

### Skill 2: test-driven-development
- Skill: test-driven-development
- Location: `skills/agent-skills-main/skills/test-driven-development/SKILL.md`
- Why required: Enforces testing concurrent cache misses before writing cache logic.
- Installation/activation required: No
- Instructions that apply to this task:
  - Simulate 50 concurrent requests
  - Assert exactly 1 DB query executed

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `packages/backend/src/catalog/read.service.ts`
- `packages/backend/src/catalog/catalog.controller.ts`
- `packages/backend/src/search/projector.ts`

## Current Behavior

Every PDP request executes relational queries against PostgreSQL without caching.

## Required Behavior

PDP reads check Redis first; on miss, acquires single-flight lock to query DB; caches payload with 5-minute TTL; ProductChanged events invalidate key immediately.

## Inputs / Outputs / Contracts

CacheKey: cache:pdp:{channelKey}:{productSlug}. CachePayload: CachedProductDetailDto.

## Implementation Commands

Execute in this order:

1. Implement RedisCacheService in packages/backend/src/platform/cache.service.ts with getOrSet() and distributed mutex lock.
2. Wrap CatalogReadService.getProductBySlug() with cache-aside layer.
3. Add TTL jitter (300s +/- 30s) to prevent synchronized cache expiration.
4. Hook outbox consumer to invalidate cache:pdp:* on ProductChanged and PublicationChanged events.
5. Write concurrency test tests/integration/cache-stampede.spec.ts.

## Data / Database Changes

None in PostgreSQL; stores JSON keys in Redis DB 0.

## Security Requirements

Cache keys are strictly scoped by channel and store slug; private customer data is never cached.

## Error Handling

Redis failure gracefully falls back to direct PostgreSQL query without throwing 500.

## Edge Cases

- Redis connection drop (must log error and bypass cache transparently)
- Process crashes while holding mutex lock (NX lock TTL of 5s guarantees automatic release)

## Observability

Emits cache_hits_total and cache_misses_total metrics.

## Tests Required

### Unit
- packages/backend/src/platform/cache.service.test.ts (mutex lock acquisition, release, TTL jitter)

### Integration
- tests/integration/cache-stampede.spec.ts (50 concurrent requests execute exactly 1 SQL query; outbox event invalidates key)

### End-to-End
- None.

### Security / Regression
- Verify cache key does not leak across distinct channel scopes

Do not mark the task complete until required tests pass.

## Manual Verification

Load product PDP twice; check Redis CLI KEYS cache:pdp:*; observe second request latency drops to < 10ms.

## Definition of Done

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
Single thorough review pass focusing on fallback behavior when Redis is down. Documented in docs/reviews/t033-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(catalog): add redis product caching with single-flight stampede mutex`

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
