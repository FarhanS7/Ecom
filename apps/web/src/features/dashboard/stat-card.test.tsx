// @shopscale/web features/dashboard/stat-card.test.tsx - Unit tests for StatCard (AD-2, REQ-ENG-002 / T067).

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { StatCard } from './stat-card';

describe('StatCard (T067)', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders metric label and formatted value', () => {
    render(<StatCard label="Gross Revenue" value="$45,200.00" />);

    expect(screen.getByTestId('stat-card-label')).toHaveTextContent('Gross Revenue');
    expect(screen.getByTestId('stat-card-value')).toHaveTextContent('$45,200.00');
  });

  it('renders description and trend badge when provided', () => {
    render(
      <StatCard
        label="Orders"
        value={150}
        description="Completed orders"
        trend={{ direction: 'up', text: '+12% vs last month' }}
      />,
    );

    expect(screen.getByTestId('stat-card-description')).toHaveTextContent('Completed orders');
    expect(screen.getByText('+12% vs last month')).toBeInTheDocument();
  });
});
