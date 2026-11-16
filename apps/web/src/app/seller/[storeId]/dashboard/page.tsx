// @shopscale/web app/seller/[storeId]/dashboard/page.tsx - Store sales analytics dashboard (AD-2, REQ-ENG-002 / T067).

import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import type { StoreAnalyticsSummaryDto } from '@shopscale/contracts';
import { Card } from '@/components/ui';
import { apiBaseUrl } from '@/lib/api';
import { formatPrice } from '@/lib/price';
import { StatCard } from '@/features/dashboard/stat-card';
import { RevenueBarChart } from '@/features/dashboard/revenue-chart';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Store Analytics Dashboard',
};

async function loadStoreAnalytics(storeId: string): Promise<StoreAnalyticsSummaryDto | null> {
  let base: string;
  try {
    base = apiBaseUrl();
  } catch {
    return null;
  }

  try {
    const res = await fetch(`${base}/v1/seller/stores/${encodeURIComponent(storeId)}/analytics`, {
      headers: {
        cookie: cookies().toString(),
        accept: 'application/json',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      if (res.status === 404) return null;
      return null;
    }

    return (await res.json()) as StoreAnalyticsSummaryDto;
  } catch {
    return null;
  }
}

export default async function SellerDashboardPage({
  params,
}: {
  params: { storeId: string };
}) {
  const analytics = await loadStoreAnalytics(params.storeId);

  if (!analytics) {
    notFound();
  }

  const grossRevenue = formatPrice(analytics.totalGmvCents, 'USD');
  const avgOrderValue = formatPrice(analytics.avgOrderValueCents, 'USD');

  return (
    <div className="ss-seller-dashboard" data-testid="seller-dashboard">
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <h2 className="type-h2" style={{ margin: '0 0 var(--space-1) 0' }}>
          Store Performance Overview
        </h2>
        <p className="type-caption" style={{ color: 'var(--text-secondary)' }}>
          Real-time metrics calculated from delivered and paid store orders
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 'var(--grid-gap)',
          marginBottom: 'var(--grid-gap)',
        }}
      >
        <StatCard
          label="Gross Revenue"
          value={grossRevenue}
          description="Lifetime GMV for this store"
          testId="stat-gmv"
        />
        <StatCard
          label="Total Orders"
          value={analytics.totalOrders.toLocaleString()}
          description="Customer suborders fulfilled"
          testId="stat-orders"
        />
        <StatCard
          label="Units Sold"
          value={analytics.totalUnitsSold.toLocaleString()}
          description="Total product items purchased"
          testId="stat-units"
        />
        <StatCard
          label="Average Order Value"
          value={avgOrderValue}
          description="Average revenue per order"
          testId="stat-aov"
        />
      </div>

      <div style={{ marginBottom: 'var(--grid-gap)' }}>
        <RevenueBarChart
          data={analytics.dailyTrends}
          title="Daily Sales Trend (GMV)"
        />
      </div>

      {analytics.dailyTrends.length > 0 ? (
        <Card className="ss-breakdown-card">
          <h3 className="type-card-title" style={{ marginBottom: 'var(--space-3)' }}>
            Daily Breakdown
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="ss-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--surface-border)', textAlign: 'left' }}>
                  <th style={{ padding: '8px' }}>Date</th>
                  <th style={{ padding: '8px' }}>Orders</th>
                  <th style={{ padding: '8px' }}>Units</th>
                  <th style={{ padding: '8px' }}>GMV</th>
                  <th style={{ padding: '8px' }}>Avg Order</th>
                </tr>
              </thead>
              <tbody>
                {analytics.dailyTrends.map((trend) => (
                  <tr key={trend.day} style={{ borderBottom: '1px solid var(--surface-border)' }}>
                    <td style={{ padding: '8px' }}>{trend.day}</td>
                    <td style={{ padding: '8px' }}>{trend.ordersCount}</td>
                    <td style={{ padding: '8px' }}>{trend.unitsSold}</td>
                    <td style={{ padding: '8px' }}>{formatPrice(trend.gmvCents, 'USD')}</td>
                    <td style={{ padding: '8px' }}>{formatPrice(trend.avgOrderValueCents, 'USD')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
