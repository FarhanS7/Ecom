// @shopscale/worker - Background worker entry point
import { getEnv } from '@shopscale/config';

const env = getEnv();

console.log('Worker starting...');
console.log(`NODE_ENV: ${env.NODE_ENV}`);

// Graceful shutdown
const shutdown = async (signal: string) => {
  console.log(`${signal} received, shutting down gracefully...`);
  // await closeSql(); // TODO: Implement when backend exports db client
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Worker loops will be started here:
// - Outbox relay
// - Reservation expiry job
// - Payment reconciliation job
// - Notification queue processor
// - Search indexer consumer

console.log('Worker initialized. Implement worker loops in T029+ tasks.');

// Keep process alive
setInterval(() => {}, 1000);