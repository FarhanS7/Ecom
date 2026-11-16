# TASK-032 — Implement Autocomplete and Search UI

## Status

COMPLETED

## Goal

Build sub-50ms autocomplete suggestion API and interactive search bar component with debounced query dropdown.

## Why This Task Exists

Provides shoppers with fast search discovery directly from the header navigation.

## Requirement References

- CT-4
- design.md
- PRD Section 6.2

## Dependencies

### Blocked By
- TASK-025
- TASK-031

### Blocks
- TASK-075
- TASK-079

## Architecture References

- ARCHITECTURE.md -> Frontend
- docs/architecture/frontend.md

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: frontend-ui-engineering
- Skill: frontend-ui-engineering
- Location: `skills/agent-skills-main/skills/frontend-ui-engineering/SKILL.md`
- Why required: Governs client-side debounce, keyboard navigation, and ARIA combobox accessibility.
- Installation/activation required: No
- Instructions that apply to this task:
  - Debounce user input by 150ms
  - Support ArrowUp/ArrowDown/Escape navigation

### Skill 2: performance-optimization
- Skill: performance-optimization
- Location: `skills/agent-skills-main/skills/performance-optimization/SKILL.md`
- Why required: Ensures autocomplete endpoint returns in < 50ms p95.
- Installation/activation required: No
- Instructions that apply to this task:
  - Limit suggestions to 6 items
  - Select minimal columns (id, title, slug, thumbnail)

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `apps/web/src/app/layout.tsx`
- `packages/backend/src/search/query.service.ts`
- `apps/web/src/components/ui/input.tsx`

## Current Behavior

Header search input is static and navigates directly on Enter without live suggestions.

## Required Behavior

Typing 2+ characters displays a live dropdown within 50ms showing top matching products and categories with keyboard navigation.

## Inputs / Outputs / Contracts

GET /v1/search/suggest?q=... -> { suggestions: [{ type: 'product' | 'category', text: string, slug: string, priceCents?: string }] }.

## Implementation Commands

Execute in this order:

1. Implement AutocompleteService in packages/backend/src/search/autocomplete.service.ts querying trigram prefix index.
2. Expose GET /v1/search/suggest in SearchController.
3. Build SearchAutocomplete client island component in apps/web/src/features/search/search-bar.tsx.
4. Add keyboard event handlers (ArrowDown, ArrowUp, Enter, Escape).
5. Write component tests and browser interaction tests.

## Data / Database Changes

None.

## Security Requirements

Enforces rate limiting on suggest route (100 req/min per IP); sanitizes dropdown HTML output.

## Error Handling

Gracefully closes dropdown on network failure without interrupting user typing.

## Edge Cases

- Rapid backspacing to 0 characters (instantly dismisses dropdown and aborts pending fetch)
- Clicking outside the search dropdown (closes menu via click-outside hook)

## Observability

Suggest endpoint response time histogram.

## Tests Required

### Unit
- apps/web/src/features/search/search-bar.test.tsx (debouncing, keyboard navigation, selection)

### Integration
- tests/integration/autocomplete.spec.ts (verify sub-50ms query response on seeded catalog)

### End-to-End
- tests/e2e/search-flow.spec.ts (type in header, navigate suggestions with keyboard, press Enter)

### Security / Regression
- Assert XSS payloads in query string do not render unescaped in suggestion dropdown

Do not mark the task complete until required tests pass.

## Manual Verification

Type 'sho' into search bar; verify dropdown appears instantly with shoe suggestions; navigate with arrow keys.

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
LOW

Review requirements:
Single review pass focusing on accessibility and debounce cancellation. Documented in docs/reviews/t032-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(web): build sub-50ms autocomplete endpoint and search bar component`

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
