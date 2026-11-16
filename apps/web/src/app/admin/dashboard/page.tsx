// @shopscale/web app/admin/dashboard/page.tsx - Platform admin operations & GMV dashboard (AD-2, REQ-ENG-002 / T067).

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { PlatformAnalyticsSummaryDto } from '@shopscale/contracts';
import { Card } from '@/components/ui';
import { apiBaseUrl } from '@/lib/api';
import { formatPrice } from '@/lib/price';
import { currentSessionEmail } from '@/lib/session-server';
import { StatCard } from '@/features/dashboard/stat-card';
import { RevenueBarChart } from '@/features/dashboard/revenue-chart';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Platform Admin Dashboard',
};

async function loadPlatformAnalytics(): Promise<PlatformAnalyticsSummaryDto | null> {
  let base: string;
  try {
    base = apiBaseUrl();
  } catch {
    return null;
  }

  try {
    const res = await fetch(`${base}/v1/admin/analytics`, {
      headers: {
        cookie: cookies().toString(),
        accept: 'application/json',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return null;
    }

    return (await res.json()) as PlatformAnalyticsSummaryDto;
  } catch {
    return null;
  }
}

export default async function PlatformAdminDashboardPage() {
  const email = await currentSessionEmail();
  if (!email) {
    redirect('/login?next=/admin/dashboard');
  }

  const analytics = await loadPlatformAnalytics();
  if (!analytics) {
    return (
      <section className="ss-admin-dashboard" style={{ padding: 'var(--space-6)', maxWidth: '1200px', margin: '0 auto' }}>
        <Card className="ss-state" style={{ padding: 'var(--space-6)', textAlign: 'center' }}>
          <h1 className="type-h3" style={{ marginBottom: 'var(--space-2)' }}>
            Access Restricted
          </h1>
          <p className="type-body" style={{ color: 'var(--text-secondary)' }}>
            You do not have administrative privileges to view the platform analytics dashboard.
          </p>
        </Card>
      </section>
    );
  }

  const platformGmv = formatPrice(analytics.platformTotalGmvCents, 'USD');
  const platformAov = formatPrice(analytics.platformAvgOrderValueCents, 'USD');

  return (
    <section
      className="ss-admin-dashboard"
      style={{ padding: 'var(--space-6)', maxWidth: '1200px', margin: '0 auto' }}
      data-testid="admin-dashboard"
    >
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 className="type-h2" style={{ margin: '0 0 var(--space-1) 0' }}>
          Platform Marketplace Operations
        </h1>
        <p className="type-caption" style={{ color: 'var(--text-secondary)' }}>
          Network-wide GMV, order volume, and merchant performance analytics
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
          label="Marketplace GMV"
          value={platformGmv}
          description="Total platform transaction volume"
          testId="admin-stat-gmv"
        />
        <StatCard
          label="Marketplace Orders"
          value={analytics.platformTotalOrders.toLocaleString()}
          description="Total processed orders"
          testId="admin-stat-orders"
        />
        <StatCard
          label="Average Order Value"
          value={platformAov}
          description="Platform-wide order average"
          testId="admin-stat-aov"
        />
        <StatCard
          label="Top Merchants"
          value={analytics.topStores.length}
          description="Active ranked merchant stores"
          testId="admin-stat-merchants"
        />
      </div>

      <div style={{ marginBottom: 'var(--grid-gap)' }}>
        <RevenueBarChart
          data={analytics.dailyTrends}
          title="Marketplace Revenue Trend (GMV)"
        />
      </div>

      <Card className="ss-leaderboard-card">
        <h3 className="type-card-title" style={{ marginBottom: 'var(--space-3)' }}>
          Merchant Leaderboard
        </h3>
        {analytics.topStores.length === 0 ? (
          <p className="type-body-sm" style={{ color: 'var(--text-secondary)' }}>
            No merchant sales recorded yet.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="ss-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--surface-border)', textAlign: 'left' }}>
                  <th style={{ padding: '8px' }}>Store Name</th>
                  <th style={{ padding: '8px' }}>Orders</th>
                  <th style={{ padding: '8px' }}>Lifetime GMV</th>
                  <th style={{ padding: '8px' }}>Avg Order</th>
                  <th style={{ padding: '8px' }}>Last Order Date</th>
                </tr>
              </thead>
              <tbody>
                {analytics.topStores.map((store) => (
                  <tr key={store.storeId} style={{ borderBottom: '1px solid var(--surface-border)' }}>
                    <td style={{ padding: '8px' }}>
                      <strong>{store.storeName}</strong>
                      <span className="type-caption" style={{ display: 'block', color: 'var(--text-secondary)' }}>
                        /{store.storeSlug}
                      </span>
                    </td>
                    <td style={{ padding: '8px' }}>{store.totalOrders.toLocaleString()}</td>
                    <td style={{ padding: '8px' }}>{formatPrice(store.lifetimeGmvCents, 'USD')}</td>
                    <td style={{ padding: '8px' }}>{formatPrice(store.avgOrderValueCents, 'USD')}</td>
                    <td style={{ padding: '8px' }}>
                      {store.lastOrderAt ? new Date(store.lastOrderAt).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </section>
  );
}
