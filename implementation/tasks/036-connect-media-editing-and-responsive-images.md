# TASK-036 — Connect Media Editing and Responsive Images

## Status

COMPLETED

## Goal

Build seller media gallery UI, image reordering, and responsive Next.js Image component optimization on storefront PDP.

## Why This Task Exists

Enables vendors to visually manage product galleries and provides shoppers with fast, responsive imagery.

## Requirement References

- CT-1
- CT-7
- design.md

## Dependencies

### Blocked By
- TASK-027
- TASK-035

### Blocks
- TASK-075
- TASK-080

## Architecture References

- ARCHITECTURE.md -> Frontend
- docs/architecture/frontend.md

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: frontend-ui-engineering
- Skill: frontend-ui-engineering
- Location: `skills/agent-skills-main/skills/frontend-ui-engineering/SKILL.md`
- Why required: Governs Next.js Image component usage, layout shifts, and responsive srcsets.
- Installation/activation required: No
- Instructions that apply to this task:
  - Use next/image with explicit width/height to avoid CLS
  - Generate responsive srcsets

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `apps/web/src/features/seller/product-workspace.tsx`
- `apps/web/src/features/catalog/product-detail.tsx`
- `apps/web/src/lib/api.ts`

## Current Behavior

Seller console has no image management tab; PDP displays static placeholder graphics.

## Required Behavior

Sellers upload and reorder images in console; PDP displays interactive image gallery with thumbnails and responsive Next.js Image optimization.

## Inputs / Outputs / Contracts

ProductImageDto: { id: string, assetId: string, url: string, position: number, alt: string }.

## Implementation Commands

Execute in this order:

1. Build MediaUploadDropzone component in apps/web/src/features/seller/media-uploader.tsx.
2. Build ProductGalleryEditor supporting drag-and-drop position sorting.
3. Update PDP in apps/web/src/features/catalog/product-detail.tsx to render next/image gallery.
4. Configure next.config.js remotePatterns allowlisting MinIO / S3 host.
5. Write component tests for image upload and PDP gallery.

## Data / Database Changes

Inserts product_images associating media_assets with products.

## Security Requirements

Enforces store ownership: seller can only attach images belonging to their own store.

## Error Handling

Displays upload progress bar and clear error toast if file is rejected.

## Edge Cases

- Deleting primary image (position 0) automatically promotes next image to primary position

## Observability

Image load error tracking in browser console.

## Tests Required

### Unit
- apps/web/src/features/seller/media-uploader.test.tsx (file drop validation, progress state)
- apps/web/src/features/catalog/gallery.test.tsx (thumbnail switching, active image)

### Integration
- tests/integration/product-images.spec.ts (associate image with product; verify order in public read)

### End-to-End
- tests/e2e/seller-media.spec.ts (upload image in seller console, visit public PDP, assert image renders)

### Security / Regression
- Assert seller cannot associate assetId belonging to another store

Do not mark the task complete until required tests pass.

## Manual Verification

Upload photo in /seller/products; open PDP in new tab; verify high-res image renders with thumbnail carousel.

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
Single review pass focusing on responsive image layouts and Cumulative Layout Shift. Documented in docs/reviews/t036-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(web): build seller media gallery editor and responsive pdp image carousel`

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
