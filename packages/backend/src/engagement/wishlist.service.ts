// packages/backend/src/engagement/wishlist.service.ts - Customer wishlist management (REQ-ENG-001 / T065).

import type { Sql, TransactionSql } from 'postgres';
import type { WishlistItemDto, WishlistResponseDto } from '@shopscale/contracts';
import { getDb } from '../db/client.js';
import { storageService } from '../platform/storage.service.js';
import { ProductNotFoundError } from './errors.js';

export type WishlistSqlOrTx =
  | Sql
  | TransactionSql
  | {
      unsafe: (query: string, params?: unknown[]) => Promise<unknown[]>;
    };

function asSql(tx: WishlistSqlOrTx): Sql {
  return tx as unknown as Sql;
}

export interface WishlistDbRow {
  user_id: string;
  product_id: string;
  created_at: Date;
  title: string;
  slug: string;
  description: string;
  price_cents: number;
  currency: string;
  product_status: string;
  store_name: string;
  store_slug: string;
  store_status: string;
  primary_variant_id: string | null;
  object_key: string | null;
}

export class WishlistService {
  constructor(private readonly explicitSql?: Sql) {}

  /**
   * Adds a product to the user's wishlist (idempotent via ON CONFLICT DO NOTHING).
   * Validates that the product exists.
   */
  async addToWishlist(
    userId: string,
    productId: string,
    txOverride?: WishlistSqlOrTx,
  ): Promise<{ ok: boolean; added: boolean }> {
    const sql = txOverride ? asSql(txOverride) : this.getSql();

    // Verify product exists
    const prodRows = (await sql`
      SELECT id FROM products WHERE id = ${productId};
    `) as unknown as Array<{ id: string }>;

    if (prodRows.length === 0) {
      throw new ProductNotFoundError(productId);
    }

    const inserted = (await sql`
      INSERT INTO wishlists (user_id, product_id)
      VALUES (${userId}, ${productId})
      ON CONFLICT ("user_id", "product_id") DO NOTHING
      RETURNING user_id;
    `) as unknown as Array<{ user_id: string }>;

    return {
      ok: true,
      added: inserted.length > 0,
    };
  }

  /**
   * Removes a product from the user's wishlist.
   */
  async removeFromWishlist(
    userId: string,
    productId: string,
    txOverride?: WishlistSqlOrTx,
  ): Promise<{ ok: boolean; removed: boolean }> {
    const sql = txOverride ? asSql(txOverride) : this.getSql();

    const deleted = (await sql`
      DELETE FROM wishlists
      WHERE user_id = ${userId} AND product_id = ${productId}
      RETURNING user_id;
    `) as unknown as Array<{ user_id: string }>;

    return {
      ok: true,
      removed: deleted.length > 0,
    };
  }

  /**
   * Checks whether a specific product is in the user's wishlist.
   */
  async isInWishlist(
    userId: string,
    productId: string,
    txOverride?: WishlistSqlOrTx,
  ): Promise<boolean> {
    const sql = txOverride ? asSql(txOverride) : this.getSql();

    const rows = (await sql`
      SELECT 1 FROM wishlists
      WHERE user_id = ${userId} AND product_id = ${productId};
    `) as unknown as unknown[];

    return rows.length > 0;
  }

  /**
   * Lists all items in the user's wishlist with availability status,
   * product details, and store details.
   */
  async getWishlist(
    userId: string,
    txOverride?: WishlistSqlOrTx,
  ): Promise<WishlistResponseDto> {
    const sql = txOverride ? asSql(txOverride) : this.getSql();

    const rows = (await sql`
      SELECT
        w.user_id,
        w.product_id,
        w.created_at,
        p.title,
        p.slug,
        p.description,
        p.price_cents,
        p.currency,
        p.status AS product_status,
        s.name AS store_name,
        s.slug AS store_slug,
        s.status AS store_status,
        (
          SELECT id FROM product_variants
          WHERE product_id = p.id
          ORDER BY position ASC, created_at ASC
          LIMIT 1
        ) AS primary_variant_id,
        (
          SELECT ma.object_key
          FROM product_images pi
          JOIN media_assets ma ON ma.id = pi.asset_id
          WHERE pi.product_id = p.id AND ma.status = 'ready'
          ORDER BY pi.is_primary DESC, pi.display_order ASC
          LIMIT 1
        ) AS object_key
      FROM wishlists w
      JOIN products p ON p.id = w.product_id
      JOIN stores s ON s.id = p.store_id
      WHERE w.user_id = ${userId}
      ORDER BY w.created_at DESC;
    `) as unknown as WishlistDbRow[];

    const items: WishlistItemDto[] = rows.map((r) => {
      const isAvailable = r.product_status === 'active' && r.store_status === 'active';
      const imageUrl = r.object_key ? storageService.getPublicUrl(r.object_key) : null;
      return {
        productId: r.product_id,
        title: r.title,
        slug: r.slug,
        description: r.description,
        priceCents: Number(r.price_cents),
        currency: r.currency,
        imageUrl,
        available: isAvailable,
        status: isAvailable ? 'active' : 'unavailable',
        storeName: r.store_name,
        storeSlug: r.store_slug,
        primaryVariantId: r.primary_variant_id,
        addedAt: r.created_at.toISOString(),
      };
    });

    return {
      items,
      count: items.length,
    };
  }

  private getSql(): Sql {
    return this.explicitSql ?? getDb();
  }
}

export const wishlistService = new WishlistService();
