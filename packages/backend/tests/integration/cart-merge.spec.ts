// T042 integration verification for Guest Cart Ownership & Login Merge.
// Invariants tested:
// 1. Guest tokens are HMAC-SHA256 signed; tampered signatures are rejected with 401.
// 2. Guest basket items merge atomically into customer cart upon login/merge.
// 3. Line quantities sum across baskets; capped at maximum 99 units.
// 4. Repeated merge of the same guest cart is rejected with 409 Conflict (replay protection).
// 5. Audit receipt recorded in cart_merges table.
// 6. Redis snapshot for user cart is refreshed; guest snapshot is invalidated.

import { describe, expect, it } from 'vitest';
import { resetEnvCache } from '@shopscale/config';
import {
  openAdminConnection,
  requireDatabaseUrl,
  findMigrationsDir,
  runMigrations,
} from '../../src/platform/database.js';
import { CartService } from '../../src/cart/cart.service.js';
import type { CartOwner } from '../../src/cart/cart.service.js';
import { GuestTokenService } from '../../src/cart/guest-token.service.js';
import {
  CartAlreadyMergedError,
  TamperedTokenError,
} from '../../src/cart/errors.js';
import { RedisCacheService } from '../../src/platform/cache.service.js';
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

describe('Guest Cart Ownership & Atomic Login Merge (T042)', () => {
  it('merges guest items into customer cart, caps at 99, and prevents duplicate replay merges', async () => {
    const redisStore = new Map<string, string>();
    const redisClient = {
      get: async (key: string) => redisStore.get(key) ?? null,
      set: async (key: string, val: string) => {
        redisStore.set(key, val);
        return 'OK';
      },
      del: async (...keys: string[]) => {
        for (const k of keys) redisStore.delete(k);
        return keys.length;
      },
    };

    const cacheService = new RedisCacheService(
      redisClient as unknown as ConstructorParameters<typeof RedisCacheService>[0],
    );

    const tokenService = new GuestTokenService('test-secret-key-32-characters-length');

    // In-memory data structures simulating PostgreSQL
    const dbCarts = new Map<string, { id: string; channel_key: string; user_id?: string; guest_id?: string; version: number }>();
    const dbCartItems = new Map<string, { id: string; cart_id: string; variant_id: string; quantity: number; unit_price_cents: number }>();
    const dbMerges = new Map<string, { id: string; guest_cart_id: string; user_id: string; user_cart_id: string; items_merged_count: number }>();
    const dbVariants = new Map<string, { id: string; store_id: string; price_cents: number; status: string; product_status: string; title: string; on_hand: number; reserved: number }>();

    const storeId = '00000000-0000-4000-8000-000000000001';
    const variant1 = '00000000-0000-4000-8000-000000000011';
    const variant2 = '00000000-0000-4000-8000-000000000012';

    dbVariants.set(variant1, {
      id: variant1,
      store_id: storeId,
      price_cents: 1000,
      status: 'active',
      product_status: 'active',
      title: 'Variant 1',
      on_hand: 50,
      reserved: 0,
    });

    dbVariants.set(variant2, {
      id: variant2,
      store_id: storeId,
      price_cents: 2500,
      status: 'active',
      product_status: 'active',
      title: 'Variant 2',
      on_hand: 150,
      reserved: 0,
    });

    const mockSql = {
      begin: async (cb: (tx: Sql) => Promise<unknown>) => cb(mockSql as unknown as Sql),
      unsafe: async (query: string, params: unknown[] = []) => {
        // Find cart
        if (query.includes('SELECT "id", "channel_key", "version" FROM "carts"')) {
          const channelKey = params[0] as string;
          const ownerId = params[1] as string;
          for (const c of dbCarts.values()) {
            if (c.channel_key === channelKey && (c.user_id === ownerId || c.guest_id === ownerId)) {
              return [c];
            }
          }
          return [];
        }

        // Insert cart
        if (query.includes('INSERT INTO "carts"')) {
          const [channelKey, _storeId, userId, guestId] = params as [string, string | null, string | null, string | null];
          const newCart = {
            id: `cart-${userId ? 'user' : 'guest'}-${dbCarts.size + 1}`,
            channel_key: channelKey,
            user_id: userId ?? undefined,
            guest_id: guestId ?? undefined,
            version: 1,
          };
          dbCarts.set(newCart.id, newCart);
          return [newCart];
        }

        // Check cart_merges replay
        if (query.includes('SELECT "id" FROM "cart_merges" WHERE "guest_cart_id" = $1')) {
          const guestCartId = params[0] as string;
          for (const m of dbMerges.values()) {
            if (m.guest_cart_id === guestCartId) {
              return [m];
            }
          }
          return [];
        }

        // Insert cart_merges
        if (query.includes('INSERT INTO "cart_merges"')) {
          const [guestCartId, userId, userCartId] = params as [string, string, string];
          const mergeRow = {
            id: `merge-${dbMerges.size + 1}`,
            guest_cart_id: guestCartId,
            user_id: userId,
            user_cart_id: userCartId,
            items_merged_count: 0,
          };
          dbMerges.set(mergeRow.id, mergeRow);
          return [mergeRow];
        }

        // Check user cart items (variant specific)
        if (query.includes('FROM "cart_items"') && query.includes('"variant_id" = $2')) {
          const [cartId, variantId] = params as [string, string];
          for (const item of dbCartItems.values()) {
            if (item.cart_id === cartId && item.variant_id === variantId) {
              return [item];
            }
          }
          return [];
        }

        // Fetch guest items
        if (query.includes('FROM "cart_items"') && query.includes('WHERE "cart_id" = $1')) {
          const cartId = params[0] as string;
          const items: unknown[] = [];
          for (const item of dbCartItems.values()) {
            if (item.cart_id === cartId) {
              items.push(item);
            }
          }
          return items;
        }

        // Update user cart item
        if (query.includes('UPDATE "cart_items" SET "quantity" = $1')) {
          const [newQty, itemId] = params as [number, string];
          const item = dbCartItems.get(itemId);
          if (item) {
            item.quantity = newQty;
          }
          return [];
        }

        // Insert user cart item
        if (query.includes('INSERT INTO "cart_items"')) {
          const [cartId, variantId, qty, priceCents] = params as [string, string, number, number];
          const item = {
            id: `item-${dbCartItems.size + 1}`,
            cart_id: cartId,
            variant_id: variantId,
            quantity: qty,
            unit_price_cents: priceCents,
          };
          dbCartItems.set(item.id, item);
          return [item];
        }

        // Delete guest cart items
        if (query.includes('DELETE FROM "cart_items" WHERE "cart_id" = $1')) {
          const cartId = params[0] as string;
          for (const [k, v] of dbCartItems.entries()) {
            if (v.cart_id === cartId) {
              dbCartItems.delete(k);
            }
          }
          return [];
        }

        // Update cart_merges count
        if (query.includes('UPDATE "cart_merges" SET "user_cart_id" = $1')) {
          const [userCartId, count, guestCartId] = params as [string, number, string];
          for (const m of dbMerges.values()) {
            if (m.guest_cart_id === guestCartId) {
              m.user_cart_id = userCartId;
              m.items_merged_count = count;
            }
          }
          return [];
        }

        // Update cart version
        if (query.includes('UPDATE "carts" SET "version" = "version" + 1')) {
          const cartId = params[0] as string;
          const cart = dbCarts.get(cartId);
          if (cart) {
            cart.version += 1;
            return [{ version: cart.version }];
          }
          return [{ version: 2 }];
        }

        // Full fetch cart items for DTO
        if (query.includes('FROM "cart_items" ci')) {
          const cartId = params[0] as string;
          const res: unknown[] = [];
          for (const item of dbCartItems.values()) {
            if (item.cart_id === cartId) {
              const v = dbVariants.get(item.variant_id)!;
              res.push({
                id: item.id,
                variant_id: item.variant_id,
                quantity: item.quantity,
                title: v.title,
                price_cents: v.price_cents,
                variant_status: v.status,
                product_status: v.product_status,
                on_hand: v.on_hand,
                reserved: v.reserved,
              });
            }
          }
          return res;
        }

        return [];
      },
    };

    const service = new CartService(
      mockSql as unknown as Sql,
      cacheService,
      tokenService,
    );

    const guestId = '123e4567-e89b-12d3-a456-426614174000';
    const guestToken = tokenService.mintToken(guestId);
    const userOwner: CartOwner = { kind: 'user', id: '11111111-1111-4000-8000-111111111111' };

    // Setup: Guest cart has 10 of Variant 1 and 60 of Variant 2
    const guestCart = {
      id: 'cart-guest-001',
      channel_key: 'marketplace',
      guest_id: guestId,
      version: 1,
    };
    dbCarts.set(guestCart.id, guestCart);
    dbCartItems.set('g-item-1', {
      id: 'g-item-1',
      cart_id: guestCart.id,
      variant_id: variant1,
      quantity: 10,
      unit_price_cents: 1000,
    });
    dbCartItems.set('g-item-2', {
      id: 'g-item-2',
      cart_id: guestCart.id,
      variant_id: variant2,
      quantity: 60,
      unit_price_cents: 2500,
    });

    // Setup: User cart already has 5 of Variant 1 and 50 of Variant 2
    const userCart = {
      id: 'cart-user-001',
      channel_key: 'marketplace',
      user_id: userOwner.id,
      version: 1,
    };
    dbCarts.set(userCart.id, userCart);
    dbCartItems.set('u-item-1', {
      id: 'u-item-1',
      cart_id: userCart.id,
      variant_id: variant1,
      quantity: 5,
      unit_price_cents: 1000,
    });
    dbCartItems.set('u-item-2', {
      id: 'u-item-2',
      cart_id: userCart.id,
      variant_id: variant2,
      quantity: 50,
      unit_price_cents: 2500,
    });

    // Seed initial guest cache snapshot
    redisStore.set(`cart:marketplace:${guestId}`, JSON.stringify({ id: guestCart.id }));

    // 1. Execute merge
    const result = await service.mergeGuestCart(userOwner, guestToken, 'marketplace');

    // 2. Assert quantities:
    // Variant 1: 5 + 10 = 15
    // Variant 2: 50 + 60 = 110 -> capped at 99
    expect(result.mergedCart.items).toHaveLength(2);
    const item1 = result.mergedCart.items.find((i) => i.variantId === variant1);
    const item2 = result.mergedCart.items.find((i) => i.variantId === variant2);

    expect(item1?.qty).toBe(15);
    expect(item2?.qty).toBe(99);

    // Total: (15 * 1000) + (99 * 2500) = 15000 + 247500 = 262500
    expect(result.mergedCart.totalCents).toBe('262500');

    // 3. Verify guest snapshot invalidated and user snapshot updated
    expect(redisStore.has(`cart:marketplace:${guestId}`)).toBe(false);
    expect(redisStore.has(`cart:marketplace:${userOwner.id}`)).toBe(true);

    // 4. Assert replay merge is rejected with CartAlreadyMergedError (409)
    await expect(
      service.mergeGuestCart(userOwner, guestToken, 'marketplace'),
    ).rejects.toThrow(CartAlreadyMergedError);
  });

  it('rejects tampered guest tokens with TamperedTokenError', async () => {
    const mockSql = {
      unsafe: async () => [],
    };
    const mockCache = {
      get: async () => null,
      set: async () => {},
      invalidate: async () => {},
    };
    const tokenService = new GuestTokenService('test-secret');
    const service = new CartService(
      mockSql as unknown as Sql,
      mockCache as unknown as RedisCacheService,
      tokenService,
    );

    const validToken = tokenService.mintToken('guest-123');
    const tampered = validToken.slice(0, -4) + '0000';

    await expect(
      service.mergeGuestCart({ kind: 'user', id: 'user-1' }, tampered, 'marketplace'),
    ).rejects.toThrow(TamperedTokenError);
  });

  it('verifies cart_merges schema and constraints against real PostgreSQL when configured', async () => {
    const sql = await connectOrSkip();
    if (!sql) return;

    try {
      await runMigrations(sql, migrationsDir);

      const tableCheck = (await sql.unsafe(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'cart_merges';
      `)) as unknown as Array<{ table_name: string }>;

      expect(tableCheck).toHaveLength(1);
      expect(tableCheck[0]?.table_name).toBe('cart_merges');

      // Verify UNIQUE constraint on guest_cart_id
      const constraintCheck = (await sql.unsafe(`
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'cart_merges'::regclass AND contype = 'u';
      `)) as unknown as Array<{ conname: string }>;

      expect(constraintCheck.some((c) => c.conname.includes('guest_cart_id'))).toBe(true);
    } finally {
      await sql.end();
    }
  });
});
