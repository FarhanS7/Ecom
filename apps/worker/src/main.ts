// @shopscale/worker - Background worker entry point (T029 Outbox Relay, T030 Search Consumer).
import http from 'node:http';
import { getEnv } from '@shopscale/config';
import { getDb, metricsService } from '@shopscale/backend';
import { BullMQEventPublisher, OutboxRelay } from './relay/outbox-relay.js';
import { DomainEventsConsumer } from './consumers/domain-events.consumer.js';
import { ExpiryScheduler } from './schedulers/expiry.scheduler.js';
import { ReconciliationScheduler } from './schedulers/reconciliation.scheduler.js';
import { ReportingScheduler } from './schedulers/reporting.scheduler.js';
import { SettlementScheduler } from './schedulers/settlement.scheduler.js';
import { initTracing, shutdownTracing } from './tracing.js';

initTracing('shopscale-worker');

const env = getEnv();

console.log('Worker starting...');
console.log(`NODE_ENV: ${env.NODE_ENV}`);

const sql = getDb();
const redisUrl = env.REDIS_JOBS_URL || env.REDIS_CACHE_URL;
const publisher = new BullMQEventPublisher('domain-events', { url: redisUrl });

const outboxRelay = new OutboxRelay(sql, publisher, {
  batchSize: 50,
  leaseDurationSeconds: 30,
  pollIntervalMs: 200,
  logger: {
    info: (msg, ...args) => console.log(`[OutboxRelay] ${msg}`, ...args),
    warn: (msg, ...args) => console.warn(`[OutboxRelay] ${msg}`, ...args),
    error: (msg, ...args) => console.error(`[OutboxRelay] ${msg}`, ...args),
  },
});

outboxRelay.start();
console.log('OutboxRelay started.');

const domainEventsConsumer = new DomainEventsConsumer(sql, 'domain-events', {
  concurrency: 5,
  connection: { url: redisUrl },
  logger: {
    info: (msg, ...args) => console.log(`[DomainEventsConsumer] ${msg}`, ...args),
    warn: (msg, ...args) => console.warn(`[DomainEventsConsumer] ${msg}`, ...args),
    error: (msg, ...args) => console.error(`[DomainEventsConsumer] ${msg}`, ...args),
  },
});
console.log('DomainEventsConsumer started.');

const expiryScheduler = new ExpiryScheduler('inventory-expiry', {
  connection: { url: redisUrl },
  batchSize: 100,
  sweepIntervalMs: 60_000,
  logger: {
    info: (msg, ...args) => console.log(`[ExpiryScheduler] ${msg}`, ...args),
    warn: (msg, ...args) => console.warn(`[ExpiryScheduler] ${msg}`, ...args),
    error: (msg, ...args) => console.error(`[ExpiryScheduler] ${msg}`, ...args),
  },
});
void expiryScheduler.start();
console.log('ExpiryScheduler started.');

const reconciliationScheduler = new ReconciliationScheduler('payment-reconciliation', {
  connection: { url: redisUrl },
  batchSize: 50,
  sweepIntervalMs: 300_000, // Every 5 minutes
  logger: {
    info: (msg, ...args) => console.log(`[ReconciliationScheduler] ${msg}`, ...args),
    warn: (msg, ...args) => console.warn(`[ReconciliationScheduler] ${msg}`, ...args),
    error: (msg, ...args) => console.error(`[ReconciliationScheduler] ${msg}`, ...args),
  },
});
void reconciliationScheduler.start();
console.log('ReconciliationScheduler started.');

const reportingScheduler = new ReportingScheduler('reporting-refresh', {
  connection: { url: redisUrl },
  refreshIntervalMs: 3_600_000, // Every 1 hour
  logger: {
    info: (msg, ...args) => console.log(`[ReportingScheduler] ${msg}`, ...args),
    warn: (msg, ...args) => console.warn(`[ReportingScheduler] ${msg}`, ...args),
    error: (msg, ...args) => console.error(`[ReportingScheduler] ${msg}`, ...args),
  },
});
void reportingScheduler.start();
console.log('ReportingScheduler started.');

const settlementScheduler = new SettlementScheduler('seller-settlements', {
  connection: { url: redisUrl },
  intervalMs: 86_400_000, // Every 24 hours
  logger: {
    info: (msg, ...args) => console.log(`[SettlementScheduler] ${msg}`, ...args),
    warn: (msg, ...args) => console.warn(`[SettlementScheduler] ${msg}`, ...args),
    error: (msg, ...args) => console.error(`[SettlementScheduler] ${msg}`, ...args),
  },
});
void settlementScheduler.start();
console.log('SettlementScheduler started.');

// Worker metrics exporter (T072)
const metricsPort = Number(process.env['WORKER_METRICS_PORT'] || 9102);
const metricsServer = http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/metrics' || req.url?.startsWith('/metrics?'))) {
    void (async () => {
      try {
        const lag = await outboxRelay.getQueueLagSeconds().catch(() => 0);
        metricsService.setOutboxLag(lag);
        const data = await metricsService.getMetrics();
        res.writeHead(200, { 'Content-Type': metricsService.getContentType() });
        res.end(data);
      } catch {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Error collecting metrics');
      }
    })();
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

metricsServer.listen(metricsPort, '0.0.0.0', () => {
  console.log(`Worker metrics server listening on port ${metricsPort}`);
});

// Graceful shutdown
let isShuttingDown = false;
const shutdown = async (signal: string): Promise<void> => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`${signal} received, shutting down gracefully...`);
  try {
    await new Promise<void>((resolve) => {
      metricsServer.close(() => resolve());
    });
    await settlementScheduler.close();
    await reportingScheduler.close();
    await reconciliationScheduler.close();
    await expiryScheduler.close();
    await outboxRelay.stop();
    await domainEventsConsumer.close();
    await publisher.close();
    await shutdownTracing();
    await sql.end({ timeout: 5 });
    console.log('Worker stopped cleanly.');
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err);
    process.exit(1);
  }
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
