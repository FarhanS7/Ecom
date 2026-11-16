// @shopscale/backend/cart/cart.service - Durable channel cart management (T041, T042).
// Invariants:
// 1. Channel isolation: marketplace cart is strictly isolated from store carts.
// 2. Exactly one owner type per cart (user or guest).
// 3. PostgreSQL persistence with optimistic versioning.
// 4. Redis snapshot caching with 30-day TTL (2,592,000s) on key cart:{channelKey}:{ownerId}.
// 5. Live variant catalog prices dynamically recompute cart totals.
// 6. Max quantity per line item bounded at 99.
// 7. Store mismatch guard: store channel carts reject foreign-store variants (400 STORE_MISMATCH).
// 8. Guest merge consolidation: guest cart atomically merged into customer cart; duplicate items sum (capped at 99); replay rejected (409).

import type { Sql } from 'postgres';
import { getDb } from '../db/client.js';
import { redisCacheService, RedisCacheService } from '../platform/cache.service.js';
import type { CartDto, CartItemDto, MergeCartResponse } from '@shopscale/contracts';
import {
  CartAlreadyMergedError,
  CartNotFoundError,
  CartValidationError,
  StoreMismatchError,
  TamperedTokenError,
  VariantNotFoundError,
} from './errors.js';
import { guestTokenService, GuestTokenService } from './guest-token.service.js';

export const CART_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CartOwner =
  | { kind: 'user'; id: string }
  | { kind: 'guest'; id: string };

interface CartRecord {
  id: string;
  channel_key: string;
  version: number;
}

interface CartItemQueryRow {
  id?: string;
  variant_id: string;
  quantity: number;
  title: string;
  price_cents: string | number;
  variant_status: string;
  product_status: string;
  on_hand: string | number;
  reserved: string | number;
}

export class CartService {
  constructor(
    private readonly explicitSql?: Sql,
    private readonly customCache?: RedisCacheService,
    private readonly customGuestTokens?: GuestTokenService,
  ) {}

  private getSql(): Sql {
    return this.explicitSql ?? getDb();
  }

  private getCache(): RedisCacheService {
    return this.customCache ?? redisCacheService;
  }

  private getGuestTokens(): GuestTokenService {
    return this.customGuestTokens ?? guestTokenService;
  }

  /**
   * Builds the Redis snapshot key: cart:{channelKey}:{ownerId}
   */
  getCacheKey(channelKey: string, owner: CartOwner): string {
    return `cart:${channelKey}:${owner.id}`;
  }

  /**
   * Resolves a store channel identifier (either UUID or slug) into store UUID.
   */
  async resolveStoreId(sql: Sql, channelKey: string): Promise<string> {
    if (channelKey === 'marketplace') {
      throw new CartValidationError('Cannot resolve store ID for marketplace channel', 'INVALID_CHANNEL');
    }

    if (UUID_REGEX.test(channelKey)) {
      return channelKey;
    }

    // Attempt resolving from store slug
    const rows = (await sql.unsafe(
      `SELECT "id" FROM "stores" WHERE "slug" = $1 AND "status" = 'active' LIMIT 1;`,
      [channelKey],
    )) as unknown as Array<{ id: string }>;

    if (!rows[0]) {
      throw new CartValidationError('Store not found for channel', 'STORE_NOT_FOUND');
    }

    return rows[0].id;
  }

  /**
   * Read or create cart for an owner on a given channel.
   * Checks Redis snapshot first; falls back to PostgreSQL on miss.
   */
  async getCart(
    owner: CartOwner,
    channelKey: string,
    options?: { forceFresh?: boolean },
  ): Promise<CartDto> {
    const cacheKey = this.getCacheKey(channelKey, owner);
    const cache = this.getCache();

    if (!options?.forceFresh) {
      const cached = await cache.get<CartDto>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const sql = this.getSql();
    const cart = await this.getOrCreateCartRecord(sql, channelKey, owner);
    const cartDto = await this.fetchCartDto(sql, cart.id, cart.channel_key, cart.version);

    await cache.set(cacheKey, cartDto, CART_TTL_SECONDS);
    return cartDto;
  }

  /**
   * Add a variant item to the cart.
   * Increments quantity if item already exists; caps at 99.
   */
  async addItem(
    owner: CartOwner,
    channelKey: string,
    input: { variantId: string; quantity: number },
  ): Promise<CartDto> {
    if (input.quantity <= 0 || input.quantity > 99) {
      throw new CartValidationError('Quantity must be between 1 and 99', 'INVALID_QUANTITY');
    }

    const sql = this.getSql();

    // 1. Verify variant exists and fetch store/price info
    const variantRows = (await sql.unsafe(
      `SELECT pv."id", pv."store_id", pv."price_cents", pv."status" AS variant_status, p."status" AS product_status
       FROM "product_variants" pv
       JOIN "products" p ON p."id" = pv."product_id"
       WHERE pv."id" = $1 LIMIT 1;`,
      [input.variantId],
    )) as unknown as Array<{
      id: string;
      store_id: string;
      price_cents: number | string;
      variant_status: string;
      product_status: string;
    }>;

    const variant = variantRows[0];
    if (!variant) {
      throw new VariantNotFoundError('Product variant not found');
    }

    // 2. Validate channel vs store scope
    let storeId: string | null = null;
    if (channelKey !== 'marketplace') {
      storeId = await this.resolveStoreId(sql, channelKey);
      if (variant.store_id !== storeId) {
        throw new StoreMismatchError('Product variant does not belong to this store');
      }
    }

    // 3. Mutate inside a database transaction
    const updatedCartDto = await sql.begin(async (tx) => {
      const cart = await this.getOrCreateCartRecord(tx as unknown as Sql, channelKey, owner, storeId);

      const existingItemRows = (await tx.unsafe(
        `SELECT "id", "quantity" FROM "cart_items" WHERE "cart_id" = $1 AND "variant_id" = $2 LIMIT 1;`,
        [cart.id, input.variantId],
      )) as unknown as Array<{ id: string; quantity: number }>;

      const existing = existingItemRows[0];
      if (existing) {
        const newQty = existing.quantity + input.quantity;
        if (newQty > 99) {
          throw new CartValidationError('Cart quantity cannot exceed 99', 'MAX_QUANTITY_EXCEEDED');
        }
        await tx.unsafe(
          `UPDATE "cart_items"
           SET "quantity" = $1, "unit_price_cents" = $2, "updated_at" = now()
           WHERE "id" = $3;`,
          [newQty, variant.price_cents, existing.id],
        );
      } else {
        await tx.unsafe(
          `INSERT INTO "cart_items" ("cart_id", "variant_id", "quantity", "unit_price_cents")
           VALUES ($1, $2, $3, $4);`,
          [cart.id, input.variantId, input.quantity, variant.price_cents],
        );
      }

      const updatedVersionRows = (await tx.unsafe(
        `UPDATE "carts" SET "version" = "version" + 1, "updated_at" = now()
         WHERE "id" = $1 RETURNING "version";`,
        [cart.id],
      )) as unknown as Array<{ version: number }>;

      const newVersion = updatedVersionRows[0]?.version ?? cart.version + 1;
      return this.fetchCartDto(tx as unknown as Sql, cart.id, cart.channel_key, newVersion);
    });

    // 4. Update Redis snapshot with 30-day TTL
    const cacheKey = this.getCacheKey(channelKey, owner);
    await this.getCache().set(cacheKey, updatedCartDto, CART_TTL_SECONDS);

    return updatedCartDto;
  }

  /**
   * Update quantity of an item in the cart.
   * If quantity is 0, removes the item.
   */
  async updateItem(
    owner: CartOwner,
    channelKey: string,
    variantId: string,
    quantity: number,
  ): Promise<CartDto> {
    if (quantity < 0 || quantity > 99) {
      throw new CartValidationError('Quantity must be between 0 and 99', 'INVALID_QUANTITY');
    }

    const sql = this.getSql();
    const cart = await this.findCartRecord(sql, channelKey, owner);
    if (!cart) {
      throw new CartNotFoundError('Cart not found');
    }

    const updatedCartDto = await sql.begin(async (tx) => {
      if (quantity === 0) {
        await tx.unsafe(
          `DELETE FROM "cart_items" WHERE "cart_id" = $1 AND "variant_id" = $2;`,
          [cart.id, variantId],
        );
      } else {
        const updateRes = (await tx.unsafe(
          `UPDATE "cart_items"
           SET "quantity" = $1, "updated_at" = now()
           WHERE "cart_id" = $2 AND "variant_id" = $3
           RETURNING "id";`,
          [quantity, cart.id, variantId],
        )) as unknown as Array<{ id: string }>;

        if (!updateRes[0]) {
          throw new VariantNotFoundError('Item not found in cart');
        }
      }

      const updatedVersionRows = (await tx.unsafe(
        `UPDATE "carts" SET "version" = "version" + 1, "updated_at" = now()
         WHERE "id" = $1 RETURNING "version";`,
        [cart.id],
      )) as unknown as Array<{ version: number }>;

      const newVersion = updatedVersionRows[0]?.version ?? cart.version + 1;
      return this.fetchCartDto(tx as unknown as Sql, cart.id, cart.channel_key, newVersion);
    });

    const cacheKey = this.getCacheKey(channelKey, owner);
    await this.getCache().set(cacheKey, updatedCartDto, CART_TTL_SECONDS);

    return updatedCartDto;
  }

  /**
   * Remove item from cart.
   */
  async removeItem(owner: CartOwner, channelKey: string, variantId: string): Promise<CartDto> {
    return this.updateItem(owner, channelKey, variantId, 0);
  }

  /**
   * Clear all items in cart.
   */
  async clearCart(owner: CartOwner, channelKey: string): Promise<CartDto> {
    const sql = this.getSql();
    const cart = await this.findCartRecord(sql, channelKey, owner);
    if (!cart) {
      return {
        id: '',
        channelKey,
        items: [],
        totalCents: '0',
        version: 1,
      };
    }

    const updatedCartDto = await sql.begin(async (tx) => {
      await tx.unsafe(`DELETE FROM "cart_items" WHERE "cart_id" = $1;`, [cart.id]);

      const updatedVersionRows = (await tx.unsafe(
        `UPDATE "carts" SET "version" = "version" + 1, "updated_at" = now()
         WHERE "id" = $1 RETURNING "version";`,
        [cart.id],
      )) as unknown as Array<{ version: number }>;

      const newVersion = updatedVersionRows[0]?.version ?? cart.version + 1;
      return {
        id: cart.id,
        channelKey: cart.channel_key,
        items: [],
        totalCents: '0',
        version: newVersion,
      };
    });

    const cacheKey = this.getCacheKey(channelKey, owner);
    await this.getCache().set(cacheKey, updatedCartDto, CART_TTL_SECONDS);

    return updatedCartDto;
  }

  /**
   * Merge anonymous guest cart into customer cart upon login (T042).
   * Invariants:
   * 1. Guest token signature verified with HMAC-SHA256 (throws TamperedTokenError on failure).
   * 2. Replay protection: repeated merge of the same guest cart throws CartAlreadyMergedError.
   * 3. Consolidates line items; duplicate variants sum quantities (capped at 99).
   * 4. Deletes guest items and invalidates guest Redis snapshot.
   * 5. Atomically commits in a single transaction with audit row in cart_merges.
   */
  async mergeGuestCart(
    userOwner: CartOwner,
    guestToken: string,
    channelKey: string,
  ): Promise<MergeCartResponse> {
    if (userOwner.kind !== 'user') {
      throw new CartValidationError('Only authenticated users can merge guest carts', 'AUTH_REQUIRED');
    }

    // 1. Verify guest token signature
    const verification = this.getGuestTokens().verifyToken(guestToken);
    if (!verification.valid || !verification.guestId) {
      throw new TamperedTokenError('Tampered or invalid guest token signature');
    }
    const guestId = verification.guestId;

    const sql = this.getSql();
    const cache = this.getCache();

    // 2. Find guest cart
    const guestCart = await this.findCartRecord(sql, channelKey, { kind: 'guest', id: guestId });
    if (!guestCart) {
      const userCart = await this.getCart(userOwner, channelKey);
      return { mergedCart: userCart };
    }

    // 3. Replay prevention check
    const existingMergeRows = (await sql.unsafe(
      `SELECT "id" FROM "cart_merges" WHERE "guest_cart_id" = $1 LIMIT 1;`,
      [guestCart.id],
    )) as unknown as Array<{ id: string }>;

    if (existingMergeRows[0]) {
      throw new CartAlreadyMergedError('Guest cart has already been merged');
    }

    // 4. Atomic consolidation transaction
    const mergedCartDto = await sql.begin(async (tx) => {
      // Create merge audit receipt
      await tx.unsafe(
        `INSERT INTO "cart_merges" ("guest_cart_id", "user_id", "user_cart_id", "channel_key", "items_merged_count")
         VALUES ($1, $2, $3, $4, 0);`,
        [guestCart.id, userOwner.id, guestCart.id, channelKey],
      );

      const userCart = await this.getOrCreateCartRecord(tx as unknown as Sql, channelKey, userOwner);

      // Fetch guest items
      const guestItems = (await tx.unsafe(
        `SELECT "id", "variant_id", "quantity", "unit_price_cents"
         FROM "cart_items"
         WHERE "cart_id" = $1;`,
        [guestCart.id],
      )) as unknown as Array<{
        id: string;
        variant_id: string;
        quantity: number;
        unit_price_cents: number | string;
      }>;

      let mergedCount = 0;

      for (const gItem of guestItems) {
        const userItemRows = (await tx.unsafe(
          `SELECT "id", "quantity" FROM "cart_items" WHERE "cart_id" = $1 AND "variant_id" = $2 LIMIT 1;`,
          [userCart.id, gItem.variant_id],
        )) as unknown as Array<{ id: string; quantity: number }>;

        const existingUserItem = userItemRows[0];
        if (existingUserItem) {
          const newQty = Math.min(99, existingUserItem.quantity + gItem.quantity);
          await tx.unsafe(
            `UPDATE "cart_items" SET "quantity" = $1, "updated_at" = now() WHERE "id" = $2;`,
            [newQty, existingUserItem.id],
          );
        } else {
          const newQty = Math.min(99, gItem.quantity);
          await tx.unsafe(
            `INSERT INTO "cart_items" ("cart_id", "variant_id", "quantity", "unit_price_cents")
             VALUES ($1, $2, $3, $4);`,
            [userCart.id, gItem.variant_id, newQty, gItem.unit_price_cents],
          );
        }
        mergedCount += gItem.quantity;
      }

      // Delete guest cart items
      await tx.unsafe(`DELETE FROM "cart_items" WHERE "cart_id" = $1;`, [guestCart.id]);

      // Update merge audit receipt
      await tx.unsafe(
        `UPDATE "cart_merges" SET "user_cart_id" = $1, "items_merged_count" = $2 WHERE "guest_cart_id" = $3;`,
        [userCart.id, mergedCount, guestCart.id],
      );

      // Increment user cart version
      const updatedVersionRows = (await tx.unsafe(
        `UPDATE "carts" SET "version" = "version" + 1, "updated_at" = now()
         WHERE "id" = $1 RETURNING "version";`,
        [userCart.id],
      )) as unknown as Array<{ version: number }>;

      const newVersion = updatedVersionRows[0]?.version ?? userCart.version + 1;
      return this.fetchCartDto(tx as unknown as Sql, userCart.id, userCart.channel_key, newVersion);
    });

    // 5. Invalidate guest cache & update user snapshot
    const guestCacheKey = this.getCacheKey(channelKey, { kind: 'guest', id: guestId });
    await cache.invalidate(guestCacheKey);

    const userCacheKey = this.getCacheKey(channelKey, userOwner);
    await cache.set(userCacheKey, mergedCartDto, CART_TTL_SECONDS);

    return { mergedCart: mergedCartDto };
  }

  // --- Internal Query Helpers ---

  private async findCartRecord(
    sql: Sql,
    channelKey: string,
    owner: CartOwner,
  ): Promise<CartRecord | null> {
    const rows = (await sql.unsafe(
      owner.kind === 'user'
        ? `SELECT "id", "channel_key", "version" FROM "carts" WHERE "channel_key" = $1 AND "user_id" = $2 LIMIT 1;`
        : `SELECT "id", "channel_key", "version" FROM "carts" WHERE "channel_key" = $1 AND "guest_id" = $2 LIMIT 1;`,
      [channelKey, owner.id],
    )) as unknown as Array<CartRecord>;

    return rows[0] ?? null;
  }

  private async getOrCreateCartRecord(
    sql: Sql,
    channelKey: string,
    owner: CartOwner,
    explicitStoreId?: string | null,
  ): Promise<CartRecord> {
    const existing = await this.findCartRecord(sql, channelKey, owner);
    if (existing) return existing;

    const storeId = explicitStoreId !== undefined
      ? explicitStoreId
      : (channelKey !== 'marketplace' && UUID_REGEX.test(channelKey) ? channelKey : null);

    const insertedRows = (await sql.unsafe(
      `INSERT INTO "carts" ("channel_key", "store_id", "user_id", "guest_id")
       VALUES ($1, $2, $3, $4)
       RETURNING "id", "channel_key", "version";`,
      [
        channelKey,
        storeId,
        owner.kind === 'user' ? owner.id : null,
        owner.kind === 'guest' ? owner.id : null,
      ],
    )) as unknown as Array<CartRecord>;

    return insertedRows[0]!;
  }

  private async fetchCartDto(
    sql: Sql,
    cartId: string,
    channelKey: string,
    version: number,
  ): Promise<CartDto> {
    const rows = (await sql.unsafe(
      `SELECT 
         ci."id",
         ci."variant_id",
         ci."quantity",
         p."title",
         pv."price_cents",
         pv."status" AS variant_status,
         p."status" AS product_status,
         COALESCE(i."on_hand", 0) AS on_hand,
         COALESCE(i."reserved", 0) AS reserved
       FROM "cart_items" ci
       JOIN "product_variants" pv ON pv."id" = ci."variant_id"
       JOIN "products" p ON p."id" = pv."product_id"
       LEFT JOIN "inventory" i ON i."variant_id" = pv."id"
       WHERE ci."cart_id" = $1
       ORDER BY ci."created_at" ASC;`,
      [cartId],
    )) as unknown as Array<CartItemQueryRow>;

    let totalCentsBigInt = 0n;

    const items: CartItemDto[] = (rows ?? []).map((r) => {
      const priceCentsBigInt = BigInt(r.price_cents);
      const qtyBigInt = BigInt(r.quantity);
      totalCentsBigInt += priceCentsBigInt * qtyBigInt;

      const onHand = Number(r.on_hand);
      const reserved = Number(r.reserved);
      const availableStock = Math.max(0, onHand - reserved);

      const available =
        r.variant_status === 'active' &&
        r.product_status === 'active' &&
        availableStock >= r.quantity;

      return {
        id: r.id,
        variantId: r.variant_id,
        qty: r.quantity,
        title: r.title,
        priceCents: String(r.price_cents),
        available,
      };
    });

    return {
      id: cartId,
      channelKey,
      items,
      totalCents: totalCentsBigInt.toString(),
      version,
    };
  }
}

export const cartService = new CartService();
