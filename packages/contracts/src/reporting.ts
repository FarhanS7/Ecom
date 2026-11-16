// packages/contracts/src/reporting.ts - Analytics and reporting read models (AD-2, REQ-ENG-002 / T066).

import { z } from 'zod';

export const dailySalesPointSchema = z.object({
  day: z.string(), // YYYY-MM-DD
  ordersCount: z.number().int().nonnegative(),
  unitsSold: z.number().int().nonnegative(),
  gmvCents: z.number().int().nonnegative(),
  netSalesCents: z.number().int().nonnegative(),
  avgOrderValueCents: z.number().int().nonnegative(),
});
export type DailySalesPointDto = z.infer<typeof dailySalesPointSchema>;

export const topSellerSummarySchema = z.object({
  storeId: z.string().uuid(),
  storeName: z.string(),
  storeSlug: z.string(),
  totalOrders: z.number().int().nonnegative(),
  lifetimeGmvCents: z.number().int().nonnegative(),
  avgOrderValueCents: z.number().int().nonnegative(),
  lastOrderAt: z.string().datetime().nullable(),
});
export type TopSellerSummaryDto = z.infer<typeof topSellerSummarySchema>;

export const storeAnalyticsSummarySchema = z.object({
  storeId: z.string().uuid(),
  totalOrders: z.number().int().nonnegative(),
  totalGmvCents: z.number().int().nonnegative(),
  totalUnitsSold: z.number().int().nonnegative(),
  avgOrderValueCents: z.number().int().nonnegative(),
  dailyTrends: z.array(dailySalesPointSchema),
});
export type StoreAnalyticsSummaryDto = z.infer<typeof storeAnalyticsSummarySchema>;

export const platformAnalyticsSummarySchema = z.object({
  platformTotalOrders: z.number().int().nonnegative(),
  platformTotalGmvCents: z.number().int().nonnegative(),
  platformAvgOrderValueCents: z.number().int().nonnegative(),
  topStores: z.array(topSellerSummarySchema),
  dailyTrends: z.array(dailySalesPointSchema),
});
export type PlatformAnalyticsSummaryDto = z.infer<typeof platformAnalyticsSummarySchema>;
