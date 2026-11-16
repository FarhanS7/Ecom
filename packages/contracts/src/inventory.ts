// @shopscale/contracts/inventory - Inventory, stock adjustment, and movement contracts (T040).
import { z } from 'zod';

export const stockAdjustmentReason = z.enum([
  'initial_stock',
  'manual_adjustment',
  'return_restock',
]);

export type StockAdjustmentReason = z.infer<typeof stockAdjustmentReason>;

export const adjustStockRequest = z.object({
  variantId: z.string().uuid(),
  deltaOnHand: z.number().int(),
  reason: stockAdjustmentReason,
});

export type AdjustStockRequest = z.infer<typeof adjustStockRequest>;

export const adjustStockResponse = z.object({
  ok: z.literal(true),
  onHand: z.number().int(),
  reserved: z.number().int(),
  available: z.number().int(),
});

export type AdjustStockResponse = z.infer<typeof adjustStockResponse>;

export const inventoryItemView = z.object({
  variantId: z.string().uuid(),
  sku: z.string(),
  productTitle: z.string().optional(),
  onHand: z.number().int(),
  reserved: z.number().int(),
  available: z.number().int(),
  version: z.number().int(),
});

export type InventoryItemView = z.infer<typeof inventoryItemView>;

export const inventoryListResponse = z.object({
  items: z.array(inventoryItemView),
});

export type InventoryListResponse = z.infer<typeof inventoryListResponse>;

export const stockMovementItem = z.object({
  id: z.string().uuid(),
  storeId: z.string().uuid(),
  variantId: z.string().uuid(),
  deltaOnHand: z.number().int(),
  deltaReserved: z.number().int(),
  reason: z.string(),
  operationKey: z.string(),
  refId: z.string().nullable().optional(),
  createdAt: z.string().or(z.date()),
});

export type StockMovementItem = z.infer<typeof stockMovementItem>;

export const stockMovementsResponse = z.object({
  items: z.array(stockMovementItem),
});

export type StockMovementsResponse = z.infer<typeof stockMovementsResponse>;
