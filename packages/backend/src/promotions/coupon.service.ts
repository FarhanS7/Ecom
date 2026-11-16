// packages/backend/src/promotions/coupon.service.ts - Atomic coupon management & redemption engine (OR-9 / T063).

import type { Sql, TransactionSql } from 'postgres';
import type { CouponDto, CreateCouponInput } from '@shopscale/contracts';
import { getDb } from '../db/client.js';
import { auditService } from '../platform/audit.service.js';

export type PromotionSqlOrTx =
  | Sql
  | TransactionSql
  | {
      unsafe: (query: string, params?: unknown[]) => Promise<unknown[]>;
    };

function asSql(tx: PromotionSqlOrTx): Sql {
  return tx as unknown as Sql;
}
import {
  CouponConflictError,
  CouponExpiredError,
  CouponGlobalLimitExceededError,
  CouponInactiveError,
  CouponNotFoundError,
  CouponNotStartedError,
  CouponPerUserLimitExceededError,
  CouponStoreMismatchError,
} from './errors.js';

export interface CouponDbRow {
  id: string;
  store_id: string | null;
  code: string;
  kind: 'PERCENT' | 'FIXED';
  value: number;
  starts_at: Date;
  ends_at: Date;
  global_limit: number;
  per_user_limit: number;
  held_count: number;
  redeemed_count: number;
  status: 'active' | 'disabled';
  created_at: Date;
  updated_at: Date;
}

export interface CouponUseDbRow {
  id: string;
  coupon_id: string;
  user_id: string;
  order_id: string;
  status: 'HELD' | 'REDEEMED' | 'RELEASED';
  discount_cents: number;
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface ValidateAndCalculateInput {
  code: string;
  items: Array<{
    variantId: string;
    storeId: string;
    subtotalCents: number;
  }>;
  userId?: string | undefined;
}

export interface ValidateAndCalculateResult {
  couponId: string;
  code: string;
  kind: 'PERCENT' | 'FIXED';
  value: number;
  storeId: string | null;
  discountCents: number;
  eligibleSubtotalCents: number;
  isStoreScoped: boolean;
}

export function mapCouponRowToDto(row: CouponDbRow): CouponDto {
  return {
    id: row.id,
    storeId: row.store_id ?? null,
    code: row.code,
    kind: row.kind,
    value: row.value,
    startsAt: row.starts_at.toISOString(),
    endsAt: row.ends_at.toISOString(),
    globalLimit: row.global_limit,
    perUserLimit: row.per_user_limit,
    heldCount: row.held_count,
    redeemedCount: row.redeemed_count,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export class CouponService {
  constructor(private readonly explicitSql?: Sql) {}

  /**
   * Creates a new coupon for a store or global marketplace.
   */
  async createCoupon(
    input: CreateCouponInput,
    storeId: string | null = null,
    actorId?: string | null,
  ): Promise<CouponDto> {
    const code = input.code.trim().toUpperCase();
    const startsAt = input.startsAt ? new Date(input.startsAt) : new Date();
    const endsAt = new Date(input.endsAt);

    if (endsAt.getTime() < startsAt.getTime()) {
      throw new Error('Coupon end date must be after start date.');
    }

    if (input.kind === 'PERCENT' && (input.value <= 0 || input.value > 100)) {
      throw new Error('Percentage coupon value must be between 1 and 100.');
    }

    const sql = this.getSql();

    // Check for duplicate code in same scope
    let existing: CouponDbRow[];
    if (storeId) {
      existing = (await sql`
        SELECT id FROM coupons
        WHERE store_id = ${storeId} AND UPPER(code) = ${code};
      `) as unknown as CouponDbRow[];
    } else {
      existing = (await sql`
        SELECT id FROM coupons
        WHERE store_id IS NULL AND UPPER(code) = ${code};
      `) as unknown as CouponDbRow[];
    }

    if (existing.length > 0) {
      throw new CouponConflictError(code);
    }

    const rows = (await sql`
      INSERT INTO coupons (
        store_id,
        code,
        kind,
        value,
        starts_at,
        ends_at,
        global_limit,
        per_user_limit,
        held_count,
        redeemed_count,
        status
      ) VALUES (
        ${storeId ?? null},
        ${code},
        ${input.kind},
        ${input.value},
        ${startsAt},
        ${endsAt},
        ${input.globalLimit ?? 0},
        ${input.perUserLimit ?? 1},
        0,
        0,
        'active'
      )
      RETURNING *;
    `) as unknown as CouponDbRow[];

    const created = rows[0]!;
    const dto = mapCouponRowToDto(created);

    await auditService.recordMutation({
      actorId: actorId ?? null,
      storeId: storeId ?? null,
      action: 'promotions.coupon_created',
      entityType: 'coupon',
      entityId: created.id,
      after: {
        code: created.code,
        kind: created.kind,
        value: created.value,
        storeId: created.store_id,
        globalLimit: created.global_limit,
        perUserLimit: created.per_user_limit,
      },
    });

    return dto;
  }

  /**
   * Lists coupons belonging to a specific store.
   */
  async listStoreCoupons(storeId: string): Promise<CouponDto[]> {
    const rows = (await this.getSql()`
      SELECT * FROM coupons
      WHERE store_id = ${storeId}
      ORDER BY created_at DESC;
    `) as unknown as CouponDbRow[];

    return rows.map(mapCouponRowToDto);
  }

  /**
   * Lists global marketplace coupons.
   */
  async listPlatformCoupons(): Promise<CouponDto[]> {
    const rows = (await this.getSql()`
      SELECT * FROM coupons
      WHERE store_id IS NULL
      ORDER BY created_at DESC;
    `) as unknown as CouponDbRow[];

    return rows.map(mapCouponRowToDto);
  }

  /**
   * Retrieves a single coupon by ID, checking store ownership if storeId is supplied.
   */
  async getCouponById(id: string, storeId?: string | null): Promise<CouponDto> {
    const rows = (await this.getSql()`
      SELECT * FROM coupons WHERE id = ${id};
    `) as unknown as CouponDbRow[];

    const row = rows[0];
    if (!row) {
      throw new CouponNotFoundError(id);
    }

    if (storeId !== undefined && storeId !== null && row.store_id !== storeId) {
      throw new CouponNotFoundError(id);
    }

    return mapCouponRowToDto(row);
  }

  /**
   * Validates a coupon code against current items and user limits, and computes discount cents.
   */
  async validateAndCalculateDiscount(
    input: ValidateAndCalculateInput,
  ): Promise<ValidateAndCalculateResult> {
    const code = input.code.trim().toUpperCase();
    const now = new Date();

    // Query candidate coupons matching this code (store-specific or global)
    const rows = (await this.getSql()`
      SELECT * FROM coupons
      WHERE UPPER(code) = ${code}
      ORDER BY store_id NULLS LAST;
    `) as unknown as CouponDbRow[];

    if (rows.length === 0) {
      throw new CouponNotFoundError(code);
    }

    // If there's a store coupon that matches one of the basket storeIds, prefer it; otherwise use global
    const itemStoreIds = new Set(input.items.map((it) => it.storeId));
    let matchingCoupon = rows.find((c) => c.store_id && itemStoreIds.has(c.store_id));
    if (!matchingCoupon) {
      // Check for global coupon
      matchingCoupon = rows.find((c) => c.store_id === null);
    }
    if (!matchingCoupon) {
      // Coupon exists for another store not present in this cart
      matchingCoupon = rows[0]!;
      if (matchingCoupon.store_id && !itemStoreIds.has(matchingCoupon.store_id)) {
        throw new CouponStoreMismatchError(code);
      }
    }

    const coupon = matchingCoupon;

    // Invariant checks
    if (coupon.status !== 'active') {
      throw new CouponInactiveError(code);
    }

    if (now.getTime() < new Date(coupon.starts_at).getTime()) {
      throw new CouponNotStartedError(code);
    }

    if (now.getTime() > new Date(coupon.ends_at).getTime()) {
      throw new CouponExpiredError(code);
    }

    if (coupon.global_limit > 0 && coupon.held_count + coupon.redeemed_count >= coupon.global_limit) {
      throw new CouponGlobalLimitExceededError(code);
    }

    if (input.userId && coupon.per_user_limit > 0) {
      const counters = (await this.getSql()`
        SELECT held_count, redeemed_count
        FROM coupon_user_counters
        WHERE coupon_id = ${coupon.id} AND user_id = ${input.userId};
      `) as unknown as Array<{ held_count: number; redeemed_count: number }>;

      const counter = counters[0];
      if (counter && counter.held_count + counter.redeemed_count >= coupon.per_user_limit) {
        throw new CouponPerUserLimitExceededError(code);
      }
    }

    // Filter items eligible for this coupon
    const eligibleItems = coupon.store_id
      ? input.items.filter((it) => it.storeId === coupon.store_id)
      : input.items;

    const eligibleSubtotalCents = eligibleItems.reduce((sum, it) => sum + it.subtotalCents, 0);

    if (eligibleSubtotalCents <= 0) {
      throw new CouponStoreMismatchError(code);
    }

    let discountCents = 0;
    if (coupon.kind === 'PERCENT') {
      discountCents = Math.floor((eligibleSubtotalCents * coupon.value) / 100);
    } else {
      discountCents = Math.min(coupon.value, eligibleSubtotalCents);
    }

    // Never exceed eligible subtotal
    discountCents = Math.min(discountCents, eligibleSubtotalCents);

    return {
      couponId: coupon.id,
      code: coupon.code,
      kind: coupon.kind,
      value: coupon.value,
      storeId: coupon.store_id,
      discountCents,
      eligibleSubtotalCents,
      isStoreScoped: coupon.store_id !== null,
    };
  }

  /**
   * Atomically holds a coupon for an order during checkout under row-level lock.
   */
  async holdCoupon(
    tx: PromotionSqlOrTx,
    params: {
      couponId: string;
      orderId: string;
      userId: string;
      discountCents: number;
      ttlMinutes?: number;
    },
  ): Promise<void> {
    const client = asSql(tx);
    const ttlMinutes = params.ttlMinutes ?? 15;

    // 1. Lock coupon row FOR UPDATE
    const couponRows = (await client`
      SELECT id, code, global_limit, per_user_limit, held_count, redeemed_count, status, ends_at
      FROM coupons
      WHERE id = ${params.couponId}
      FOR UPDATE;
    `) as unknown as CouponDbRow[];

    const coupon = couponRows[0];
    if (!coupon) {
      throw new CouponNotFoundError(params.couponId);
    }

    if (coupon.status !== 'active') {
      throw new CouponInactiveError(coupon.code);
    }

    if (new Date().getTime() > new Date(coupon.ends_at).getTime()) {
      throw new CouponExpiredError(coupon.code);
    }

    if (coupon.global_limit > 0 && coupon.held_count + coupon.redeemed_count >= coupon.global_limit) {
      throw new CouponGlobalLimitExceededError(coupon.code);
    }

    // 2. Lock and check per-user counter
    const userCounters = (await client`
      SELECT held_count, redeemed_count
      FROM coupon_user_counters
      WHERE coupon_id = ${params.couponId} AND user_id = ${params.userId}
      FOR UPDATE;
    `) as unknown as Array<{ held_count: number; redeemed_count: number }>;

    const userCounter = userCounters[0];
    if (userCounter && userCounter.held_count + userCounter.redeemed_count >= coupon.per_user_limit) {
      throw new CouponPerUserLimitExceededError(coupon.code);
    }

    // 3. Atomically increment global held_count
    await client`
      UPDATE coupons
      SET held_count = held_count + 1, updated_at = NOW()
      WHERE id = ${params.couponId};
    `;

    // 4. Atomically upsert per-user held_count
    await client`
      INSERT INTO coupon_user_counters (coupon_id, user_id, held_count, redeemed_count, created_at, updated_at)
      VALUES (${params.couponId}, ${params.userId}, 1, 0, NOW(), NOW())
      ON CONFLICT (coupon_id, user_id)
      DO UPDATE SET
        held_count = coupon_user_counters.held_count + 1,
        updated_at = NOW();
    `;

    // 5. Insert coupon_uses record
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
    await client`
      INSERT INTO coupon_uses (
        coupon_id,
        user_id,
        order_id,
        status,
        discount_cents,
        expires_at,
        created_at,
        updated_at
      ) VALUES (
        ${params.couponId},
        ${params.userId},
        ${params.orderId},
        'HELD',
        ${params.discountCents},
        ${expiresAt},
        NOW(),
        NOW()
      )
      ON CONFLICT (coupon_id, order_id)
      DO NOTHING;
    `;
  }

  /**
   * Atomically transitions held coupon to REDEEMED upon order payment.
   */
  async redeemCoupon(tx: PromotionSqlOrTx, orderId: string): Promise<void> {
    const client = asSql(tx);
    const uses = (await client`
      SELECT id, coupon_id, user_id, status
      FROM coupon_uses
      WHERE order_id = ${orderId} AND status = 'HELD'
      FOR UPDATE;
    `) as unknown as CouponUseDbRow[];

    if (uses.length === 0) {
      return;
    }

    const use = uses[0]!;

    // Lock coupon and adjust counts
    await client`
      UPDATE coupons
      SET
        held_count = GREATEST(0, held_count - 1),
        redeemed_count = redeemed_count + 1,
        updated_at = NOW()
      WHERE id = ${use.coupon_id};
    `;

    // Lock user counter and adjust counts
    await client`
      UPDATE coupon_user_counters
      SET
        held_count = GREATEST(0, held_count - 1),
        redeemed_count = redeemed_count + 1,
        updated_at = NOW()
      WHERE coupon_id = ${use.coupon_id} AND user_id = ${use.user_id};
    `;

    // Update coupon_use status
    await client`
      UPDATE coupon_uses
      SET status = 'REDEEMED', updated_at = NOW()
      WHERE id = ${use.id};
    `;
  }

  /**
   * Atomically releases a held coupon on cancellation or expiry.
   */
  async releaseCoupon(tx: PromotionSqlOrTx, orderId: string): Promise<void> {
    const client = asSql(tx);
    const uses = (await client`
      SELECT id, coupon_id, user_id, status
      FROM coupon_uses
      WHERE order_id = ${orderId} AND status = 'HELD'
      FOR UPDATE;
    `) as unknown as CouponUseDbRow[];

    if (uses.length === 0) {
      return;
    }

    const use = uses[0]!;

    // Release held count on coupon
    await client`
      UPDATE coupons
      SET
        held_count = GREATEST(0, held_count - 1),
        updated_at = NOW()
      WHERE id = ${use.coupon_id};
    `;

    // Release held count on user counter
    await client`
      UPDATE coupon_user_counters
      SET
        held_count = GREATEST(0, held_count - 1),
        updated_at = NOW()
      WHERE coupon_id = ${use.coupon_id} AND user_id = ${use.user_id};
    `;

    // Update coupon_use status
    await client`
      UPDATE coupon_uses
      SET status = 'RELEASED', updated_at = NOW()
      WHERE id = ${use.id};
    `;
  }

  private getSql(): Sql {
    return this.explicitSql ?? getDb();
  }
}

export const couponService = new CouponService();
