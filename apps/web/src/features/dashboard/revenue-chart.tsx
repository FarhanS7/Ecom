'use client';

// @shopscale/web features/dashboard/revenue-chart.tsx - Responsive accessible revenue trend chart (AD-2, REQ-ENG-002 / T067).

import { Card } from '@/components/ui';
import { formatPrice } from '@/lib/price';

export interface RevenueBarChartProps {
  data: Array<{
    day: string;
    gmvCents: number;
    ordersCount: number;
  }>;
  currency?: string | undefined;
  title?: string | undefined;
}

export function RevenueBarChart({
  data,
  currency = 'USD',
  title = 'Revenue Trend (Daily GMV)',
}: RevenueBarChartProps) {
  const maxGmv = Math.max(...data.map((d) => d.gmvCents), 1);

  return (
    <Card className="ss-revenue-chart-card" data-testid="revenue-chart">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
        <h3 className="type-card-title">{title}</h3>
        <span className="type-caption" style={{ color: 'var(--text-secondary)' }}>
          {data.length} {data.length === 1 ? 'day' : 'days'}
        </span>
      </div>

      {data.length === 0 ? (
        <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <p className="type-body-sm">No sales data recorded for the selected period.</p>
        </div>
      ) : (
        <div
          className="ss-chart-container"
          role="img"
          aria-label={`${title}: ${data.length} days of sales data`}
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: '8px',
            height: '180px',
            paddingTop: '20px',
            borderBottom: '1px solid var(--surface-border)',
          }}
        >
          {data.map((point) => {
            const heightPct = Math.max(Math.round((point.gmvCents / maxGmv) * 100), 4);
            const formattedPrice = formatPrice(point.gmvCents, currency);
            const shortDate = point.day.slice(5); // MM-DD

            return (
              <div
                key={point.day}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  height: '100%',
                  justifyContent: 'flex-end',
                }}
                title={`${point.day}: ${formattedPrice} (${point.ordersCount} orders)`}
              >
                <div
                  data-testid="chart-bar"
                  style={{
                    width: '100%',
                    height: `${heightPct}%`,
                    backgroundColor: 'var(--color-brand)',
                    borderRadius: '4px 4px 0 0',
                    transition: 'height 0.2s ease',
                    opacity: point.gmvCents > 0 ? 0.9 : 0.2,
                  }}
                />
                <span
                  className="type-caption"
                  style={{
                    fontSize: '11px',
                    color: 'var(--text-secondary)',
                    marginTop: '6px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {shortDate}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
