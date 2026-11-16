# TASK-023 — Build the Token-Based Component Foundation

## Status

IMPLEMENTED

## Goal

Build accessible UI primitive components (Button, Input, Badge, Card, Modal, Dropdown) styled with CSS tokens.

## Why This Task Exists

Provides reusable, accessible design token components for storefront and console pages.

## Requirement References

- design.md
- PRD Section 3

## Dependencies

### Blocked By
- TASK-007
- TASK-016

### Blocks
- TASK-024
- TASK-025
- TASK-026
- TASK-027

## Architecture References

- ARCHITECTURE.md -> Frontend
- docs/architecture/frontend.md

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: design-system-compliance
- Skill: design-system-compliance
- Location: `skills/reticle-main/skills/design-system-compliance/SKILL.md`
- Why required: Ensures components strictly adhere to design.md tokens and WCAG 2.1 AA.
- Installation/activation required: No
- Instructions that apply to this task:
  - Use CSS variables for colors and spacing
  - Ensure visible keyboard focus states

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `apps/web/src/components/ui/button.tsx`
- `apps/web/src/components/ui/input.tsx`
- `apps/web/src/components/ui.test.tsx`

## Current Behavior

Completed. Accessible component primitives fully tested with 16 unit tests passing.

## Required Behavior

Components support disabled states, loading spinners, ARIA attributes, and token colors.

## Inputs / Outputs / Contracts

UI Component Props interfaces in apps/web/src/components/ui/.

## Implementation Commands

Execute in this order:

1. Build Button, Input, Select, Badge, Card, and Modal components.
2. Apply CSS module styles consuming design tokens.
3. Add keyboard navigation and ARIA accessibility roles.

## Data / Database Changes

None.

## Security Requirements

Sanitizes input attributes; prevents DOM XSS.

## Error Handling

Gracefully handles missing optional props.

## Edge Cases

- Button double-click handling in loading state

## Observability

None.

## Tests Required

### Unit
- apps/web/src/components/ui.test.tsx

### Integration
- Component rendering tests in jsdom

### End-to-End
- tests/e2e/design-system.spec.ts

### Security / Regression
- Assert XSS payload in input label is safely escaped

Do not mark the task complete until required tests pass.

## Manual Verification

Inspect components in browser; verify clean focus rings on keyboard tab navigation.

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
Single review pass. Documented in docs/reviews/t023-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(web): build token-based accessible ui component library`

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
