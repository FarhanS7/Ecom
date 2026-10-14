// @shopscale/api/onboarding.controller - Seller applications, admin
// approval/suspension, and invitation acceptance (T015b). Cross-store and
// unknown-store cases share generic 404s (no oracle); transitions and
// duplicates are 409s with constant safe messages; admin-only routes 403.
// Validation uses explicit zod parsing (never inferred metadata — T006b rule).

import { Body, ConflictException, Controller, ForbiddenException, HttpCode, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  OnboardingError,
  acceptInvitation,
  applyForStore,
  approveStore,
  suspendStore,
} from '@shopscale/backend';
import type { Actor } from '@shopscale/backend';
import {
  adminStoreResponse,
  invitationAcceptRequest,
  memberResponse,
  sellerApplicationRequest,
  sellerApplicationResponse,
} from '@shopscale/contracts';
import { SessionGuard } from './session.guard.js';

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
    // CONFLICT messages are constant safe strings (no ids, emails, or values).
    throw new ConflictException(err.message);
  }
  throw err;
}

@Controller()
@UseGuards(SessionGuard)
export class OnboardingController {
  @Post('seller-applications')
  @HttpCode(201)
  async apply(
    @Req() req: GuardedRequest,
    @Body() rawBody: unknown,
  ): Promise<unknown> {
    if (!req.actor) throw new NotFoundException('Store not found.');
    const parsed = sellerApplicationRequest.safeParse(rawBody);
    if (!parsed.success) {
      throw new ConflictException('Invalid application.');
    }
    try {
      const out = await applyForStore(
        { userId: req.actor.userId, slug: parsed.data.slug, name: parsed.data.name, requestId: requestIdOf(req) },
      );
      return sellerApplicationResponse.parse(out);
    } catch (err) {
      toOnboardingError(err);
    }
  }

  @Post('admin/stores/:storeId/approve')
  @HttpCode(200)
  async approve(
    @Req() req: GuardedRequest,
    @Param('storeId') storeId: string,
  ): Promise<unknown> {
    if (!req.actor) throw new NotFoundException('Store not found.');
    try {
      const out = await approveStore({ storeId, actorId: req.actor.userId, requestId: requestIdOf(req) });
      return adminStoreResponse.parse(out);
    } catch (err) {
      toOnboardingError(err);
    }
  }

  @Post('admin/stores/:storeId/suspend')
  @HttpCode(200)
  async suspend(
    @Req() req: GuardedRequest,
    @Param('storeId') storeId: string,
  ): Promise<unknown> {
    if (!req.actor) throw new NotFoundException('Store not found.');
    try {
      const out = await suspendStore({ storeId, actorId: req.actor.userId, requestId: requestIdOf(req) });
      return adminStoreResponse.parse(out);
    } catch (err) {
      toOnboardingError(err);
    }
  }

  @Post('invitations/accept')
  @HttpCode(200)
  async accept(
    @Req() req: GuardedRequest,
    @Body() rawBody: unknown,
  ): Promise<unknown> {
    if (!req.actor) throw new NotFoundException('Store not found.');
    const parsed = invitationAcceptRequest.safeParse(rawBody);
    if (!parsed.success) {
      throw new NotFoundException('Invitation not found.');
    }
    try {
      const out = await acceptInvitation(
        { token: parsed.data.token, userId: req.actor.userId, requestId: requestIdOf(req) },
      );
      return memberResponse.parse({ storeId: out.storeId, userId: req.actor.userId, role: out.role, status: out.status });
    } catch (err) {
      toOnboardingError(err);
    }
  }
}
