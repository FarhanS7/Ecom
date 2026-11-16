import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { generateSoakMetrics, type SoakSummaryReport } from '../../scripts/analyze-soak.js';

describe('Endurance Soak & Contention Metrics (TASK-083, PRD 12)', () => {
  const jsonPath = path.resolve(process.cwd(), 'loadtests/results/soak-test.json');

  it('validates 1-hour sustained soak metric output', () => {
    expect(fs.existsSync(jsonPath)).toBe(true);
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as SoakSummaryReport;

    expect(data.totalDurationMinutes).toBe(60);
    expect(data.totalRequests).toBeGreaterThanOrEqual(500000);
  });

  it('proves zero memory leak with flat post-warmup regression slope', () => {
    const report = generateSoakMetrics();

    // Invariant: Net heap drift must be < 5.0 MB/hour
    expect(report.hasMemoryLeak).toBe(false);
    expect(report.heapDriftMbPerHour).toBeLessThan(5.0);

    // Peak heap must not exceed container budgets (512 MB)
    expect(report.peakHeapMb).toBeLessThan(512);
  });

  it('proves database pool health without starvation or deadlocks', () => {
    const report = generateSoakMetrics();

    // Pool utilization must not exceed max connections (10)
    expect(report.maxDbConnectionsUsed).toBeLessThanOrEqual(10);

    // Starvation events and deadlocks must be strictly zero
    expect(report.dbPoolStarvationCount).toBe(0);
    expect(report.deadlockCount).toBe(0);

    // Error rate must remain under 0.5%
    expect(report.errorRate).toBeLessThan(0.005);
  });
});
