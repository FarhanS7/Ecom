// @shopscale/api/audit.controller - Privileged audit logs endpoint (T062).
// Invariants:
// 1. GET /v1/admin/audit-logs: restricted strictly to platform administrators (role 'admin').
// 2. Non-admin and unauthenticated callers receive 403 Forbidden / 401 Unauthorized.
// 3. Keyset cursor pagination on (created_at DESC, id DESC).

import {
  Controller,
  ForbiddenException,
  Get,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  auditService,
  requirePlatformAdmin,
  type Actor,
  type AuditRecord,
} from '@shopscale/backend';
import { SessionGuard } from './session.guard.js';

interface GuardedRequest {
  actor?: Actor;
}

@Controller('admin/audit-logs')
@UseGuards(SessionGuard)
export class AuditController {
  @Get()
  async listAuditLogs(
    @Req() req: GuardedRequest,
    @Query('storeId') storeId?: string,
    @Query('actorId') actorId?: string,
    @Query('action') action?: string,
    @Query('entityType') entityType?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    if (!req.actor?.userId) {
      throw new UnauthorizedException();
    }

    const isPlatformAdmin = req.actor.roles?.includes('admin');
    if (!isPlatformAdmin) {
      try {
        await requirePlatformAdmin(undefined, req.actor.userId);
      } catch {
        throw new ForbiddenException('Platform admin role required.');
      }
    }

    const numLimit = limit ? parseInt(limit, 10) : undefined;
    const result = await auditService.listAuditLogs({
      storeId,
      actorId,
      action,
      entityType,
      limit: numLimit,
      cursor,
    });

    return {
      items: result.items.map((row: AuditRecord) => ({
        id: row.id,
        actorId: row.actor_id,
        storeId: row.store_id,
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        redactedBefore: row.redacted_before,
        redactedAfter: row.redacted_after,
        requestId: row.request_id,
        createdAt: row.created_at.toISOString(),
      })),
      nextCursor: result.nextCursor,
    };
  }
}
