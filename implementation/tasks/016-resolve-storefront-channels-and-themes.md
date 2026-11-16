# TASK-016 — Resolve Storefront Channels and Themes

## Status

IMPLEMENTED

## Goal

Build channel resolution service and theme token manager mapping slug to store and serving CSS variables.

## Why This Task Exists

Enables multi-store routing (/stores/{slug}) and dynamic brand styling without code redeployment.

## Requirement References

- REQ-STORE-001
- REQ-STORE-003
- PRD Section 4

## Dependencies

### Blocked By
- TASK-007
- TASK-014

### Blocks
- TASK-017
- TASK-023
- TASK-024

## Architecture References

- ARCHITECTURE.md -> System shape
- DECISIONS.md -> DEC-003

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: frontend-ui-engineering
- Skill: frontend-ui-engineering
- Location: `skills/agent-skills-main/skills/frontend-ui-engineering/SKILL.md`
- Why required: Governs token-based theming and dynamic CSS custom properties.
- Installation/activation required: No
- Instructions that apply to this task:
  - Sanitize theme tokens strictly
  - Disallow arbitrary raw CSS/HTML

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `packages/backend/src/stores/theme.service.ts`
- `db/migrations/0004-themes.sql`
- `apps/web/src/components/theme.ts`

## Current Behavior

Completed. 0004-themes.sql applied; store_themes table stores approved JSONB color tokens; resolved per route.

## Required Behavior

Navigating to /stores/{slug} resolves store context and injects approved theme tokens into root container.

## Inputs / Outputs / Contracts

StoreTheme schema with primary, secondary, background, and accent hex colors.

## Implementation Commands

Execute in this order:

1. Create 0004-themes.sql with store_themes table.
2. Implement ThemeService validating JSONB color tokens against strict schema.
3. Build Next.js theme provider component injecting CSS variables.

## Data / Database Changes

Creates store_themes and store_content tables.

## Security Requirements

Strict schema validation prevents arbitrary CSS or script injection via theme settings.

## Error Handling

Returns default marketplace theme if store theme is missing.

## Edge Cases

- Malformed hex color values in JSONB

## Observability

Theme resolution debug logs.

## Tests Required

### Unit
- packages/backend/src/stores/theme.test.ts
- apps/web/src/components/theme.test.ts

### Integration
- Theme persistence and retrieval integration test

### End-to-End
- tests/e2e/store-theme.spec.ts

### Security / Regression
- Assert XSS payload in theme JSON is stripped or rejected

Do not mark the task complete until required tests pass.

## Manual Verification

Visit /stores/apex-athletics; verify background and primary button colors match store tokens.

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

## Independent Review Requirement

Risk Level:
LOW

Review requirements:
Single review pass. Documented in docs/reviews/t016-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(stores): resolve storefront channels and apply token-based themes`

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
