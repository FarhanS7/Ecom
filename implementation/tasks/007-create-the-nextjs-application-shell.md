# TASK-007 — Create the Next.js Application Shell

## Status

IMPLEMENTED

## Goal

Build Next.js App Router presentation shell with design tokens, layout, header, footer, and same-origin API proxy.

## Why This Task Exists

Provides foundation for server-rendered storefronts and interactive client islands.

## Requirement References

- PRD Section 3
- design.md

## Dependencies

### Blocked By
- TASK-002

### Blocks
- TASK-008
- TASK-016
- TASK-017
- TASK-023

## Architecture References

- ARCHITECTURE.md -> Frontend
- docs/architecture/frontend.md

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: frontend-ui-engineering
- Skill: frontend-ui-engineering
- Location: `skills/agent-skills-main/skills/frontend-ui-engineering/SKILL.md`
- Why required: Governs Next.js App Router layout and CSS variable design tokens.
- Installation/activation required: No
- Instructions that apply to this task:
  - Keep Server/Client boundaries explicit
  - Avoid unnecessary client-side JS

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `apps/web/src/app/layout.tsx`
- `apps/web/src/app/page.tsx`
- `apps/web/src/app/api/proxy/[...path]/route.ts`

## Current Behavior

Completed. Next.js 14 App Router shell with accessible layout and same-origin /api/proxy handler.

## Required Behavior

Next.js renders shell with CSS custom properties and proxies requests to Fastify backend.

## Inputs / Outputs / Contracts

Design token CSS variables (:root tokens in design.md).

## Implementation Commands

Execute in this order:

1. Bootstrap Next.js App Router in apps/web.
2. Implement root layout with responsive header, main container, and footer.
3. Build same-origin proxy route forwarding session cookies to NestJS API.

## Data / Database Changes

None.

## Security Requirements

Enforces SameSite cookie handling and forwards only allowlisted client headers.

## Error Handling

Renders Next.js error.tsx boundary for unexpected presentation crashes.

## Edge Cases

- Backend API offline during Next.js SSR

## Observability

Next.js SSR request logs.

## Tests Required

### Unit
- apps/web/src/app/layout.test.tsx

### Integration
- apps/web/src/lib/api.test.ts

### End-to-End
- tests/e2e/shell.spec.ts

### Security / Regression
- Verify proxy forwards only safe headers

Do not mark the task complete until required tests pass.

## Manual Verification

Visit http://localhost:3000; verify page loads with clean styling and active header.

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
Single review pass. Documented in docs/reviews/t007-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(web): create nextjs application shell and api proxy`

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
