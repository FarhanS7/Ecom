// @shopscale/api/stores.controller - Scoped store reads and settings management (T014b, T068).
// Self-membership read, team management, theme customizer, and store content.
// Non-members AND unknown stores share one generic 404 (no existence oracle),
// and scope is re-checked live per request — a valid JWT with a revoked
// membership is denied.

import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  OnboardingError,
  authorizeStore,
  getMembership,
  getStoreContent,
  getTheme,
  inviteMember,
  listStoreTeam,
  saveStoreContent,
  saveTheme,
  updateMember,
} from '@shopscale/backend';
import type { Actor } from '@shopscale/backend';
import {
  invitationCreateRequest,
  invitationResponse,
  memberResponse,
  memberUpdateRequest,
  storeContentSchema,
  storeMembershipResponse,
  storeTeamSummarySchema,
  themeTokensSchema,
  updateStoreContentSchema,
  updateStoreThemeSchema,
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

  @Get(':storeId/team')
  async getTeam(
    @Req() req: GuardedRequest,
    @Param('storeId') storeId: string,
  ): Promise<unknown> {
    if (!req.actor || !UUID_PATTERN.test(storeId)) {
      throw new NotFoundException('Store not found.');
    }
    try {
      const team = await listStoreTeam({ storeId, actorId: req.actor.userId });
      return storeTeamSummarySchema.parse(team);
    } catch (err) {
      toOnboardingError(err);
    }
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

  @Get(':storeId/theme')
  async getTheme(
    @Req() req: GuardedRequest,
    @Param('storeId') storeId: string,
  ): Promise<unknown> {
    if (!req.actor || !UUID_PATTERN.test(storeId)) {
      throw new NotFoundException('Store not found.');
    }
    const canRead =
      (await authorizeStore({ userId: req.actor.userId, storeId, permission: 'catalog:manage' })) ||
      (await authorizeStore({ userId: req.actor.userId, storeId, permission: 'team:manage' })) ||
      (await authorizeStore({ userId: req.actor.userId, storeId, permission: 'store:manage' }));

    if (!canRead) throw new NotFoundException('Store not found.');

    const theme = await getTheme(storeId);
    return { theme: themeTokensSchema.parse(theme) };
  }

  @Put(':storeId/theme')
  @HttpCode(200)
  async saveTheme(
    @Req() req: GuardedRequest,
    @Param('storeId') storeId: string,
    @Body() rawBody: unknown,
  ): Promise<unknown> {
    if (!req.actor || !UUID_PATTERN.test(storeId)) {
      throw new NotFoundException('Store not found.');
    }
    const parsed = updateStoreThemeSchema.safeParse(rawBody);
    const tokens = parsed.success ? parsed.data.theme : themeTokensSchema.safeParse(rawBody).data;
    if (!tokens) {
      throw new NotFoundException('Store not found.');
    }
    try {
      const saved = await saveTheme({
        storeId,
        actorId: req.actor.userId,
        tokens,
        requestId: requestIdOf(req),
      });
      return { theme: themeTokensSchema.parse(saved) };
    } catch (err) {
      toOnboardingError(err);
    }
  }

  @Get(':storeId/content')
  async getContent(
    @Req() req: GuardedRequest,
    @Param('storeId') storeId: string,
  ): Promise<unknown> {
    if (!req.actor || !UUID_PATTERN.test(storeId)) {
      throw new NotFoundException('Store not found.');
    }
    const canRead =
      (await authorizeStore({ userId: req.actor.userId, storeId, permission: 'catalog:manage' })) ||
      (await authorizeStore({ userId: req.actor.userId, storeId, permission: 'team:manage' })) ||
      (await authorizeStore({ userId: req.actor.userId, storeId, permission: 'store:manage' }));

    if (!canRead) throw new NotFoundException('Store not found.');

    const content = await getStoreContent(storeId);
    return storeContentSchema.parse(content);
  }

  @Put(':storeId/content')
  @HttpCode(200)
  async saveContent(
    @Req() req: GuardedRequest,
    @Param('storeId') storeId: string,
    @Body() rawBody: unknown,
  ): Promise<unknown> {
    if (!req.actor || !UUID_PATTERN.test(storeId)) {
      throw new NotFoundException('Store not found.');
    }
    const parsed = updateStoreContentSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new NotFoundException('Store not found.');
    }
    try {
      const saved = await saveStoreContent({
        storeId,
        actorId: req.actor.userId,
        content: parsed.data,
        requestId: requestIdOf(req),
      });
      return storeContentSchema.parse(saved);
    } catch (err) {
      toOnboardingError(err);
    }
  }
}
