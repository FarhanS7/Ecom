// @shopscale/backend/tests/integration/wishlist.spec.ts - Integration test for customer wishlist (REQ-ENG-001 / T065).

import { describe, expect, it } from 'vitest';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resetEnvCache } from '@shopscale/config';
import {
  findMigrationsDir,
  openAdminConnection,
  requireDatabaseUrl,
  runMigrations,
} from '../../src/platform/database.js';
import { WishlistService } from '../../src/engagement/wishlist.service.js';
import { ProductNotFoundError } from '../../src/engagement/errors.js';

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

describe('Customer Wishlist Integration (T065 / REQ-ENG-001)', () => {
  it('enforces customer scoping, idempotent adds, availability status, and removal', async () => {
    const sql = await connectOrSkip();
    if (!sql) return;

    await runMigrations({ sql, migrationsDir });

    const prefix = `t065_${Date.now()}`;

    // 1. Seed two distinct users
    const [user1] = (await sql`
      INSERT INTO users (email, email_normalized, password_hash, name, status)
      VALUES (${`${prefix}.user1@example.com`}, ${`${prefix}.user1@example.com`}, 'hash', 'User One', 'active')
      RETURNING id;
    `) as unknown as Array<{ id: string }>;

    const [user2] = (await sql`
      INSERT INTO users (email, email_normalized, password_hash, name, status)
      VALUES (${`${prefix}.user2@example.com`}, ${`${prefix}.user2@example.com`}, 'hash', 'User Two', 'active')
      RETURNING id;
    `) as unknown as Array<{ id: string }>;

    // 2. Seed store and products (one active, one archived)
    const [store] = (await sql`
      INSERT INTO stores (slug, name, status, currency)
      VALUES (${`${prefix}-store`}, 'Gadgets Co', 'active', 'USD')
      RETURNING id;
    `) as unknown as Array<{ id: string }>;

    const [activeProd] = (await sql`
      INSERT INTO products (store_id, slug, title, description, price_cents, currency, status)
      VALUES (${store!.id}, ${`${prefix}-active-gadget`}, 'Active Gadget', 'Live product', 4999, 'USD', 'active')
      RETURNING id;
    `) as unknown as Array<{ id: string }>;

    const [archivedProd] = (await sql`
      INSERT INTO products (store_id, slug, title, description, price_cents, currency, status)
      VALUES (${store!.id}, ${`${prefix}-archived-gadget`}, 'Archived Gadget', 'Legacy product', 2999, 'USD', 'archived')
      RETURNING id;
    `) as unknown as Array<{ id: string }>;

    const wishlistService = new WishlistService(sql);

    // 3. User 1 adds active product to wishlist
    const addResult1 = await wishlistService.addToWishlist(user1!.id, activeProd!.id);
    expect(addResult1).toEqual({ ok: true, added: true });

    // 4. Duplicate add is idempotent
    const addResultDuplicate = await wishlistService.addToWishlist(user1!.id, activeProd!.id);
    expect(addResultDuplicate).toEqual({ ok: true, added: false });

    // 5. User 1 adds archived product
    const addResult2 = await wishlistService.addToWishlist(user1!.id, archivedProd!.id);
    expect(addResult2).toEqual({ ok: true, added: true });

    // 6. Non-existent product throws ProductNotFoundError (404)
    await expect(
      wishlistService.addToWishlist(user1!.id, '00000000-0000-0000-0000-000000000000'),
    ).rejects.toThrow(ProductNotFoundError);

    // 7. Verify User 1 wishlist items and availability
    const user1List = await wishlistService.getWishlist(user1!.id);
    expect(user1List.count).toBe(2);

    const activeItem = user1List.items.find((i) => i.productId === activeProd!.id);
    expect(activeItem).toBeDefined();
    expect(activeItem!.available).toBe(true);
    expect(activeItem!.status).toBe('active');

    const archivedItem = user1List.items.find((i) => i.productId === archivedProd!.id);
    expect(archivedItem).toBeDefined();
    expect(archivedItem!.available).toBe(false);
    expect(archivedItem!.status).toBe('unavailable');

    // 8. User 2 wishlist is completely isolated (0 items)
    const user2List = await wishlistService.getWishlist(user2!.id);
    expect(user2List.count).toBe(0);
    expect(user2List.items).toHaveLength(0);

    // 9. User 1 removes active product
    const removeResult = await wishlistService.removeFromWishlist(user1!.id, activeProd!.id);
    expect(removeResult).toEqual({ ok: true, removed: true });

    const afterRemoveList = await wishlistService.getWishlist(user1!.id);
    expect(afterRemoveList.count).toBe(1);
    expect(afterRemoveList.items[0]?.productId).toBe(archivedProd!.id);

    // Clean up
    await sql`DELETE FROM wishlists WHERE user_id IN (${user1!.id}, ${user2!.id});`;
    await sql`DELETE FROM products WHERE id IN (${activeProd!.id}, ${archivedProd!.id});`;
    await sql`DELETE FROM stores WHERE id = ${store!.id};`;
    await sql`DELETE FROM users WHERE id IN (${user1!.id}, ${user2!.id});`;
    await sql.end();
  });
});
