// @shopscale/api/feature-flags.controller - Administrative feature flag management & evaluation (TASK-076).
// Invariants:
// 1. Admin endpoints (GET /v1/admin/feature-flags, PUT /v1/admin/feature-flags/:key) require platform admin role.
// 2. Non-admins receive 403 Forbidden.
// 3. Evaluation endpoint (GET /v1/feature-flags/:key/evaluate) returns flag status for caller.
// 4. Privileged mutations are audited in audit_logs.

import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Put,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  auditService,
  featureFlagService,
  requirePlatformAdmin,
  type Actor,
} from '@shopscale/backend';
import { SessionGuard } from './session.guard.js';

interface GuardedRequest {
  actor?: Actor;
}

export interface SetFeatureFlagDto {
  description?: string | null;
  enabled?: boolean;
  storeAllowlist?: string[];
  rolloutPercentage?: number;
}

@Controller()
export class FeatureFlagsController {
  @Get('admin/feature-flags')
  @UseGuards(SessionGuard)
  async listFlags(@Req() req: GuardedRequest) {
    await this.assertAdmin(req);
    return await featureFlagService.listFlags();
  }

  @Get('admin/feature-flags/:key')
  @UseGuards(SessionGuard)
  async getFlag(@Req() req: GuardedRequest, @Param('key') key: string) {
    await this.assertAdmin(req);
    const flag = await featureFlagService.getFlag(key);
    if (!flag) {
      throw new NotFoundException(`Feature flag '${key}' not found.`);
    }
    return flag;
  }

  @Put('admin/feature-flags/:key')
  @UseGuards(SessionGuard)
  async setFlag(
    @Req() req: GuardedRequest,
    @Param('key') key: string,
    @Body() body: SetFeatureFlagDto,
  ) {
    await this.assertAdmin(req);
    const updated = await featureFlagService.setFlag({
      key,
      description: body.description,
      enabled: body.enabled,
      storeAllowlist: body.storeAllowlist,
      rolloutPercentage: body.rolloutPercentage,
    });

    await auditService.recordMutation({
      action: 'feature_flag.updated',
      entityType: 'feature_flag',
      entityId: key,
      actorId: req.actor?.userId,
      before: null,
      after: { key, enabled: updated.enabled, rolloutPercentage: updated.rolloutPercentage },
    });

    return updated;
  }

  @Get('feature-flags/:key/evaluate')
  async evaluateFlag(
    @Param('key') key: string,
    @Query('storeId') storeId?: string,
  ) {
    const enabled = await featureFlagService.isEnabled(key, storeId);
    return { key, storeId: storeId ?? null, enabled };
  }

  private async assertAdmin(req: GuardedRequest): Promise<void> {
    if (!req.actor?.userId) {
      throw new UnauthorizedException();
    }
    const isPlatformAdmin = req.actor.roles?.includes('admin');
    if (!isPlatformAdmin) {
      try {
        await requirePlatformAdmin(undefined, req.actor.userId);
      } catch {
        throw new ForbiddenException('Platform administrator role required.');
      }
    }
  }
}
