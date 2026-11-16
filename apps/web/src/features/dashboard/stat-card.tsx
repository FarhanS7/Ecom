// @shopscale/web features/dashboard/stat-card.tsx - Accessible metric stat card (AD-2, REQ-ENG-002 / T067).

import { Card, Tag } from '@/components/ui';

export interface StatCardProps {
  label: string;
  value: string | number;
  description?: string | undefined;
  trend?: {
    direction: 'up' | 'down' | 'neutral';
    text: string;
  } | undefined;
  testId?: string | undefined;
}

export function StatCard({
  label,
  value,
  description,
  trend,
  testId = 'stat-card',
}: StatCardProps) {
  return (
    <Card className="ss-stat-card" data-testid={testId}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-2)' }}>
        <span className="type-caption" style={{ color: 'var(--text-secondary)' }} data-testid="stat-card-label">
          {label}
        </span>
        {trend ? (
          <Tag
            tone={trend.direction === 'up' ? 'positive' : trend.direction === 'down' ? 'warning' : 'default'}
          >
            {trend.text}
          </Tag>
        ) : null}
      </div>

      <p className="type-stat" style={{ margin: '0 0 var(--space-1) 0', fontSize: '28px', fontWeight: 700 }} data-testid="stat-card-value">
        {value}
      </p>

      {description ? (
        <p className="type-caption" style={{ margin: 0, color: 'var(--text-secondary)' }} data-testid="stat-card-description">
          {description}
        </p>
      ) : null}
    </Card>
  );
}
