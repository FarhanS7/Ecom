# TASK-080 — Measure Frontend Performance

## Status

COMPLETED

## Goal

Execute automated Lighthouse and Core Web Vitals audits across Next.js storefront pages, verifying LCP < 2.5s, CLS < 0.1, and FID/INP < 100ms.

## Why This Task Exists

Guarantees fast client-side performance, minimal layout shift, and optimal search engine optimization.

## Requirement References

- PRD Section 3
- design.md

## Dependencies

### Blocked By
- TASK-036
- TASK-075

### Blocks
- TASK-084

## Architecture References

- ARCHITECTURE.md -> Frontend
- docs/architecture/frontend.md

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: performance-optimization
- Skill: performance-optimization
- Location: `skills/agent-skills-main/skills/performance-optimization/SKILL.md`
- Why required: Governs Core Web Vitals optimization, image compression, and script bundle splitting.
- Installation/activation required: No
- Instructions that apply to this task:
  - Target Lighthouse Performance score >= 90
  - Ensure Largest Contentful Paint < 2.5s

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `apps/web/src/app/page.tsx`
- `apps/web/src/features/catalog/product-detail.tsx`
- `apps/web/next.config.js`

## Current Behavior

Frontend uses Next.js App Router and token components, but formal Core Web Vitals scores have not been benchmarked.

## Required Behavior

Automated Lighthouse audits on Marketplace Home, Category PLP, and Product PDP achieve Performance >= 90, LCP < 2.5s, CLS < 0.1, and zero render-blocking script warnings.

## Inputs / Outputs / Contracts

Lighthouse CI config in lighthouserc.json.

## Implementation Commands

Execute in this order:

1. Install @lhci/cli in apps/web.
2. Author lighthouserc.json defining URL targets: /, /products, /products/[slug].
3. Configure assertions: categories:performance >= 0.90, first-contentful-paint <= 1500, largest-contentful-paint <= 2500, cumulative-layout-shift <= 0.1.
4. Run lhci autorun against production build (pnpm build && pnpm start).
5. Save Lighthouse HTML reports into docs/benchmarks/lighthouse/.
6. Document performance metrics in docs/reviews/t080-context.md.

## Data / Database Changes

None.

## Security Requirements

Enforces no insecure third-party scripts or trackers.

## Error Handling

Lighthouse CI fails if any Core Web Vital threshold is violated.

## Edge Cases

- Heavy image loading on PDP (next/image priority flag on primary hero image prevents LCP delay)

## Observability

Core Web Vitals reported in Lighthouse summary.

## Tests Required

### Unit
- None.

### Integration
- None.

### End-to-End
- None.

### Security / Regression
- None.

Do not mark the task complete until required tests pass.

## Manual Verification

Run 'pnpm lighthouserc'; inspect generated HTML report; verify all 3 target pages score >= 90.

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
Single review pass focusing on LCP image optimization and bundle size. Documented in docs/reviews/t080-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`test(web): benchmark frontend core web vitals and lighthouse performance`

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
