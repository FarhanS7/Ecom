# TASK-035 — Implement Validated Asset Uploads

## Status

COMPLETED

## Goal

Build presigned URL upload generation for MinIO/S3 with server-side magic byte MIME sniffing and quarantine status.

## Why This Task Exists

Enables vendors to upload product images safely without routing large binary streams through the API server.

## Requirement References

- CT-7
- PRD Section 6.2
- docs/architecture/data-model.md

## Dependencies

### Blocked By
- TASK-003
- TASK-014

### Blocks
- TASK-036

## Architecture References

- ARCHITECTURE.md -> Storage
- docs/modules/platform.md

Do not redesign these decisions in this task.

## Required Skills

### Skill 1: security-and-hardening
- Skill: security-and-hardening
- Location: `skills/agent-skills-main/skills/security-and-hardening/SKILL.md`
- Why required: Governs file upload security, magic byte verification, and SVG XSS prevention.
- Installation/activation required: No
- Instructions that apply to this task:
  - Strictly disallow raw SVG uploads in V1
  - Inspect magic bytes before quarantine release

### Skill 2: api-and-interface-design
- Skill: api-and-interface-design
- Location: `skills/agent-skills-main/skills/api-and-interface-design/SKILL.md`
- Why required: Governs presigned upload grant and completion endpoints.
- Installation/activation required: No
- Instructions that apply to this task:
  - Use short-lived upload URLs (15 min)
  - Enforce scoped store_id on asset creation

Before modifying code:
1. Inspect the skill documentation.
2. Install/activate it if required.
3. Strictly follow its implementation and testing rules.

## Files / Components to Inspect First

- `db/migrations/0002-stores.sql`
- `packages/backend/src/platform/security.ts`
- `packages/config/src/env.ts`

## Current Behavior

Not implemented. Products have placeholder image URLs; no media upload endpoints exist.

## Required Behavior

POST /v1/seller/stores/{id}/uploads issues presigned S3 PUT URL; seller uploads file directly to MinIO; POST /.../complete verifies magic bytes, transitions status from 'quarantined' to 'ready'.

## Inputs / Outputs / Contracts

CreateUploadGrantDto: { filename: string, declaredType: string, bytes: number }. UploadGrantResponseDto: { assetId: string, uploadUrl: string, objectKey: string, expiresAt: string }.

## Implementation Commands

Execute in this order:

1. Author migration db/migrations/0009-media-assets.sql creating media_assets and product_images tables.
2. Implement StoragePort in packages/backend/src/platform/storage.service.ts using AWS SDK v3 S3 client configured for MinIO.
3. Implement MagicByteValidator verifying JPEG, PNG, WebP headers; strictly reject SVGs.
4. Expose upload grant and complete endpoints in SellerMediaController.
5. Write integration tests verifying presigned upload lifecycle and malicious file rejection.

## Data / Database Changes

Creates media_assets and product_images tables in migration 0009-media-assets.sql.

## Security Requirements

Enforces 10 MB file size limit; rejects executable binaries, HTML, and SVG files to prevent Stored XSS.

## Error Handling

Returns 422 Unprocessable if file content does not match declared image format.

## Edge Cases

- Seller uploads file with .jpg extension containing HTML/JS payload (magic byte inspection rejects asset into 'rejected' status)
- Presigned URL expires before client finishes upload (client must request new grant)

## Observability

Audit log for asset upload grant and verification outcomes.

## Tests Required

### Unit
- packages/backend/src/platform/magic-bytes.test.ts (verify JPEG, PNG, WebP detection; reject SVG and ELF/PE binaries)

### Integration
- tests/integration/uploads.spec.ts (request grant, upload binary to MinIO, complete asset, verify status is 'ready')

### End-to-End
- None.

### Security / Regression
- Upload SVG file with script tag; assert completion endpoint rejects file with 422

Do not mark the task complete until required tests pass.

## Manual Verification

Request upload grant via curl; upload image via HTTP PUT; complete asset; verify object visible in MinIO console.

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
Single thorough review pass focusing on file header validation and S3 bucket permissions. Recorded in docs/reviews/t035-context.md.

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`feat(media): implement presigned asset uploads and magic byte verification`

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
