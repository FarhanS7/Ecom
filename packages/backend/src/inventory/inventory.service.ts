// @shopscale/backend/inventory/inventory.service - Atomic basket reservations & inventory management (T038).
// Core correctness rules (DEC-005, IN-2, IN-3, G2):
// 1. Deadlock prevention: variant locks acquired in strictly ascending variantId order.
// 2. Conditional SQL update: reserved += qty iff (on_hand - reserved) >= qty.
// 3. Atomicity: multi-item reservations succeed entirely or rollback with zero partial state.
// 4. Invariant: on_hand >= 0, reserved >= 0, reserved <= on_hand.
// 5. Auditability: append-only movement ledger with reason 'reservation_created'.

import type { Sql } from 'postgres';
import { getDb } from '../db/client.js';
import { InventoryConstraintError } from './schema.js';
import { auditService } from '../platform/audit.service.js';
import { writeOutboxEvent } from '../platform/outbox.service.js';
import type { InventoryItemView, StockMovementItem } from '@shopscale/contracts';

export interface ReserveLineItem {
  variantId: string;
  qty?: number;
  quantity?: number;
}

export interface ReserveInput {
  checkoutId?: string;
  cartId?: string;
  items: ReserveLineItem[];
  ttlSeconds?: number; // default: 900 (15 minutes)
}

export type ReserveSuccess = {
  ok: true;
  reservationIds: string[];
};

export type ReserveFailure = {
  ok: false;
  code: 'INSUFFICIENT_STOCK';
  variantId: string;
  available: number;
};

export type ReserveResult = ReserveSuccess | ReserveFailure;

export interface AdjustStockInput {
  storeId: string;
  variantId: string;
  deltaOnHand: number;
  reason: 'initial_stock' | 'manual_adjustment' | 'return_restock';
  operationKey: string;
  refId?: string | null;
}

export interface AdjustStockResult {
  ok: true;
  onHand: number;
  reserved: number;
  available: number;
}

export interface ExpirySweepResult {
  releasedCount: number;
  releasedUnits: number;
}

export interface UnitOfWorkContext {
  unsafe: Sql['unsafe'];
}

export interface AggregatedItem {
  variantId: string;
  qty: number;
}

/**
 * Aggregates duplicate variant IDs in the payload and sorts them by variantId ASC
 * to guarantee deterministic, deadlock-free row locking across concurrent transactions.
 */
export function aggregateAndSortItems(items: ReserveLineItem[]): AggregatedItem[] {
  if (!items || items.length === 0) return [];

  const map = new Map<string, number>();

  for (const item of items) {
    const rawQty = item.qty ?? item.quantity;
    if (typeof rawQty !== 'number' || !Number.isInteger(rawQty) || rawQty <= 0) {
      throw new Error(`Quantity must be a positive integer, received: ${rawQty}`);
    }
    const current = map.get(item.variantId) ?? 0;
    map.set(item.variantId, current + rawQty);
  }

  const aggregated: AggregatedItem[] = Array.from(map.entries()).map(([variantId, qty]) => ({
    variantId,
    qty,
  }));

  // Strict lexicographical ascending sort for deadlock prevention
  aggregated.sort((a, b) => a.variantId.localeCompare(b.variantId));

  return aggregated;
}

export class InventoryService {
  constructor(private readonly explicitSql?: Sql) {}

  private getSql(): Sql {
    return this.explicitSql ?? getDb();
  }

  /**
   * Emits a LowStockAlert outbox event if available stock drops below threshold (default 5).
   * Throttles duplicate alerts to at most 1 per variant per 24 hours (TASK-076 / IN-5).
   */
  async maybeEmitLowStockAlert(
    tx: UnitOfWorkContext,
    params: {
      storeId: string;
      variantId: string;
      onHand: number;
      reserved: number;
      available: number;
      threshold?: number;
    },
  ): Promise<boolean> {
    const threshold = params.threshold ?? 5;
    if (params.available > threshold) {
      return false;
    }

    try {
      const existing = (await tx.unsafe(
        `SELECT "id" FROM "outbox"
         WHERE "aggregate_id" = $1
           AND "event_type" = 'inventory.low_stock_alert'
           AND "created_at" > now() - interval '24 hours'
         LIMIT 1;`,
        [params.variantId],
      )) as unknown as Array<{ id: string }>;

      if (existing.length > 0) {
        return false;
      }

      await writeOutboxEvent(tx, {
        aggregateType: 'inventory',
        aggregateId: params.variantId,
        type: 'inventory.low_stock_alert',
        storeId: params.storeId,
        payload: {
          variantId: params.variantId,
          storeId: params.storeId,
          onHand: params.onHand,
          reserved: params.reserved,
          available: params.available,
          threshold,
        },
      });

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Atomically reserves stock for a list of variant items under a checkout/cart ID.
   * If any item cannot be reserved, all partial reservations in this call are rolled back.
   */
  async reserve(txOrInput: UnitOfWorkContext | ReserveInput, maybeInput?: ReserveInput): Promise<ReserveResult> {
    const startTime = performance.now();

    let tx: UnitOfWorkContext;
    let input: ReserveInput;

    if (maybeInput) {
      tx = txOrInput as UnitOfWorkContext;
      input = maybeInput;
    } else {
      input = txOrInput as ReserveInput;
      tx = this.getSql();
    }

    const checkoutId = input.checkoutId ?? input.cartId;
    if (!checkoutId) {
      throw new Error('checkoutId or cartId is required for stock reservation');
    }

    const items = aggregateAndSortItems(input.items);
    if (items.length === 0) {
      return { ok: true, reservationIds: [] };
    }

    const ttlSeconds = input.ttlSeconds ?? 900;
    const savepointName = `sp_reserve_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Create a savepoint to allow clean rollback of partial reservations if any line item fails
    await tx.unsafe(`SAVEPOINT ${savepointName};`);

    try {
      const reservationIds: string[] = [];

      for (const item of items) {
        // Step 1: Conditional atomic increment with row-lock acquisition
        const updateRows = (await tx.unsafe(
          `UPDATE "inventory"
           SET "reserved" = "reserved" + $1,
               "version" = "version" + 1,
               "updated_at" = now()
           WHERE "variant_id" = $2 AND ("on_hand" - "reserved") >= $1
           RETURNING "store_id", "on_hand", "reserved";`,
          [item.qty, item.variantId],
        )) as unknown as Array<{ store_id: string; on_hand: number; reserved: number }>;

        if (updateRows.length === 0) {
          // Insufficient stock or variant row not found.
          // Rollback to savepoint to undo reservations for any previously processed items in this call.
          await tx.unsafe(`ROLLBACK TO SAVEPOINT ${savepointName};`);

          // Query current available stock for error reporting
          const stockRows = (await tx.unsafe(
            `SELECT "on_hand", "reserved" FROM "inventory" WHERE "variant_id" = $1;`,
            [item.variantId],
          )) as unknown as Array<{ on_hand: number; reserved: number }>;

          const available = stockRows[0]
            ? Math.max(0, stockRows[0].on_hand - stockRows[0].reserved)
            : 0;

          const durationMs = performance.now() - startTime;
          // Observability: record reservation failure
          console.warn(
            `[inventory.reserve] INSUFFICIENT_STOCK variant=${item.variantId} requested=${item.qty} available=${available} durationMs=${durationMs.toFixed(2)}`,
          );

          return {
            ok: false,
            code: 'INSUFFICIENT_STOCK',
            variantId: item.variantId,
            available,
          };
        }

        const storeId = updateRows[0]!.store_id;

        // Step 2: Insert active reservation with TTL
        const reservationRows = (await tx.unsafe(
          `INSERT INTO "stock_reservations" (
             "cart_id", "variant_id", "store_id", "quantity", "expires_at", "status"
           ) VALUES (
             $1, $2, $3, $4, now() + ($5 || ' seconds')::interval, 'active'
           )
           RETURNING "id";`,
          [checkoutId, item.variantId, storeId, item.qty, ttlSeconds],
        )) as unknown as Array<{ id: string }>;

        reservationIds.push(reservationRows[0]!.id);

        // Step 3: Insert append-only movement ledger record
        await tx.unsafe(
          `INSERT INTO "stock_movements" (
             "store_id", "variant_id", "delta_on_hand", "delta_reserved", "reason", "operation_key", "ref_id"
           ) VALUES ($1, $2, 0, $3, 'reservation_created', $4, $5);`,
          [
            storeId,
            item.variantId,
            item.qty,
            `reserve:${checkoutId}`,
            checkoutId,
          ],
        );

        // Step 4: Check if remaining available stock is at or below low-stock threshold (<= 5)
        const onHand = updateRows[0]!.on_hand;
        const reserved = updateRows[0]!.reserved;
        const available = Math.max(0, onHand - reserved);
        if (available <= 5) {
          await this.maybeEmitLowStockAlert(tx, {
            storeId,
            variantId: item.variantId,
            onHand,
            reserved,
            available,
            threshold: 5,
          });
        }
      }

      // Success: release savepoint
      await tx.unsafe(`RELEASE SAVEPOINT ${savepointName};`);

      const durationMs = performance.now() - startTime;
      console.info(
        `[inventory.reserve] SUCCESS checkout=${checkoutId} items=${items.length} reservations=${reservationIds.length} durationMs=${durationMs.toFixed(2)}`,
      );

      return {
        ok: true,
        reservationIds,
      };
    } catch (err) {
      // On unexpected database error, rollback savepoint and rethrow
      try {
        await tx.unsafe(`ROLLBACK TO SAVEPOINT ${savepointName};`);
      } catch {
        // Ignore secondary rollback errors if connection was broken
      }
      throw err;
    }
  }

  /**
   * Adjusts on_hand inventory for a given variant and records an immutable movement ledger record.
   * Guarantees on_hand never drops below active reservations (throws CANNOT_REDUCE_BELOW_RESERVED).
   */
  async adjustStock(
    txOrInput: UnitOfWorkContext | AdjustStockInput,
    maybeInput?: AdjustStockInput,
  ): Promise<AdjustStockResult> {
    let tx: UnitOfWorkContext;
    let input: AdjustStockInput;

    if (maybeInput) {
      tx = txOrInput as UnitOfWorkContext;
      input = maybeInput;
    } else {
      input = txOrInput as AdjustStockInput;
      tx = this.getSql();
    }

    const { storeId, variantId, deltaOnHand, reason, operationKey, refId } = input;

    // 1. Fetch current row with store scoping
    const rows = (await tx.unsafe(
      `SELECT "store_id", "on_hand", "reserved", "version"
       FROM "inventory"
       WHERE "variant_id" = $1 AND "store_id" = $2
       FOR UPDATE;`,
      [variantId, storeId],
    )) as unknown as Array<{ store_id: string; on_hand: number; reserved: number; version: number }>;

    if (rows.length === 0) {
      throw new InventoryConstraintError('Variant not found in specified store', 'NOT_FOUND');
    }

    const current = rows[0]!;
    const newOnHand = current.on_hand + deltaOnHand;

    if (newOnHand < current.reserved) {
      throw new InventoryConstraintError(
        `Cannot reduce stock below active reserved count. Current reserved: ${current.reserved}, requested on_hand: ${newOnHand}`,
        'CANNOT_REDUCE_BELOW_RESERVED',
      );
    }

    if (newOnHand < 0) {
      throw new InventoryConstraintError(
        `Cannot reduce stock below zero. Requested on_hand: ${newOnHand}`,
        'NEGATIVE_STOCK',
      );
    }

    // 2. Update inventory on_hand
    const updateRows = (await tx.unsafe(
      `UPDATE "inventory"
       SET "on_hand" = $1,
           "version" = "version" + 1,
           "updated_at" = now()
       WHERE "variant_id" = $2 AND "store_id" = $3
       RETURNING "on_hand", "reserved";`,
      [newOnHand, variantId, storeId],
    )) as unknown as Array<{ on_hand: number; reserved: number }>;

    // 3. Append to movement ledger
    await tx.unsafe(
      `INSERT INTO "stock_movements" (
         "store_id", "variant_id", "delta_on_hand", "delta_reserved", "reason", "operation_key", "ref_id"
       ) VALUES ($1, $2, $3, 0, $4, $5, $6);`,
      [storeId, variantId, deltaOnHand, reason, operationKey, refId ?? null],
    );

    const updated = updateRows[0]!;
    const available = Math.max(0, updated.on_hand - updated.reserved);

    if (available <= 5) {
      await this.maybeEmitLowStockAlert(tx, {
        storeId,
        variantId,
        onHand: updated.on_hand,
        reserved: updated.reserved,
        available,
        threshold: 5,
      });
    }

    // 4. Audit privileged stock mutation
    await auditService.recordMutation(
      {
        storeId,
        action: 'inventory.stock_adjusted',
        entityType: 'inventory',
        entityId: variantId,
        before: { onHand: current.on_hand, reserved: current.reserved },
        after: { onHand: updated.on_hand, reserved: updated.reserved, deltaOnHand, reason, operationKey },
      },
      tx as unknown as Sql,
    );

    return {
      ok: true,
      onHand: updated.on_hand,
      reserved: updated.reserved,
      available: Math.max(0, updated.on_hand - updated.reserved),
    };
  }

  /**
   * Periodic sweep releasing expired active reservations.
   * Decrements inventory.reserved and marks stock_reservations as 'expired'.
   */
  async releaseExpiredReservations(
    batchSize = 100,
    customTx?: UnitOfWorkContext,
  ): Promise<ExpirySweepResult> {
    const tx = customTx ?? this.getSql();

    // Claim expired active reservations
    const expired = (await tx.unsafe(
      `SELECT "id", "cart_id", "variant_id", "store_id", "quantity"
       FROM "stock_reservations"
       WHERE "status" = 'active' AND "expires_at" <= now()
       ORDER BY "expires_at" ASC, "id" ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED;`,
      [batchSize],
    )) as unknown as Array<{
      id: string;
      cart_id: string;
      variant_id: string;
      store_id: string;
      quantity: number;
    }>;

    if (expired.length === 0) {
      return { releasedCount: 0, releasedUnits: 0 };
    }

    let releasedCount = 0;
    let releasedUnits = 0;

    for (const res of expired) {
      // Mark reservation status as expired
      await tx.unsafe(
        `UPDATE "stock_reservations"
         SET "status" = 'expired', "updated_at" = now()
         WHERE "id" = $1;`,
        [res.id],
      );

      // Decrement inventory.reserved
      await tx.unsafe(
        `UPDATE "inventory"
         SET "reserved" = GREATEST(0, "reserved" - $1),
             "version" = "version" + 1,
             "updated_at" = now()
         WHERE "variant_id" = $2;`,
        [res.quantity, res.variant_id],
      );

      // Record movement ledger
      await tx.unsafe(
        `INSERT INTO "stock_movements" (
           "store_id", "variant_id", "delta_on_hand", "delta_reserved", "reason", "operation_key", "ref_id"
         ) VALUES ($1, $2, 0, -$3, 'reservation_expired', $4, $5)
         ON CONFLICT ("operation_key", "variant_id", "reason") DO NOTHING;`,
        [
          res.store_id,
          res.variant_id,
          res.quantity,
          `expire:${res.id}`,
          res.cart_id,
        ],
      );

      releasedCount += 1;
      releasedUnits += res.quantity;
    }

    console.info(
      `[inventory.expiry-sweep] Released ${releasedCount} reservations (${releasedUnits} units).`,
    );

    return { releasedCount, releasedUnits };
  }

  /**
   * Confirms active stock reservations for a checkout/order upon successful payment (T051).
   * Decrements both on_hand and reserved by the reserved quantity,
   * transitions reservation status to 'consumed', and records 'order_fulfillment' in stock_movements.
   */
  async confirmReservation(
    txOrCheckoutId: UnitOfWorkContext | string,
    maybeCheckoutId?: string,
  ): Promise<{ confirmedCount: number; confirmedUnits: number }> {
    let tx: UnitOfWorkContext;
    let checkoutId: string;

    if (maybeCheckoutId) {
      tx = txOrCheckoutId as UnitOfWorkContext;
      checkoutId = maybeCheckoutId;
    } else {
      checkoutId = txOrCheckoutId as string;
      tx = this.getSql();
    }

    const reservations = (await tx.unsafe(
      `SELECT "id", "cart_id", "variant_id", "store_id", "quantity"
       FROM "stock_reservations"
       WHERE "cart_id" = $1 AND "status" = 'active'
       FOR UPDATE;`,
      [checkoutId],
    )) as unknown as Array<{
      id: string;
      cart_id: string;
      variant_id: string;
      store_id: string;
      quantity: number;
    }>;

    if (reservations.length === 0) {
      return { confirmedCount: 0, confirmedUnits: 0 };
    }

    let confirmedCount = 0;
    let confirmedUnits = 0;

    for (const res of reservations) {
      await tx.unsafe(
        `UPDATE "stock_reservations"
         SET "status" = 'consumed', "updated_at" = now()
         WHERE "id" = $1;`,
        [res.id],
      );

      await tx.unsafe(
        `UPDATE "inventory"
         SET "on_hand" = GREATEST(0, "on_hand" - $1),
             "reserved" = GREATEST(0, "reserved" - $1),
             "version" = "version" + 1,
             "updated_at" = now()
         WHERE "variant_id" = $2;`,
        [res.quantity, res.variant_id],
      );

      await tx.unsafe(
        `INSERT INTO "stock_movements" (
           "store_id", "variant_id", "delta_on_hand", "delta_reserved", "reason", "operation_key", "ref_id"
         ) VALUES ($1, $2, -$3, -$3, 'order_fulfillment', $4, $5)
         ON CONFLICT ("operation_key", "variant_id", "reason") DO NOTHING;`,
        [
          res.store_id,
          res.variant_id,
          res.quantity,
          `confirm:${res.id}`,
          res.cart_id,
        ],
      );

      confirmedCount += 1;
      confirmedUnits += res.quantity;
    }

    return { confirmedCount, confirmedUnits };
  }

  /**
   * Releases active stock reservations for a checkout/order upon payment failure or cancellation (T051).
   * Decrements reserved by the reserved quantity (leaving on_hand unchanged),
   * transitions reservation status to 'released', and records 'reservation_released' in stock_movements.
   */
  async releaseReservation(
    txOrCheckoutId: UnitOfWorkContext | string,
    checkoutIdOrReason?: string,
    maybeReason?: string,
  ): Promise<{ releasedCount: number; releasedUnits: number }> {
    let tx: UnitOfWorkContext;
    let checkoutId: string;
    let _reason = 'reservation_released';

    if (typeof txOrCheckoutId === 'object' && txOrCheckoutId !== null) {
      tx = txOrCheckoutId;
      checkoutId = checkoutIdOrReason as string;
      if (maybeReason) _reason = maybeReason;
    } else {
      checkoutId = txOrCheckoutId;
      tx = this.getSql();
      if (checkoutIdOrReason) _reason = checkoutIdOrReason;
    }

    const reservations = (await tx.unsafe(
      `SELECT "id", "cart_id", "variant_id", "store_id", "quantity"
       FROM "stock_reservations"
       WHERE "cart_id" = $1 AND "status" = 'active'
       FOR UPDATE;`,
      [checkoutId],
    )) as unknown as Array<{
      id: string;
      cart_id: string;
      variant_id: string;
      store_id: string;
      quantity: number;
    }>;

    if (reservations.length === 0) {
      return { releasedCount: 0, releasedUnits: 0 };
    }

    let releasedCount = 0;
    let releasedUnits = 0;

    for (const res of reservations) {
      await tx.unsafe(
        `UPDATE "stock_reservations"
         SET "status" = 'released', "updated_at" = now()
         WHERE "id" = $1;`,
        [res.id],
      );

      await tx.unsafe(
        `UPDATE "inventory"
         SET "reserved" = GREATEST(0, "reserved" - $1),
             "version" = "version" + 1,
             "updated_at" = now()
         WHERE "variant_id" = $2;`,
        [res.quantity, res.variant_id],
      );

      await tx.unsafe(
        `INSERT INTO "stock_movements" (
           "store_id", "variant_id", "delta_on_hand", "delta_reserved", "reason", "operation_key", "ref_id"
         ) VALUES ($1, $2, 0, -$3, 'reservation_released', $4, $5)
         ON CONFLICT ("operation_key", "variant_id", "reason") DO NOTHING;`,
        [
          res.store_id,
          res.variant_id,
          res.quantity,
          `release:${res.id}`,
          res.cart_id,
        ],
      );

      releasedCount += 1;
      releasedUnits += res.quantity;
    }

    return { releasedCount, releasedUnits };
  }

  /**
   * Retrieves current stock counters for all variants in a given store.
   */
  async getStoreInventory(
    storeId: string,
    customTx?: UnitOfWorkContext,
  ): Promise<InventoryItemView[]> {
    const tx = customTx ?? this.getSql();

    const rows = (await tx.unsafe(
      `SELECT
         i."variant_id" AS "variantId",
         pv."sku",
         p."title" AS "productTitle",
         i."on_hand" AS "onHand",
         i."reserved",
         (i."on_hand" - i."reserved") AS "available",
         i."version"
       FROM "inventory" i
       JOIN "product_variants" pv ON pv."id" = i."variant_id"
       JOIN "products" p ON p."id" = pv."product_id"
       WHERE i."store_id" = $1
       ORDER BY p."title" ASC, pv."sku" ASC;`,
      [storeId],
    )) as unknown as InventoryItemView[];

    return rows;
  }

  /**
   * Retrieves append-only movement ledger history for a specific store variant.
   */
  async getVariantMovements(
    storeId: string,
    variantId: string,
    limit = 50,
    customTx?: UnitOfWorkContext,
  ): Promise<StockMovementItem[]> {
    const tx = customTx ?? this.getSql();

    const rows = (await tx.unsafe(
      `SELECT
         "id",
         "store_id" AS "storeId",
         "variant_id" AS "variantId",
         "delta_on_hand" AS "deltaOnHand",
         "delta_reserved" AS "deltaReserved",
         "reason",
         "operation_key" AS "operationKey",
         "ref_id" AS "refId",
         "created_at" AS "createdAt"
       FROM "stock_movements"
       WHERE "store_id" = $1 AND "variant_id" = $2
       ORDER BY "created_at" DESC
       LIMIT $3;`,
      [storeId, variantId, limit],
    )) as unknown as StockMovementItem[];

    return rows;
  }

  /**
   * Concurrency testing helper (T044): seeds or resets variant stock to on_hand and clears old reservations/movements.
   */
  async seedVariantStock(
    explicitVariantId?: string,
    explicitStoreId?: string,
    onHand = 50,
  ): Promise<{ variantId: string; storeId: string; onHand: number; reserved: number }> {
    const tx = this.getSql();
    let variantId = explicitVariantId;
    let storeId = explicitStoreId;

    if (!variantId) {
      const row = (await tx.unsafe(
        `SELECT "id", "store_id" FROM "product_variants" WHERE "status" = 'active' LIMIT 1;`,
      )) as unknown as Array<{ id: string; store_id: string }>;
      if (row.length === 0) {
        throw new Error('No active variant found to seed');
      }
      variantId = row[0]!.id;
      storeId = row[0]!.store_id;
    } else if (!storeId) {
      const row = (await tx.unsafe(
        `SELECT "store_id" FROM "product_variants" WHERE "id" = $1;`,
        [variantId],
      )) as unknown as Array<{ store_id: string }>;
      storeId = row[0]?.store_id;
    }

    if (!storeId) {
      throw new Error(`Store could not be resolved for variant ${variantId}`);
    }

    await tx.unsafe(`DELETE FROM "stock_reservations" WHERE "variant_id" = $1;`, [variantId]);
    await tx.unsafe(`DELETE FROM "stock_movements" WHERE "variant_id" = $1;`, [variantId]);

    await tx.unsafe(
      `INSERT INTO "inventory" ("variant_id", "store_id", "on_hand", "reserved", "updated_at")
       VALUES ($1, $2, $3, 0, now())
       ON CONFLICT ("variant_id") DO UPDATE
       SET "on_hand" = $3, "reserved" = 0, "updated_at" = now();`,
      [variantId, storeId, onHand],
    );

    return { variantId, storeId, onHand, reserved: 0 };
  }

  /**
   * Concurrency testing helper (T044): returns accurate inventory, reservation count, and ledger delta stats.
   */
  async getVariantStockStats(variantId: string): Promise<{
    variantId: string;
    onHand: number;
    reserved: number;
    available: number;
    activeReservationsCount: number;
    totalDeltaReserved: number;
  }> {
    const tx = this.getSql();
    const invRows = (await tx.unsafe(
      `SELECT "on_hand", "reserved" FROM "inventory" WHERE "variant_id" = $1;`,
      [variantId],
    )) as unknown as Array<{ on_hand: number; reserved: number }>;

    const resCountRows = (await tx.unsafe(
      `SELECT count(*)::int AS count FROM "stock_reservations" WHERE "variant_id" = $1 AND "status" = 'active';`,
      [variantId],
    )) as unknown as Array<{ count: number }>;

    const movementRows = (await tx.unsafe(
      `SELECT coalesce(sum("delta_reserved"), 0)::int AS total FROM "stock_movements" WHERE "variant_id" = $1;`,
      [variantId],
    )) as unknown as Array<{ total: number }>;

    const onHand = invRows[0]?.on_hand ?? 0;
    const reserved = invRows[0]?.reserved ?? 0;

    return {
      variantId,
      onHand,
      reserved,
      available: Math.max(0, onHand - reserved),
      activeReservationsCount: resCountRows[0]?.count ?? 0,
      totalDeltaReserved: movementRows[0]?.total ?? 0,
    };
  }
}

export const inventoryService = new InventoryService();
