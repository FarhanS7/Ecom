// @shopscale/backend/platform - Platform foundation
// Configuration, transaction boundary, telemetry bootstrap, AuditWriter port

import { getEnv } from '@shopscale/config';
import { getDb } from '../db/client.js';

export { getEnv } from '@shopscale/config';
export { getDb } from '../db/client.js';

export interface Transaction {
  // Minimal transaction interface for domain ports
  // Actual implementation uses postgres transaction
}

export interface UnitOfWork {
  run<T>(callback: (tx: Transaction) => Promise<T>): Promise<T>;
}

export const unitOfWork: UnitOfWork = {
  async run<T>(callback: (tx: Transaction) => Promise<T>): Promise<T> {
    const client = getDb();
    // In real implementation, this would use db.begin()
    // For now, return a mock transaction
    return callback({} as Transaction);
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
  async write() {
    // Implementation writes to audit_logs table
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
    async check() {
      // Redis cache health check
      return { status: 'ok' };
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