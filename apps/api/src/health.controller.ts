// @shopscale/api/health.controller - Thin Nest adapter over the
// framework-agnostic health logic in @shopscale/backend platform.
// All status semantics and body shapes live in the backend builders so the
// HTTP contract is tested without the framework; this file only maps them
// onto routes and status codes.

import { Controller, Get, Inject, Res } from '@nestjs/common';
import { HealthProbeService } from './health-probe.service.js';

@Controller()
export class HealthController {
  // Explicit token: esbuild/vite (tests) emit no design:paramtypes, so the
  // injectable must be named, not inferred. Identical behavior in tsc builds.
  constructor(@Inject(HealthProbeService) private readonly probes: HealthProbeService) {}

  @Get('health/live')
  live(): { status: 'ok' } {
    return this.probes.live();
  }

  @Get('health/ready')
  async ready(@Res({ passthrough: true }) res: { statusCode: number }): Promise<unknown> {
    const result = await this.probes.ready();
    res.statusCode = result.httpStatus;
    return result.body;
  }
}
