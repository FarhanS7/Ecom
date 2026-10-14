// @shopscale/backend/platform - Platform foundation
// Configuration, transaction boundary, telemetry bootstrap, AuditWriter port

import { getDb } from '../db/client.js';

export { getEnv } from '@shopscale/config';
export { getDb } from '../db/client.js';

export interface Transaction {
  // Minimal transaction placeholder for domain ports. The brand keeps the
  // empty-interface lint rule honest until the real postgres transaction type
  // lands with outbox/worker work (T029); callers must not construct it.
  readonly _brand?: unique symbol;
}

export interface UnitOfWork {
  run<T>(callback: (tx: Transaction) => Promise<T>): Promise<T>;
}

export const unitOfWork: UnitOfWork = {
  run<T>(callback: (tx: Transaction) => Promise<T>): Promise<T> {
    // Real implementation opens db.begin() here (T029). Until then the
    // placeholder resolves without touching the database.
    const tx: Transaction = {};
    return callback(tx);
  },
};

export interface AuditWriter {
  write(params: {
    actorId: string;
    action: string;
    entityType: string;
    entityId: string;
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
    ip: string;
    requestId: string;
  }): Promise<void>;
}

export const auditWriter: AuditWriter = {
  write() {
    // Implementation writes to audit_logs table (T062).
    return Promise.resolve();
  },
};

export interface HealthCheck {
  name: string;
  check(): Promise<{ status: 'ok' | 'fail'; detail?: string }>;
}

export const healthChecks: HealthCheck[] = [
  {
    name: 'database',
    async check() {
      try {
        await getDb()`SELECT 1`;
        return { status: 'ok' };
      } catch {
        return { status: 'fail', detail: 'Database connection failed' };
      }
    },
  },
  {
    name: 'redis-cache',
    check() {
      // Redis cache health check (client arrives with cart/caching work).
      return Promise.resolve({ status: 'ok' as const });
    },
  },
];

export function isLivenessOk(): boolean {
  // Liveness is process health - always ok if process runs
  return true;
}

export async function getReadiness(): Promise<{ status: 'ok' | 'degraded'; checks: Record<string, { status: 'ok' | 'fail'; detail?: string }> }> {
  const results = await Promise.all(
    healthChecks.map(async (hc) => [hc.name, await hc.check()] as const)
  );
  const checks = Object.fromEntries(results);
  const allOk = Object.values(checks).every((c) => c.status === 'ok');
  return { status: allOk ? 'ok' : 'degraded', checks };
}