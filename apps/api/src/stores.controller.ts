// @shopscale/api/stores.controller - Minimal scoped store reads (T014b).
// Self-membership read only: answers "what is MY membership in this store".
// Non-members AND unknown stores share one generic 404 (no existence oracle),
// and scope is re-checked live per request — a valid JWT with a revoked
// membership is denied (proven by the store-scope HTTP suite).

import { Controller, Get, NotFoundException, Param, Req, UseGuards } from '@nestjs/common';
import { getMembership } from '@shopscale/backend';
import type { Actor } from '@shopscale/backend';
import { storeMembershipResponse } from '@shopscale/contracts';
import { SessionGuard } from './session.guard.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface GuardedRequest {
  actor?: Actor;
}

@Controller('seller/stores')
@UseGuards(SessionGuard)
export class StoresController {
  @Get(':storeId/membership')
  async membership(
    @Req() req: GuardedRequest,
    @Param('storeId') storeId: string,
  ): Promise<unknown> {
    if (!req.actor || !UUID_PATTERN.test(storeId)) {
      throw new NotFoundException('Store not found.');
    }
    const membership = await getMembership({ storeId, userId: req.actor.userId });
    if (!membership || membership.status !== 'active') {
      throw new NotFoundException('Store not found.');
    }
    return storeMembershipResponse.parse({
      storeId: membership.storeId,
      role: membership.role,
      status: membership.status,
    });
  }
}
