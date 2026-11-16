// @shopscale/backend/platform/media.service - Store media asset upload management (T035).
// Invariants:
// 1. Scoped to store: assets are owned by store_id and verified against store boundary.
// 2. Starts in 'quarantined' state; only promoted to 'ready' after server-side magic byte inspection.
// 3. Rejects invalid or dangerous files into 'rejected' state with 422 Unprocessable.
// 4. Uniform 404 for unknown store or foreign asset ID (no oracle).

import { randomUUID } from 'node:crypto';
import type { Sql } from 'postgres';
import { getDb } from '../db/client.js';
import { StoragePort, storageService } from './storage.service.js';
import {
  isAllowedMimeType,
  validateImageBuffer,
  MAX_FILE_SIZE_BYTES,
} from './magic-bytes.js';
import type {
  CreateUploadGrantRequest,
  UploadGrantResponse,
  CompleteUploadResponse,
  ProductImageDto,
} from '@shopscale/contracts';

export type MediaFailure = 'NOT_FOUND' | 'UNPROCESSABLE' | 'FORBIDDEN';

export class MediaError extends Error {
  constructor(
    public readonly failure: MediaFailure,
    message: string,
  ) {
    super(message);
    this.name = 'MediaError';
  }
}

interface MediaAssetRow {
  id: string;
  store_id: string;
  object_key: string;
  filename: string;
  declared_mime_type: string;
  detected_mime_type: string | null;
  bytes: string | number;
  status: 'quarantined' | 'ready' | 'rejected';
  created_at: Date;
  updated_at: Date;
}

export class MediaService {
  constructor(
    private readonly storage: StoragePort = storageService,
    private readonly sqlClient?: Sql,
  ) {}

  private get sql(): Sql {
    return this.sqlClient ?? getDb();
  }

  async createUploadGrant(
    storeId: string,
    input: CreateUploadGrantRequest,
  ): Promise<UploadGrantResponse> {
    if (!isAllowedMimeType(input.declaredType)) {
      throw new MediaError(
        'UNPROCESSABLE',
        `Unsupported MIME type. Allowed types: image/jpeg, image/png, image/webp`,
      );
    }

    if (input.bytes > MAX_FILE_SIZE_BYTES) {
      throw new MediaError(
        'UNPROCESSABLE',
        `File size exceeds maximum allowed size of 10 MB`,
      );
    }

    const assetId = randomUUID();
    const sanitizedFilename = input.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const objectKey = `stores/${storeId}/${assetId}/${sanitizedFilename}`;
    const expiresSeconds = 900; // 15 minutes
    const expiresAt = new Date(Date.now() + expiresSeconds * 1000).toISOString();

    await this.sql.unsafe(
      `INSERT INTO "media_assets" (
         "id", "store_id", "object_key", "filename", "declared_mime_type", "bytes", "status"
       ) VALUES ($1, $2, $3, $4, $5, $6, 'quarantined');`,
      [assetId, storeId, objectKey, sanitizedFilename, input.declaredType, input.bytes],
    );

    const uploadUrl = await this.storage.getPresignedPutUrl(
      objectKey,
      input.declaredType,
      expiresSeconds,
    );

    return {
      assetId,
      uploadUrl,
      objectKey,
      expiresAt,
    };
  }

  async completeUpload(
    storeId: string,
    assetId: string,
  ): Promise<CompleteUploadResponse> {
    const rows = (await this.sql.unsafe(
      `SELECT "id", "store_id", "object_key", "filename", "declared_mime_type",
              "detected_mime_type", "bytes", "status", "created_at", "updated_at"
       FROM "media_assets"
       WHERE "id" = $1 AND "store_id" = $2;`,
      [assetId, storeId],
    )) as unknown as MediaAssetRow[];

    const asset = rows[0];
    if (!asset) {
      throw new MediaError('NOT_FOUND', 'Asset not found');
    }

    if (asset.status === 'ready') {
      return {
        assetId: asset.id,
        status: 'ready',
        detectedType: asset.detected_mime_type,
        url: this.storage.getPublicUrl(asset.object_key),
      };
    }

    if (asset.status === 'rejected') {
      throw new MediaError('UNPROCESSABLE', 'Asset was rejected during validation');
    }

    // Read initial bytes from S3/MinIO for magic byte verification
    let headerBytes: Uint8Array;
    try {
      headerBytes = await this.storage.getObjectBytes(asset.object_key, 1024);
    } catch {
      throw new MediaError(
        'UNPROCESSABLE',
        'Could not retrieve uploaded object from storage. Verify upload completed.',
      );
    }

    const validation = validateImageBuffer(headerBytes, asset.declared_mime_type);

    if (!validation.valid) {
      await this.sql.unsafe(
        `UPDATE "media_assets"
         SET "status" = 'rejected', "updated_at" = now()
         WHERE "id" = $1;`,
        [asset.id],
      );
      throw new MediaError('UNPROCESSABLE', validation.reason);
    }

    await this.sql.unsafe(
      `UPDATE "media_assets"
       SET "status" = 'ready', "detected_mime_type" = $1, "updated_at" = now()
       WHERE "id" = $2;`,
      [validation.detectedType, asset.id],
    );

    return {
      assetId: asset.id,
      status: 'ready',
      detectedType: validation.detectedType,
      url: this.storage.getPublicUrl(asset.object_key),
    };
  }

  async attachProductImage(
    storeId: string,
    productId: string,
    input: { assetId: string; isPrimary?: boolean; displayOrder?: number },
  ): Promise<ProductImageDto> {
    const products = (await this.sql.unsafe(
      `SELECT "id", "title" FROM "products" WHERE "id" = $1 AND "store_id" = $2;`,
      [productId, storeId],
    )) as unknown as Array<{ id: string; title: string }>;
    const product = products[0];
    if (!product) {
      throw new MediaError('NOT_FOUND', 'Product not found');
    }

    const assets = (await this.sql.unsafe(
      `SELECT "id", "object_key", "status" FROM "media_assets" WHERE "id" = $1 AND "store_id" = $2;`,
      [input.assetId, storeId],
    )) as unknown as Array<{ id: string; object_key: string; status: string }>;
    const asset = assets[0];
    if (!asset || asset.status !== 'ready') {
      throw new MediaError('UNPROCESSABLE', 'Asset must be ready before attaching to product');
    }

    const existing = (await this.sql.unsafe(
      `SELECT count(*)::int AS count FROM "product_images" WHERE "product_id" = $1;`,
      [productId],
    )) as unknown as Array<{ count: number }>;
    const count = Number(existing[0]?.count ?? 0);
    const shouldBePrimary = Boolean(input.isPrimary) || count === 0;

    if (shouldBePrimary && count > 0) {
      await this.sql.unsafe(
        `UPDATE "product_images" SET "is_primary" = false WHERE "product_id" = $1;`,
        [productId],
      );
    }

    const displayOrder = input.displayOrder ?? count;

    const inserted = (await this.sql.unsafe(
      `INSERT INTO "product_images" ("product_id", "asset_id", "display_order", "is_primary")
       VALUES ($1, $2, $3, $4)
       ON CONFLICT ("product_id", "asset_id") DO UPDATE SET
         "display_order" = EXCLUDED."display_order",
         "is_primary" = EXCLUDED."is_primary"
       RETURNING "id", "asset_id", "display_order", "is_primary";`,
      [productId, input.assetId, displayOrder, shouldBePrimary],
    )) as unknown as Array<{ id: string; asset_id: string; display_order: number; is_primary: boolean }>;

    const row = inserted[0]!;

    return {
      id: row.id,
      assetId: row.asset_id,
      url: this.storage.getPublicUrl(asset.object_key),
      displayOrder: row.display_order,
      isPrimary: row.is_primary,
      alt: product.title,
    };
  }

  async listProductImages(storeId: string, productId: string): Promise<ProductImageDto[]> {
    const products = (await this.sql.unsafe(
      `SELECT "id", "title" FROM "products" WHERE "id" = $1 AND "store_id" = $2;`,
      [productId, storeId],
    )) as unknown as Array<{ id: string; title: string }>;
    const product = products[0];
    if (!product) {
      throw new MediaError('NOT_FOUND', 'Product not found');
    }

    const rows = (await this.sql.unsafe(
      `SELECT pi."id", pi."asset_id", pi."display_order", pi."is_primary", ma."object_key"
       FROM "product_images" pi
       JOIN "media_assets" ma ON ma."id" = pi."asset_id"
       WHERE pi."product_id" = $1 AND ma."status" = 'ready'
       ORDER BY pi."display_order" ASC, pi."created_at" ASC;`,
      [productId],
    )) as unknown as Array<{ id: string; asset_id: string; display_order: number; is_primary: boolean; object_key: string }>;

    return rows.map((r) => ({
      id: r.id,
      assetId: r.asset_id,
      url: this.storage.getPublicUrl(r.object_key),
      displayOrder: r.display_order,
      isPrimary: r.is_primary,
      alt: product.title,
    }));
  }

  async deleteProductImage(storeId: string, productId: string, imageId: string): Promise<void> {
    const products = (await this.sql.unsafe(
      `SELECT "id" FROM "products" WHERE "id" = $1 AND "store_id" = $2;`,
      [productId, storeId],
    )) as unknown as Array<{ id: string }>;
    if (!products[0]) {
      throw new MediaError('NOT_FOUND', 'Product not found');
    }

    const deleted = (await this.sql.unsafe(
      `DELETE FROM "product_images" WHERE "id" = $1 AND "product_id" = $2
       RETURNING "is_primary";`,
      [imageId, productId],
    )) as unknown as Array<{ is_primary: boolean }>;

    if (!deleted[0]) {
      throw new MediaError('NOT_FOUND', 'Image not found');
    }

    if (deleted[0].is_primary) {
      await this.sql.unsafe(
        `UPDATE "product_images"
         SET "is_primary" = true
         WHERE "id" = (
           SELECT "id" FROM "product_images"
           WHERE "product_id" = $1
           ORDER BY "display_order" ASC, "created_at" ASC
           LIMIT 1
         );`,
        [productId],
      );
    }
  }

  async reorderProductImages(
    storeId: string,
    productId: string,
    imageIds: string[],
  ): Promise<ProductImageDto[]> {
    const products = (await this.sql.unsafe(
      `SELECT "id" FROM "products" WHERE "id" = $1 AND "store_id" = $2;`,
      [productId, storeId],
    )) as unknown as Array<{ id: string }>;
    if (!products[0]) {
      throw new MediaError('NOT_FOUND', 'Product not found');
    }

    await this.sql.begin(async (tx) => {
      for (let i = 0; i < imageIds.length; i++) {
        const imageId = imageIds[i];
        if (!imageId) continue;
        await tx.unsafe(
          `UPDATE "product_images"
           SET "display_order" = $1
           WHERE "id" = $2 AND "product_id" = $3;`,
          [i, imageId, productId],
        );
      }
    });

    return this.listProductImages(storeId, productId);
  }
}

export const mediaService = new MediaService();
