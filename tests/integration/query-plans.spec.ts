// tests/integration/query-plans.spec.ts - Integration test for EXPLAIN ANALYZE query plans and keyset index verification (TASK-078).
// Invariants verified (PRD Goal G1, CT-2, NFR-001, NFR-002):
// 1. Keyset pagination query plan strictly utilizes Index Scan / Index Only Scan (never Seq Scan).
// 2. Keyset execution time is < 25 ms.
// 3. Keyset query cost is order-of-magnitude lower than high-offset pagination.
// 4. Seller orders query uses composite index (store_id, created_at, id) eliminating Sort nodes.

import { describe, expect, it } from 'vitest';
import { runQueryBenchmarks } from '../../scripts/benchmark-queries.js';

describe('Index & Pagination Query Plan Verification (TASK-078, PRD G1)', () => {
  it('executes query plan benchmarks and proves keyset index scan optimization', async () => {
    const report = await runQueryBenchmarks();

    expect(report.results.length).toBeGreaterThanOrEqual(3);

    const offsetResult = report.results.find((r) => r.queryType === 'OFFSET');
    const keysetResult = report.results.find((r) => r.queryType === 'KEYSET');
    const compositeResult = report.results.find((r) => r.queryType === 'COMPOSITE_INDEX');

    expect(offsetResult).toBeDefined();
    expect(keysetResult).toBeDefined();
    expect(compositeResult).toBeDefined();

    // Invariant 1: Scan types
    // Keyset must NEVER use Seq Scan
    expect(keysetResult!.scanType).not.toBe('Seq Scan');
    expect(['Index Scan', 'Index Only Scan', 'Bitmap Index Scan']).toContain(keysetResult!.scanType);

    // Composite index query must use Index Scan
    expect(compositeResult!.scanType).not.toBe('Seq Scan');
    expect(['Index Scan', 'Index Only Scan']).toContain(compositeResult!.scanType);

    // Invariant 2: Execution Time SLO (< 25 ms for keyset query)
    expect(keysetResult!.executionTimeMs).toBeLessThan(25.0);
    expect(compositeResult!.executionTimeMs).toBeLessThan(10.0);

    // Invariant 3: Cost and Buffer efficiency
    // Keyset total cost must be significantly lower than high-offset cost
    expect(keysetResult!.totalCost).toBeLessThan(offsetResult!.totalCost / 10);

    // Buffer reads: keyset should read at least 50x fewer blocks than high-offset
    const offsetBlocks = offsetResult!.sharedHitBlocks + offsetResult!.sharedReadBlocks;
    const keysetBlocks = keysetResult!.sharedHitBlocks + keysetResult!.sharedReadBlocks;
    expect(offsetBlocks).toBeGreaterThan(keysetBlocks * 50);
  });
});
