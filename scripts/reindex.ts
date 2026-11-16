// scripts/reindex.ts - Zero-downtime search projection reindexer CLI (T034).
// Usage: tsx scripts/reindex.ts [--batch-size=500] [--store=slug]

import { getDb, reindexService } from '@shopscale/backend';

function parseArgs(): { batchSize: number; storeSlug?: string } {
  const args = process.argv.slice(2);
  let batchSize = 500;
  let storeSlug: string | undefined;

  for (const arg of args) {
    if (arg.startsWith('--batch-size=')) {
      const parsed = parseInt(arg.split('=')[1] ?? '', 10);
      if (!isNaN(parsed) && parsed > 0) {
        batchSize = parsed;
      }
    } else if (arg.startsWith('--store=')) {
      storeSlug = arg.split('=')[1]?.trim() || undefined;
    }
  }

  return { batchSize, storeSlug };
}

async function main(): Promise<void> {
  const { batchSize, storeSlug } = parseArgs();

  console.log(`Starting search reindex...`);
  console.log(`Batch size: ${batchSize}`);
  if (storeSlug) {
    console.log(`Scoped to store: ${storeSlug}`);
  }

  try {
    const result = await reindexService.reindex({
      batchSize,
      storeSlug,
      onProgress: ({ processed, total, batchCount }) => {
        const percent = total > 0 ? ((processed / total) * 100).toFixed(1) : '100.0';
        console.log(`[Reindex] Processed ${processed}/${total} products (${percent}%) — Batch ${batchCount}`);
      },
    });

    const seconds = (result.durationMs / 1000).toFixed(2);
    const throughput =
      result.durationMs > 0
        ? Math.round((result.reindexedCount / result.durationMs) * 1000)
        : result.reindexedCount;

    console.log(`\nReindex finished successfully.`);
    console.log(`Total Products: ${result.totalProducts}`);
    console.log(`Reindexed:      ${result.reindexedCount}`);
    console.log(`Batches:        ${result.batches}`);
    console.log(`Duration:       ${seconds}s`);
    console.log(`Throughput:     ${throughput} items/s`);
  } catch (error) {
    console.error('Reindex failed with error:', error);
    process.exitCode = 1;
  } finally {
    try {
      await getDb().end({ timeout: 5 });
    } catch {
      // Ignore cleanup error
    }
  }
}

void main();
