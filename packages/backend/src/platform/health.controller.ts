// @shopscale/backend/platform/health.controller - Health check logic.
// Framework-agnostic by module boundary: NO Nest imports here. The Nest
// adapter lives in apps/api/src/health.controller.ts and delegates to these
// builders. Response shapes are validated against @shopscale/contracts so the
// HTTP contract cannot drift from the published schemas.
//
// Redaction rule: dependency details are static strings. Provider errors,
// connection strings, and credentials must NEVER appear in bodies.

import { healthLiveResponse, healthReadyResponse } from '@shopscale/contracts';
import { z } from 'zod';
import { checkDatabaseConnection } from './database.js';
import { getDb } from '../db/client.js';

export interface DependencyCheckResult {
  status: 'ok' | 'fail';
  detail?: string | undefined;
}

export interface DependencyCheck {
  name: string;
  check: () => Promise<DependencyCheckResult>;
}

export interface HealthDeps {
  checks: DependencyCheck[];
}

export function buildLivenessBody(): { status: 'ok' } {
  // Liveness is process health only: healthy while the process serves.
  // It must NOT depend on the database (see platform spec).
  return healthLiveResponse.parse({ status: 'ok' });
}

export async function buildReadiness(deps: HealthDeps): Promise<{
  httpStatus: 200 | 503;
  body: z.infer<typeof healthReadyResponse>;
}> {
  const results = await Promise.all(
    deps.checks.map(async (c) => [c.name, await c.check()] as const),
  );
  const checks: Record<string, DependencyCheckResult> = Object.fromEntries(results);
  const allOk = Object.values(checks).every((c) => c.status === 'ok');
  const body = healthReadyResponse.parse({
    status: allOk ? 'ok' : 'degraded',
    checks,
  });
  return { httpStatus: allOk ? 200 : 503, body };
}

/** Production wiring: real database probe (T005 scope). */
export function defaultHealthDeps(): HealthDeps {
  return {
    // Only dependencies with real probes are listed. The Redis cache joins
    // when its client lands with cart/caching work — never as a faked "ok"
    // (local-development.md: omitted services say "not run", never pass fake).
    checks: [
      {
        name: 'database',
        async check(): Promise<DependencyCheckResult> {
          const result = await checkDatabaseConnection(getDb());
          if (result.ok) return { status: 'ok' };
          return { status: 'fail', detail: result.detail };
        },
      },
    ],
  };
}
