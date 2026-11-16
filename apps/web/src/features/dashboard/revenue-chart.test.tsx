// @shopscale/web features/dashboard/revenue-chart.test.tsx - Unit tests for RevenueBarChart (AD-2, REQ-ENG-002 / T067).

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { RevenueBarChart } from './revenue-chart';

describe('RevenueBarChart (T067)', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders zero state when data array is empty', () => {
    render(<RevenueBarChart data={[]} />);

    expect(screen.getByText('No sales data recorded for the selected period.')).toBeInTheDocument();
  });

  it('renders bars and dates for sales trend data', () => {
    const mockData = [
      { day: '2026-11-15', gmvCents: 20000, ordersCount: 2 },
      { day: '2026-11-16', gmvCents: 50000, ordersCount: 5 },
    ];

    render(<RevenueBarChart data={mockData} title="Daily GMV" />);

    expect(screen.getByText('Daily GMV')).toBeInTheDocument();
    expect(screen.getByText('2 days')).toBeInTheDocument();
    expect(screen.getAllByTestId('chart-bar')).toHaveLength(2);
    expect(screen.getByText('11-15')).toBeInTheDocument();
    expect(screen.getByText('11-16')).toBeInTheDocument();
  });
});
