# TASK-031 — Implement Text Search, Typo Fallback and Facets

## Status

COMPLETED

## Goal

Build full-text search query service on search_documents using tsvector GIN, pg_trgm similarity, category filtering, and facet counts.

## Why This Task Exists

Provides sub-150ms typo-tolerant search and rich facet navigation across 100k products without external cluster overhead.

## Requirement References

- CT-3
- G1
- NFR-004
- PRD Section 6.2

## Dependencies

### Blocked By
- TASK-030

### Blocks
- TASK-032
- TASK-034
- TASK-079
- TASK-081

## Architecture References

- ARCHITECTURE.md -> Search
- DECISIONS.md -> DEC-007
- docs/modules/search.md

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: performance-optimization
- Skill: performance-optimization
- Location: `skills/agent-skills-main/skills/performance-optimization/SKILL.md`
- Why required: Governs GIN index query planning and sub-150ms search execution.
- Installation/activation required: No
- Instructions that apply to this task:
  - Use ts_rank_cd for relevance
  - Combine GIN and trigram similarity safely

### Skill 2: api-and-interface-design
- Skill: api-and-interface-design
- Location: `skills/agent-skills-main/skills/api-and-interface-design/SKILL.md`
- Why required: Governs search request DTOs and facet response shapes.
- Installation/activation required: No
- Instructions that apply to this task:
  - Return facet counts alongside items
  - Sanitize user query terms

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `packages/backend/src/search/schema.ts`
- `packages/backend/src/catalog/read.service.ts`
- `docs/modules/search.md`

## Current Behavior

Not implemented. Marketplace has only category browse; no keyword search or facet aggregation.

## Required Behavior

GET /v1/search?q=... returns matching products ranked by relevance, handles typos with pg_trgm fallback, and computes category/brand/price facet counts.

## Inputs / Outputs / Contracts

SearchQueryDto: { q: string, categoryId?: string, minPrice?: number, maxPrice?: number, brand?: string, cursor?: string, limit?: number }. SearchResponseDto: { items: [...], facets: { brands: [...], categories: [...], priceRanges: [...] }, nextCursor: string | null }.

## Implementation Commands

Execute in this order:

1. Implement SearchQueryService in packages/backend/src/search/query.service.ts.
2. Build tsquery parser stripping special characters and applying prefix matching (':*').
3. Implement pg_trgm similarity fallback when full-text match returns fewer than 3 results.
4. Build facet count aggregation queries using GROUP BY within current filter scope.
5. Expose GET /v1/search in SearchController.
6. Write integration tests in tests/integration/search.spec.ts covering typos, facets, and channel filtering.

## Data / Database Changes

Adds GIN index on search_documents.tsv and GIN trigram index on search_documents.title.

## Security Requirements

Sanitizes search query inputs; prevents SQL injection via tsquery manipulation.

## Error Handling

Returns empty results with 200 OK on empty query or no matches; 400 Bad Request on malformed filters.

## Edge Cases

- Query with single quote, backslash, or boolean operators (must be sanitized into valid tsquery tokens)
- Store-only product searched from global marketplace (must be excluded from results)

## Observability

Records query execution duration; warns if search query plan exceeds 100ms.

## Tests Required

### Unit
- packages/backend/src/search/query-parser.test.ts (query sanitization, prefix conversion)

### Integration
- tests/integration/search.spec.ts (test exact match, typo fallback, facet count accuracy, store scoping)

### End-to-End
- None.

### Security / Regression
- Assert tsquery injection attempts do not throw SQL syntax errors

Do not mark the task complete until required tests pass.

## Manual Verification

Execute curl 'http://localhost:3001/v1/search?q=hedphone'; verify 'Headphones' returned with category facet counts.

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
Single thorough review pass focusing on GIN index utilization and query plan safety. Documented in docs/reviews/t031-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(search): implement full-text search typo fallback and facet aggregation`

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
