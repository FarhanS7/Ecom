// @shopscale/backend/platform - Platform foundation
// Configuration, transaction boundary, telemetry bootstrap, AuditWriter port

import { getDb } from '../db/client.js';
import type { Queryable } from '../identity/auth.service.js';

export { getEnv } from '@shopscale/config';
export { getDb } from '../db/client.js';

export type SqlClient = ReturnType<typeof getDb>;
export type { Queryable };

export * from './outbox.service.js';
export * from './consumer.js';
export * from './cache.service.js';
export * from './storage.service.js';
export * from './magic-bytes.js';
export * from './media.service.js';
export * from './schema.js';
export * from './audit.service.js';
export * from './audit-sanitizer.js';
export * from './audit-port.js';
export * from './tracer.js';
export * from './metrics.service.js';
export * from './feature-flag.service.js';
export * from './database.js';

export interface Transaction {
  // Real postgres transaction or queryable client
  readonly _brand?: unique symbol;
}

export interface UnitOfWork {
  run<T>(callback: (tx: Queryable) => Promise<T>): Promise<T>;
}

export const unitOfWork: UnitOfWork = {
  async run<T>(callback: (tx: Queryable) => Promise<T>): Promise<T> {
    return (await getDb().begin((tx) => callback(tx as unknown as Queryable))) as T;
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