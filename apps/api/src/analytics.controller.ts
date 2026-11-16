// @shopscale/api/analytics.controller - Scoped sales analytics and platform GMV endpoints (AD-2, REQ-ENG-002 / T066, T067).

import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  analyticsQueryService,
  authorizeStore,
  requirePlatformAdmin,
  type Actor,
} from '@shopscale/backend';
import {
  platformAnalyticsSummarySchema,
  storeAnalyticsSummarySchema,
  type PlatformAnalyticsSummaryDto,
  type StoreAnalyticsSummaryDto,
} from '@shopscale/contracts';
import { SessionGuard } from './session.guard.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface GuardedRequest {
  actor?: Actor;
}

function notFound(): never {
  throw new NotFoundException('Not found.');
}

@Controller()
@UseGuards(SessionGuard)
export class AnalyticsController {
  private async gateStore(req: GuardedRequest, storeId: string): Promise<void> {
    if (!UUID_PATTERN.test(storeId)) notFound();
    if (!req.actor?.userId) notFound();
    try {
      const allowed = await authorizeStore({
        userId: req.actor.userId,
        storeId,
        permission: 'catalog:manage',
      });
      if (!allowed) notFound();
    } catch {
      notFound();
    }
  }

  @Get('seller/stores/:storeId/analytics')
  async getStoreAnalytics(
    @Param('storeId') storeId: string,
    @Req() req: GuardedRequest,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<StoreAnalyticsSummaryDto> {
    await this.gateStore(req, storeId);

    const options: { from?: Date; to?: Date } = {};
    if (from) {
      const parsed = new Date(from);
      if (!Number.isNaN(parsed.getTime())) options.from = parsed;
    }
    if (to) {
      const parsed = new Date(to);
      if (!Number.isNaN(parsed.getTime())) options.to = parsed;
    }

    const result = await analyticsQueryService.getStoreAnalytics(storeId, options);

    return storeAnalyticsSummarySchema.parse(result);
  }

  @Get('admin/analytics')
  async getPlatformAnalytics(
    @Req() req: GuardedRequest,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('topLimit') topLimit?: string,
  ): Promise<PlatformAnalyticsSummaryDto> {
    if (!req.actor?.userId) {
      throw new UnauthorizedException('Authentication required');
    }

    const isPlatformAdmin = req.actor.roles?.includes('admin');
    if (!isPlatformAdmin) {
      try {
        await requirePlatformAdmin(undefined, req.actor.userId);
      } catch {
        throw new ForbiddenException('Platform admin role required.');
      }
    }

    const options: { from?: Date; to?: Date; topLimit?: number } = {};
    if (from) {
      const parsed = new Date(from);
      if (!Number.isNaN(parsed.getTime())) options.from = parsed;
    }
    if (to) {
      const parsed = new Date(to);
      if (!Number.isNaN(parsed.getTime())) options.to = parsed;
    }
    if (topLimit) {
      const parsedLimit = Number.parseInt(topLimit, 10);
      if (!Number.isNaN(parsedLimit) && parsedLimit > 0) options.topLimit = parsedLimit;
    }

    const result = await analyticsQueryService.getPlatformAnalytics(options);

    return platformAnalyticsSummarySchema.parse(result);
  }
}
