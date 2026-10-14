// @shopscale/backend/db/seed - Deterministic seed script
// Usage: SEED=42 SIZE=s|m|l|xl tsx src/db/seed.ts

import { db } from './client.js';
import { getEnv } from '@shopscale/config';

const sql = db;

interface SeedOptions {
  size: 's' | 'm' | 'l' | 'xl';
  seed: number;
}

function parseArgs(): SeedOptions {
  const args = process.argv.slice(2);
  const size = (args.find((a) => a.startsWith('SIZE='))?.split('=')[1] as SeedOptions['size']) || 's';
  const seed = parseInt(args.find((a) => a.startsWith('SEED='))?.split('=')[1] || '42', 10);
  if (!['s', 'm', 'l', 'xl'].includes(size)) {
    throw new Error('SIZE must be one of: s, m, l, xl');
  }
  return { size, seed };
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

async function main() {
  const { size, seed } = parseArgs();
  const random = seededRandom(seed);
  
  console.log(`Seeding database: size=${size}, seed=${seed}`);
  console.log(`Database: ${getEnv().DATABASE_URL}`);

  // Verify connection
  await sql`SELECT 1`;
  console.log('Database connection OK');

  // TODO: Implement deterministic seeding per tier
  // Tiers from PRD Section 11.2:
  // S: 1k products, 2.5k variants, 5k orders
  // M: 10k products, 25k variants, 100k orders
  // L: 100k products, 250k variants, 1M orders
  // XL: 1M products, 2.5M variants, 10M orders

  console.log('Seed script scaffolded. Implement deterministic data generation.');
  console.log('Use pg-copy-streams for bulk COPY operations.');
  console.log('Generate realistic distributions: Zipf popularity, log-normal prices, etc.');

  await sql.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});