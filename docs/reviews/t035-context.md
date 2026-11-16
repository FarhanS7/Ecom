# Review: TASK-035 — Implement Validated Asset Uploads

## Scope & Implementation
- **Component**: Presigned S3/MinIO Asset Uploads, Server-Side Magic Byte Sniffing & Seller Media Endpoints
- **Files**:
  - `db/migrations/0009-media-assets.sql`: Created `media_assets` and `product_images` tables with store scope, status check constraint (`quarantined`, `ready`, `rejected`), and indexes.
  - `packages/backend/src/platform/magic-bytes.ts`: Binary header sniffing for JPEG, PNG, WebP; strict detection and rejection of SVG, HTML, scripts, and ELF/PE binaries; 10 MB maximum file size limit.
  - `packages/backend/src/platform/storage.service.ts`: `S3StorageService` utilizing AWS SDK v3 with `forcePathStyle: true` for MinIO compatibility, presigned PUT URL generation (15 min), and streaming byte slice reader.
  - `packages/backend/src/platform/media.service.ts`: `MediaService` managing upload grant creation, quarantine tracking, and completion verification.
  - `packages/contracts/src/media.ts`: Zod schemas for upload requests, grants, and completions.
  - `apps/api/src/seller-media.controller.ts`: NestJS controller exposing `POST /seller/stores/:storeId/uploads` and `POST /seller/stores/:storeId/uploads/:assetId/complete` guarded by `SessionGuard` and `authorizeStore(..., 'catalog:manage')`.
  - `packages/backend/src/platform/magic-bytes.test.ts`: Unit tests validating JPEG, PNG, WebP detection and rejection of SVGs, HTML, and binaries.
  - `packages/backend/tests/integration/uploads.spec.ts`: Integration test verifying full upload lifecycle, quarantine-to-ready transition, malicious file rejection (422), and cross-store isolation.

## Invariant Verification

### 1. Direct Presigned Uploads
- Binary streams are never proxied through the API server; clients receive a 15-minute presigned PUT URL directly to S3/MinIO.

### 2. Magic Byte Sniffing & SVG Prevention
- Client-declared MIME types and file extensions are never trusted.
- The completion endpoint inspects the initial byte headers of the uploaded object directly from storage.
- SVGs, HTML markup, scripts, and executables are strictly rejected with 422 Unprocessable and transitioned into `rejected` state.

### 3. Store-Scoped Isolation
- Upload grants and completions require active membership with `catalog:manage` permission on the store.
- Cross-store asset completion attempts return 404 (no existence oracle).

## Verification Status
- Unit tests: 100% pass (vitest)
- Integration tests: 100% pass (vitest)
- ESLint: 0 errors, 0 warnings
- TypeScript & Next.js: compiles cleanly
