// @shopscale/api/stores.controller - Minimal scoped store reads (T014b).
// Self-membership read only: answers "what is MY membership in this store".
// Non-members AND unknown stores share one generic 404 (no existence oracle),
// and scope is re-checked live per request — a valid JWT with a revoked
// membership is denied (proven by the store-scope HTTP suite).

import { Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { OnboardingError, getMembership, inviteMember, updateMember } from '@shopscale/backend';
import type { Actor } from '@shopscale/backend';
import {
  invitationCreateRequest,
  invitationResponse,
  memberResponse,
  memberUpdateRequest,
  storeMembershipResponse,
} from '@shopscale/contracts';
import { SessionGuard } from './session.guard.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface GuardedRequest {
  actor?: Actor;
  requestId?: string;
}

function requestIdOf(req: GuardedRequest): string {
  return typeof req.requestId === 'string' ? req.requestId : randomUUID();
}

function toOnboardingError(err: unknown): never {
  if (err instanceof OnboardingError) {
    if (err.failure === 'NOT_FOUND') throw new NotFoundException('Store not found.');
    if (err.failure === 'FORBIDDEN') throw new ForbiddenException('Forbidden.');
    throw new ConflictException(err.message);
  }
  throw err;
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

  @Post(':storeId/invitations')
  @HttpCode(201)
  async invite(
    @Req() req: GuardedRequest,
    @Param('storeId') storeId: string,
    @Body() rawBody: unknown,
  ): Promise<unknown> {
    if (!req.actor || !UUID_PATTERN.test(storeId)) {
      throw new NotFoundException('Store not found.');
    }
    // Malformed bodies share the generic 404 on scoped routes (deliberate
    // deviation from the 422 convention): distinguishing "bad input" from
    // "no such store / no membership" would oracle store existence.
    const parsed = invitationCreateRequest.safeParse(rawBody);
    if (!parsed.success) {
      throw new NotFoundException('Store not found.');
    }
    try {
      const out = await inviteMember({
        storeId,
        actorId: req.actor.userId,
        email: parsed.data.email,
        role: parsed.data.role,
        requestId: requestIdOf(req),
      });
      return invitationResponse.parse(out);
    } catch (err) {
      toOnboardingError(err);
    }
  }

  @Patch(':storeId/members/:userId')
  @HttpCode(200)
  async updateMember(
    @Req() req: GuardedRequest,
    @Param('storeId') storeId: string,
    @Param('userId') userId: string,
    @Body() rawBody: unknown,
  ): Promise<unknown> {
    if (!req.actor || !UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(userId)) {
      throw new NotFoundException('Store not found.');
    }
    // Same no-oracle rule as above: malformed input is indistinguishable
    // from missing scope on these routes.
    const parsed = memberUpdateRequest.safeParse(rawBody);
    if (!parsed.success) {
      throw new NotFoundException('Store not found.');
    }
    try {
      const out = await updateMember({
        storeId,
        actorId: req.actor.userId,
        targetUserId: userId,
        role: parsed.data.role,
        status: parsed.data.status,
        requestId: requestIdOf(req),
      });
      return memberResponse.parse(out);
    } catch (err) {
      toOnboardingError(err);
    }
  }
}
