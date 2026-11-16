// T036 integration verification for Product Images & Gallery.
// Invariants:
// 1. Ready assets can be attached to products with ordering and primary flag.
// 2. Ordering is preserved in public PDP reads (getChannelProduct).
// 3. Deleting primary image promotes the next image to primary.
// 4. Security: Cross-store asset hijacking is strictly prevented (foreign asset returns error).

import { describe, expect, it } from 'vitest';
import { resetEnvCache } from '@shopscale/config';
import {
  openAdminConnection,
  requireDatabaseUrl,
  findMigrationsDir,
  runMigrations,
} from '../../src/platform/database.js';
import { MediaService, MediaError } from '../../src/platform/media.service.js';
import { getChannelProduct } from '../../src/catalog/read.service.js';
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
    [`t036.${suffix}@example.com`],
  )) as unknown as Array<{ id: string }>;
  const businesses = (await sql.unsafe(
    `INSERT INTO "businesses" ("owner_user_id") VALUES ($1) RETURNING "id";`,
    [users[0]!.id],
  )) as unknown as Array<{ id: string }>;
  const stores = (await sql.unsafe(
    `INSERT INTO "stores" ("business_id","slug","name","status") VALUES ($1,$2,$3,'active') RETURNING "id";`,
    [businesses[0]!.id, `t036-${suffix}`, `T036 ${suffix}`],
  )) as unknown as Array<{ id: string }>;
  return stores[0]!.id;
}

async function cleanup(sql: Sql): Promise<void> {
  await sql.unsafe(
    `DELETE FROM "product_images" WHERE "product_id" IN (SELECT "id" FROM "products" WHERE "slug" LIKE 't036-%');`,
  );
  await sql.unsafe(
    `DELETE FROM "product_publications" WHERE "product_id" IN (SELECT "id" FROM "products" WHERE "slug" LIKE 't036-%');`,
  );
  await sql.unsafe(`DELETE FROM "products" WHERE "slug" LIKE 't036-%';`);
  await sql.unsafe(
    `DELETE FROM "media_assets" WHERE "store_id" IN (SELECT "id" FROM "stores" WHERE "slug" LIKE 't036-%');`,
  );
  await sql.unsafe(`DELETE FROM "stores" WHERE "slug" LIKE 't036-%';`);
  await sql.unsafe(
    `DELETE FROM "businesses" WHERE "owner_user_id" IN (SELECT "id" FROM "users" WHERE "email_normalized" LIKE 't036.%');`,
  );
  await sql.unsafe(`DELETE FROM "users" WHERE "email_normalized" LIKE 't036.%';`);
}

describe('Product Images & Media Gallery (T036)', () => {
  it('manages product images, ordering, and reflects in public PDP reads', async () => {
    const sql = await connectOrSkip();
    if (!sql) return;

    await runMigrations(sql, migrationsDir);
    await cleanup(sql);

    try {
      const storeId = await seedStore(sql, 'gallery');

      // 1. Seed product
      const products = (await sql.unsafe(
        `INSERT INTO "products" ("store_id","slug","title","status","min_price_cents","currency")
         VALUES ($1,'t036-shoes','Pro Running Shoes','active',9900,'USD') RETURNING "id";`,
        [storeId],
      )) as unknown as Array<{ id: string }>;
      const productId = products[0]!.id;

      await sql.unsafe(
        `INSERT INTO "product_publications" ("product_id","marketplace_enabled","store_enabled")
         VALUES ($1,true,true);`,
        [productId],
      );

      // 2. Seed 2 ready media assets
      const assets = (await sql.unsafe(
        `INSERT INTO "media_assets" ("store_id","object_key","filename","declared_mime_type","detected_mime_type","bytes","status")
         VALUES
           ($1,'stores/t036/img1.jpg','img1.jpg','image/jpeg','image/jpeg',1000,'ready'),
           ($1,'stores/t036/img2.jpg','img2.jpg','image/jpeg','image/jpeg',2000,'ready')
         RETURNING "id";`,
        [storeId],
      )) as unknown as Array<{ id: string }>;

      const asset1Id = assets[0]!.id;
      const asset2Id = assets[1]!.id;

      const mediaService = new MediaService(undefined, sql);

      // 3. Attach image 1 (auto-promoted to primary)
      const img1 = await mediaService.attachProductImage(storeId, productId, {
        assetId: asset1Id,
        displayOrder: 0,
      });
      expect(img1.isPrimary).toBe(true);

      // Attach image 2 (secondary)
      const img2 = await mediaService.attachProductImage(storeId, productId, {
        assetId: asset2Id,
        displayOrder: 1,
        isPrimary: false,
      });
      expect(img2.isPrimary).toBe(false);

      // 4. Verify public PDP read includes both images in order
      const detail = await getChannelProduct(
        { channel: 'marketplace', productSlug: 't036-shoes' },
        sql,
        null,
      );
      expect(detail).not.toBeNull();
      expect(detail!.images.length).toBe(2);
      expect(detail!.images[0]!.id).toBe(img1.id);
      expect(detail!.images[0]!.isPrimary).toBe(true);
      expect(detail!.images[1]!.id).toBe(img2.id);
      expect(detail!.images[1]!.isPrimary).toBe(false);

      // 5. Reorder images: swap 2 and 1
      await mediaService.reorderProductImages(storeId, productId, [img2.id, img1.id]);

      const reorderedDetail = await getChannelProduct(
        { channel: 'marketplace', productSlug: 't036-shoes' },
        sql,
        null,
      );
      expect(reorderedDetail!.images[0]!.id).toBe(img2.id);
      expect(reorderedDetail!.images[1]!.id).toBe(img1.id);

      // 6. Delete primary image (img1), assert img2 is promoted to primary
      await mediaService.deleteProductImage(storeId, productId, img1.id);

      const remainingImages = await mediaService.listProductImages(storeId, productId);
      expect(remainingImages.length).toBe(1);
      expect(remainingImages[0]!.id).toBe(img2.id);
      expect(remainingImages[0]!.isPrimary).toBe(true);
    } finally {
      await cleanup(sql);
      await sql.end();
    }
  });

  it('rejects cross-store image attachment (security boundary)', async () => {
    const sql = await connectOrSkip();
    if (!sql) return;

    await runMigrations(sql, migrationsDir);
    await cleanup(sql);

    try {
      const storeA = await seedStore(sql, 'sec-a');
      const storeB = await seedStore(sql, 'sec-b');

      const pA = (await sql.unsafe(
        `INSERT INTO "products" ("store_id","slug","title","status") VALUES ($1,'t036-p-a','Product A','active') RETURNING "id";`,
        [storeA],
      )) as unknown as Array<{ id: string }>;

      // Store B asset
      const aB = (await sql.unsafe(
        `INSERT INTO "media_assets" ("store_id","object_key","filename","declared_mime_type","bytes","status")
         VALUES ($1,'stores/b/secret.jpg','secret.jpg','image/jpeg',5000,'ready') RETURNING "id";`,
        [storeB],
      )) as unknown as Array<{ id: string }>;

      const mediaService = new MediaService(undefined, sql);

      // Store A attempts to attach Store B's asset
      await expect(
        mediaService.attachProductImage(storeA, pA[0]!.id, {
          assetId: aB[0]!.id,
        }),
      ).rejects.toThrow(MediaError);
    } finally {
      await cleanup(sql);
      await sql.end();
    }
  });
});
