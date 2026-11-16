// T035 integration verification for Validated Asset Uploads.
// Invariants:
// 1. Upload grant creates quarantined record in media_assets with short-lived presigned URL.
// 2. Successful magic byte validation transitions asset to 'ready' status.
// 3. Dangerous content (e.g. SVG containing scripts) is rejected into 'rejected' status with 422.
// 4. Scoped to store: assets cannot be completed across different store IDs (uniform 404).

import { describe, expect, it, vi } from 'vitest';
import { resetEnvCache } from '@shopscale/config';
import {
  openAdminConnection,
  requireDatabaseUrl,
  findMigrationsDir,
  runMigrations,
} from '../../src/platform/database.js';
import { MediaService, MediaError } from '../../src/platform/media.service.js';
import type { StoragePort } from '../../src/platform/storage.service.js';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = findMigrationsDir(here);

type Sql = Awaited<ReturnType<typeof openAdminConnection>>;

async function connectOrSkip(): Promise<Sql | null> {
  resetEnvCache();
  let url: string;
  try {
    url = requireDatabaseUrl();
  } catch {
    console.warn('SKIP: DATABASE_URL not configured; start infra first (T004).');
    return null;
  }
  const sql = openAdminConnection(url);
  try {
    await sql`SELECT 1`;
    return sql;
  } catch {
    await sql.end();
    console.warn('SKIP: database unreachable; start infra first (T004).');
    return null;
  }
}

async function seedStore(sql: Sql, suffix: string): Promise<string> {
  const users = (await sql.unsafe(
    `INSERT INTO "users" ("email_normalized","password_hash") VALUES ($1,'x') RETURNING "id";`,
    [`t035.${suffix}@example.com`],
  )) as unknown as Array<{ id: string }>;
  const businesses = (await sql.unsafe(
    `INSERT INTO "businesses" ("owner_user_id") VALUES ($1) RETURNING "id";`,
    [users[0]!.id],
  )) as unknown as Array<{ id: string }>;
  const stores = (await sql.unsafe(
    `INSERT INTO "stores" ("business_id","slug","name","status") VALUES ($1,$2,$3,'active') RETURNING "id";`,
    [businesses[0]!.id, `t035-${suffix}`, `T035 ${suffix}`],
  )) as unknown as Array<{ id: string }>;
  return stores[0]!.id;
}

async function cleanup(sql: Sql): Promise<void> {
  await sql.unsafe(`DELETE FROM "product_images" WHERE "product_id" IN (SELECT "id" FROM "products" WHERE "slug" LIKE 't035-%');`);
  await sql.unsafe(`DELETE FROM "media_assets" WHERE "store_id" IN (SELECT "id" FROM "stores" WHERE "slug" LIKE 't035-%');`);
  await sql.unsafe(`DELETE FROM "stores" WHERE "slug" LIKE 't035-%';`);
  await sql.unsafe(
    `DELETE FROM "businesses" WHERE "owner_user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" LIKE 't035.%');`,
  );
  await sql.unsafe(`DELETE FROM "users" WHERE "email_normalized" LIKE 't035.%';`);
}

describe('Validated Asset Uploads (T035)', () => {
  it('completes valid JPEG upload lifecycle from quarantined to ready', async () => {
    const sql = await connectOrSkip();
    if (!sql) return;

    await runMigrations(sql, migrationsDir);
    await cleanup(sql);

    try {
      const storeId = await seedStore(sql, 'valid');

      const mockStorage: StoragePort = {
        getPresignedPutUrl: vi.fn().mockResolvedValue('https://storage.example.com/upload-put-url'),
        getObjectBytes: vi.fn().mockResolvedValue(
          new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]),
        ),
        deleteObject: vi.fn().mockResolvedValue(undefined),
        getPublicUrl: vi.fn().mockReturnValue('https://cdn.example.com/ready-image.jpg'),
      };

      const mediaService = new MediaService(mockStorage, sql);

      // 1. Request upload grant
      const grant = await mediaService.createUploadGrant(storeId, {
        filename: 'camera.jpg',
        declaredType: 'image/jpeg',
        bytes: 45000,
      });

      expect(grant.assetId).toBeDefined();
      expect(grant.uploadUrl).toBe('https://storage.example.com/upload-put-url');
      expect(grant.objectKey).toContain(storeId);

      // Verify DB record is quarantined
      const initialRow = (await sql.unsafe(
        `SELECT "status", "declared_mime_type", "detected_mime_type"
         FROM "media_assets" WHERE "id" = $1;`,
        [grant.assetId],
      )) as unknown as Array<{ status: string; declared_mime_type: string; detected_mime_type: string | null }>;

      expect(initialRow[0]?.status).toBe('quarantined');
      expect(initialRow[0]?.declared_mime_type).toBe('image/jpeg');
      expect(initialRow[0]?.detected_mime_type).toBeNull();

      // 2. Complete upload
      const completion = await mediaService.completeUpload(storeId, grant.assetId);

      expect(completion.status).toBe('ready');
      expect(completion.detectedType).toBe('image/jpeg');
      expect(completion.url).toBe('https://cdn.example.com/ready-image.jpg');

      // Verify DB record is ready
      const finalRow = (await sql.unsafe(
        `SELECT "status", "detected_mime_type" FROM "media_assets" WHERE "id" = $1;`,
        [grant.assetId],
      )) as unknown as Array<{ status: string; detected_mime_type: string | null }>;

      expect(finalRow[0]?.status).toBe('ready');
      expect(finalRow[0]?.detected_mime_type).toBe('image/jpeg');
    } finally {
      await cleanup(sql);
      await sql.end();
    }
  });

  it('rejects malicious SVG file disguised as JPEG into rejected status with 422', async () => {
    const sql = await connectOrSkip();
    if (!sql) return;

    await runMigrations(sql, migrationsDir);
    await cleanup(sql);

    try {
      const storeId = await seedStore(sql, 'malicious');

      const mockStorage: StoragePort = {
        getPresignedPutUrl: vi.fn().mockResolvedValue('https://storage.example.com/upload-put-url'),
        getObjectBytes: vi.fn().mockResolvedValue(
          new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert("xss")</script></svg>'),
        ),
        deleteObject: vi.fn().mockResolvedValue(undefined),
        getPublicUrl: vi.fn().mockReturnValue('https://cdn.example.com/xss.svg'),
      };

      const mediaService = new MediaService(mockStorage, sql);

      // 1. Request grant declaring image/jpeg
      const grant = await mediaService.createUploadGrant(storeId, {
        filename: 'avatar.jpg',
        declaredType: 'image/jpeg',
        bytes: 1024,
      });

      // 2. Complete upload - must throw UNPROCESSABLE error
      await expect(mediaService.completeUpload(storeId, grant.assetId)).rejects.toThrow(MediaError);

      // Verify DB record transitioned to 'rejected'
      const row = (await sql.unsafe(
        `SELECT "status" FROM "media_assets" WHERE "id" = $1;`,
        [grant.assetId],
      )) as unknown as Array<{ status: string }>;

      expect(row[0]?.status).toBe('rejected');
    } finally {
      await cleanup(sql);
      await sql.end();
    }
  });

  it('enforces store boundary: foreign store cannot complete asset', async () => {
    const sql = await connectOrSkip();
    if (!sql) return;

    await runMigrations(sql, migrationsDir);
    await cleanup(sql);

    try {
      const store1 = await seedStore(sql, 'store1');
      const store2 = await seedStore(sql, 'store2');

      const mockStorage: StoragePort = {
        getPresignedPutUrl: vi.fn().mockResolvedValue('https://storage.example.com/upload-put-url'),
        getObjectBytes: vi.fn().mockResolvedValue(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])),
        deleteObject: vi.fn().mockResolvedValue(undefined),
        getPublicUrl: vi.fn().mockReturnValue('https://cdn.example.com/image.jpg'),
      };

      const mediaService = new MediaService(mockStorage, sql);

      const grant = await mediaService.createUploadGrant(store1, {
        filename: 'photo.jpg',
        declaredType: 'image/jpeg',
        bytes: 2048,
      });

      // Attempting to complete with store2 must fail with NOT_FOUND (no Oracle)
      await expect(mediaService.completeUpload(store2, grant.assetId)).rejects.toThrow(
        expect.objectContaining({ failure: 'NOT_FOUND' }),
      );
    } finally {
      await cleanup(sql);
      await sql.end();
    }
  });
});
