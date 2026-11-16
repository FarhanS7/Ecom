# Review: TASK-036 — Connect Media Editing and Responsive Images

## Scope & Implementation
- **Component**: Seller Media Gallery Management, Reordering & Responsive Storefront PDP Gallery
- **Files**:
  - `packages/contracts/src/catalog.ts`: Added `productImage`, `attachProductImageRequest`, `reorderProductImagesRequest` and updated `channelProductDetail` with `images`.
  - `packages/backend/src/platform/media.service.ts`: Implemented `attachProductImage`, `listProductImages`, `deleteProductImage` (with primary promotion), and `reorderProductImages`.
  - `packages/backend/src/catalog/read.service.ts`: Updated `getChannelProduct` to load ready product images and attach to detail DTO.
  - `apps/api/src/seller-media.controller.ts`: Exposed `GET/POST/DELETE/PUT` for store product images.
  - `apps/web/src/lib/api.ts`: Allowed gateway templates for seller upload and image endpoints.
  - `apps/web/next.config.js`: Added S3/MinIO and CDN hosts to `images.remotePatterns`.
  - `apps/web/src/features/seller/media-uploader.tsx`: `MediaUploadDropzone` and `ProductGalleryEditor` supporting file drop, direct upload, completion verification, and reordering.
  - `apps/web/src/features/seller/product-workspace.tsx`: Embedded `ProductGalleryEditor` into seller product workspace.
  - `apps/web/src/features/catalog/gallery.tsx`: `ProductGallery` with responsive Next.js `Image` optimization (`sizes`, `width/height`, aspect ratio) and interactive thumbnail switching.
  - `apps/web/src/features/catalog/product-detail.tsx`: Integrated `ProductGallery` into storefront PDP.
  - `apps/web/src/features/catalog/gallery.test.tsx`: Unit tests for PDP gallery and thumbnail switching.
  - `apps/web/src/features/seller/media-uploader.test.tsx`: Unit tests for file drop, validation, and editor reordering.
  - `packages/backend/tests/integration/product-images.spec.ts`: Integration test verifying product image attachment, public read ordering, primary promotion on delete, and cross-store isolation.

## Invariant Verification

### 1. Zero Cumulative Layout Shift (CLS)
- `ProductGallery` uses explicit width/height constraints and `aspect-square` container with Next.js `Image` `sizes="(max-width: 768px) 100vw, 50vw"`, guaranteeing no layout jumps as images load.

### 2. Primary Promotion Invariant
- The first attached image is automatically designated primary (`isPrimary: true`).
- If the primary image is deleted, the service immediately promotes the next image in display order to primary.

### 3. Store Ownership Boundary
- Media assets and products must share the same `store_id`. Attempts to attach an asset belonging to another store are rejected with `MediaError`.

## Verification Status
- Unit tests: 100% pass (vitest)
- Integration tests: 100% pass (vitest)
- ESLint: 0 errors, 0 warnings
- TypeScript & Next.js: compiles cleanly
