// @shopscale/api/health-probe.service - Injectable wrapper over the pure
// backend health builders. Dependencies are explicit @Inject() tokens because
// the test runner (esbuild/vite) does not emit design:paramtypes metadata;
// constructor types alone cannot drive DI under vitest. This works
// identically in production builds (tsc emits metadata, explicit tokens win).

import { Inject, Injectable, Optional } from '@nestjs/common';
import { buildLivenessBody, buildReadiness, defaultHealthDeps } from '@shopscale/backend';
import type { HealthDeps } from '@shopscale/backend';

export const HEALTH_DEPS = 'HEALTH_DEPS';

@Injectable()
export class HealthProbeService {
  constructor(@Optional() @Inject(HEALTH_DEPS) private readonly deps?: HealthDeps) {}

  live(): { status: 'ok' } {
    return buildLivenessBody();
  }

  ready(): Promise<{ httpStatus: 200 | 503; body: unknown }> {
    return buildReadiness(this.deps ?? defaultHealthDeps());
  }
}
