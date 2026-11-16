// packages/backend/src/reporting/analytics.service.ts - Fast scoped sales read models and reporting engine (AD-2, REQ-ENG-002 / T066).

import type { Sql, TransactionSql } from 'postgres';
import type {
  DailySalesPointDto,
  PlatformAnalyticsSummaryDto,
  StoreAnalyticsSummaryDto,
  TopSellerSummaryDto,
} from '@shopscale/contracts';
import { getDb } from '../db/client.js';

export type ReportingSqlOrTx =
  | Sql
  | TransactionSql
  | {
      unsafe: (query: string, params?: unknown[]) => Promise<unknown[]>;
    };

function asSql(tx: ReportingSqlOrTx): Sql {
  return tx as unknown as Sql;
}

export class AnalyticsQueryService {
  constructor(private readonly explicitSql?: Sql) {}

  /**
   * Refreshes the reporting materialized views concurrently.
   * If a concurrent refresh fails due to lock contention or unpopulated state,
   * falls back safely to standard refresh.
   */
  async refreshMaterializedViews(
    concurrently = true,
    txOverride?: ReportingSqlOrTx,
  ): Promise<{ refreshed: boolean; durationMs: number }> {
    const sql = txOverride ? asSql(txOverride) : this.getSql();
    const start = Date.now();

    try {
      if (concurrently) {
        await sql.unsafe('REFRESH MATERIALIZED VIEW CONCURRENTLY "mv_daily_sales";');
        await sql.unsafe('REFRESH MATERIALIZED VIEW CONCURRENTLY "mv_store_performance";');
      } else {
        await sql.unsafe('REFRESH MATERIALIZED VIEW "mv_daily_sales";');
        await sql.unsafe('REFRESH MATERIALIZED VIEW "mv_store_performance";');
      }
    } catch {
      // Fallback to standard refresh on initial unpopulated state or lock contention
      await sql.unsafe('REFRESH MATERIALIZED VIEW "mv_daily_sales";');
      await sql.unsafe('REFRESH MATERIALIZED VIEW "mv_store_performance";');
    }

    return {
      refreshed: true,
      durationMs: Date.now() - start,
    };
  }

  /**
   * Retrieves scoped sales analytics for a specific store.
   * Strictly enforces store scoping by querying where store_id = $storeId.
   */
  async getStoreAnalytics(
    storeId: string,
    options?: { from?: Date | undefined; to?: Date | undefined },
    txOverride?: ReportingSqlOrTx,
  ): Promise<StoreAnalyticsSummaryDto> {
    const sql = txOverride ? asSql(txOverride) : this.getSql();

    const fromDate = options?.from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = options?.to ?? new Date();

    const fromDay = fromDate.toISOString().split('T')[0]!;
    const toDay = toDate.toISOString().split('T')[0]!;

    const dailyRows = (await sql`
      SELECT
        day::text AS day,
        orders_count,
        units_sold,
        gmv_cents,
        net_sales_cents,
        avg_order_value_cents
      FROM mv_daily_sales
      WHERE store_id = ${storeId}
        AND day >= ${fromDay}::date
        AND day <= ${toDay}::date
      ORDER BY day ASC;
    `) as unknown as Array<{
      day: string;
      orders_count: number;
      units_sold: number;
      gmv_cents: string | number;
      net_sales_cents: string | number;
      avg_order_value_cents: number;
    }>;

    const perfRows = (await sql`
      SELECT
        total_orders,
        lifetime_gmv_cents,
        avg_order_value_cents
      FROM mv_store_performance
      WHERE store_id = ${storeId};
    `) as unknown as Array<{
      total_orders: number;
      lifetime_gmv_cents: string | number;
      avg_order_value_cents: number;
    }>;

    const perf = perfRows[0];
    const totalOrders = perf?.total_orders ?? 0;
    const totalGmvCents = Number(perf?.lifetime_gmv_cents ?? 0);
    const avgOrderValueCents = perf?.avg_order_value_cents ?? 0;

    let totalUnitsSold = 0;
    const dailyTrends: DailySalesPointDto[] = dailyRows.map((r) => {
      totalUnitsSold += r.units_sold;
      return {
        day: r.day,
        ordersCount: r.orders_count,
        unitsSold: r.units_sold,
        gmvCents: Number(r.gmv_cents),
        netSalesCents: Number(r.net_sales_cents),
        avgOrderValueCents: r.avg_order_value_cents,
      };
    });

    return {
      storeId,
      totalOrders,
      totalGmvCents,
      totalUnitsSold,
      avgOrderValueCents,
      dailyTrends,
    };
  }

  /**
   * Retrieves platform-wide aggregated analytics and top-performing stores.
   * Reserved for platform admin dashboards (AD-2).
   */
  async getPlatformAnalytics(
    options?: { from?: Date | undefined; to?: Date | undefined; topLimit?: number | undefined },
    txOverride?: ReportingSqlOrTx,
  ): Promise<PlatformAnalyticsSummaryDto> {
    const sql = txOverride ? asSql(txOverride) : this.getSql();

    const fromDate = options?.from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = options?.to ?? new Date();
    const topLimit = options?.topLimit ?? 10;

    const fromDay = fromDate.toISOString().split('T')[0]!;
    const toDay = toDate.toISOString().split('T')[0]!;

    // Daily platform trends aggregated across all stores
    const trendRows = (await sql`
      SELECT
        day::text AS day,
        SUM(orders_count)::integer AS orders_count,
        SUM(units_sold)::integer AS units_sold,
        SUM(gmv_cents)::bigint AS gmv_cents,
        SUM(net_sales_cents)::bigint AS net_sales_cents,
        CASE
          WHEN SUM(orders_count) > 0 THEN (SUM(gmv_cents) / SUM(orders_count))::integer
          ELSE 0
        END AS avg_order_value_cents
      FROM mv_daily_sales
      WHERE day >= ${fromDay}::date
        AND day <= ${toDay}::date
      GROUP BY day
      ORDER BY day ASC;
    `) as unknown as Array<{
      day: string;
      orders_count: number;
      units_sold: number;
      gmv_cents: string | number;
      net_sales_cents: string | number;
      avg_order_value_cents: number;
    }>;

    // Top stores ranked by lifetime GMV
    const topStoreRows = (await sql`
      SELECT
        store_id,
        store_name,
        store_slug,
        total_orders,
        lifetime_gmv_cents,
        avg_order_value_cents,
        last_order_at
      FROM mv_store_performance
      ORDER BY lifetime_gmv_cents DESC, total_orders DESC
      LIMIT ${topLimit};
    `) as unknown as Array<{
      store_id: string;
      store_name: string;
      store_slug: string;
      total_orders: number;
      lifetime_gmv_cents: string | number;
      avg_order_value_cents: number;
      last_order_at: Date | null;
    }>;

    let platformTotalOrders = 0;
    let platformTotalGmvCents = 0;

    const dailyTrends: DailySalesPointDto[] = trendRows.map((r) => {
      platformTotalOrders += r.orders_count;
      platformTotalGmvCents += Number(r.gmv_cents);
      return {
        day: r.day,
        ordersCount: r.orders_count,
        unitsSold: r.units_sold,
        gmvCents: Number(r.gmv_cents),
        netSalesCents: Number(r.net_sales_cents),
        avgOrderValueCents: r.avg_order_value_cents,
      };
    });

    const platformAvgOrderValueCents =
      platformTotalOrders > 0
        ? Math.round(platformTotalGmvCents / platformTotalOrders)
        : 0;

    const topStores: TopSellerSummaryDto[] = topStoreRows.map((r) => ({
      storeId: r.store_id,
      storeName: r.store_name,
      storeSlug: r.store_slug,
      totalOrders: r.total_orders,
      lifetimeGmvCents: Number(r.lifetime_gmv_cents),
      avgOrderValueCents: r.avg_order_value_cents,
      lastOrderAt: r.last_order_at ? r.last_order_at.toISOString() : null,
    }));

    return {
      platformTotalOrders,
      platformTotalGmvCents,
      platformAvgOrderValueCents,
      topStores,
      dailyTrends,
    };
  }

  private getSql(): Sql {
    return this.explicitSql ?? getDb();
  }
}

export const analyticsQueryService = new AnalyticsQueryService();
