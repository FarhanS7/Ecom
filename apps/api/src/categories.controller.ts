// @shopscale/api/categories.controller - Category tree management & public hierarchy reads (T019, T069).
// Invariants:
// 1. GET /v1/categories is public for storefront navigation and faceted search.
// 2. Mutations (/v1/admin/categories/*) strictly require platform admin role.
// 3. Category cycles and FK conflicts are rejected with 409 Conflict.
// 4. Every privileged administrative modification records an immutable audit log row.

import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  CategoryError,
  createCategory,
  deleteCategory,
  listCategories,
  reparentCategory,
  recordAudit,
  requirePlatformAdmin,
  type Actor,
} from '@shopscale/backend';
import {
  categoryDtoSchema,
  categoryListResponseSchema,
  createCategoryRequestSchema,
  reparentCategoryRequestSchema,
} from '@shopscale/contracts';
import { SessionGuard } from './session.guard.js';

interface GuardedRequest {
  actor?: Actor;
  requestId?: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requestIdOf(req: GuardedRequest): string {
  return typeof req.requestId === 'string' ? req.requestId : randomUUID();
}

function handleCategoryError(err: unknown): never {
  if (err instanceof CategoryError) {
    if (err.failure === 'NOT_FOUND') {
      throw new NotFoundException(err.message);
    }
    if (err.failure === 'CATEGORY_CYCLE' || err.failure === 'CONFLICT') {
      throw new ConflictException(err.message);
    }
  }
  throw err;
}

@Controller()
export class CategoriesController {
  @Get('categories')
  async listCategories(): Promise<unknown> {
    const items = await listCategories();
    return categoryListResponseSchema.parse({ items });
  }

  @Post('admin/categories')
  @UseGuards(SessionGuard)
  @HttpCode(201)
  async createCategory(
    @Req() req: GuardedRequest,
    @Body() rawBody: unknown,
  ): Promise<unknown> {
    if (!req.actor) throw new NotFoundException('Not found.');
    await requirePlatformAdmin(undefined, req.actor.userId);

    const parsed = createCategoryRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors[0]?.message ?? 'Invalid category input.');
    }

    try {
      const created = await createCategory({
        name: parsed.data.name,
        slug: parsed.data.slug,
        parentId: parsed.data.parentId ?? null,
      });

      await recordAudit({
        actorId: req.actor.userId,
        storeId: null,
        action: 'category.created',
        entityType: 'category',
        entityId: created.id,
        before: null,
        after: { id: created.id, name: created.name, slug: created.slug, path: created.path, parentId: created.parentId },
        requestId: requestIdOf(req),
      });

      return categoryDtoSchema.parse(created);
    } catch (err) {
      handleCategoryError(err);
    }
  }

  @Put('admin/categories/:id/parent')
  @UseGuards(SessionGuard)
  @HttpCode(200)
  async reparentCategory(
    @Req() req: GuardedRequest,
    @Param('id') id: string,
    @Body() rawBody: unknown,
  ): Promise<unknown> {
    if (!req.actor) throw new NotFoundException('Not found.');
    if (!UUID_PATTERN.test(id)) throw new NotFoundException('Category not found.');
    await requirePlatformAdmin(undefined, req.actor.userId);

    const parsed = reparentCategoryRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException('Invalid parent category.');
    }

    try {
      const updated = await reparentCategory(id, parsed.data.parentId);

      await recordAudit({
        actorId: req.actor.userId,
        storeId: null,
        action: 'category.reparented',
        entityType: 'category',
        entityId: updated.id,
        before: null,
        after: { id: updated.id, parentId: updated.parentId, path: updated.path },
        requestId: requestIdOf(req),
      });

      return categoryDtoSchema.parse(updated);
    } catch (err) {
      handleCategoryError(err);
    }
  }

  @Delete('admin/categories/:id')
  @UseGuards(SessionGuard)
  @HttpCode(200)
  async deleteCategory(
    @Req() req: GuardedRequest,
    @Param('id') id: string,
  ): Promise<unknown> {
    if (!req.actor) throw new NotFoundException('Not found.');
    if (!UUID_PATTERN.test(id)) throw new NotFoundException('Category not found.');
    await requirePlatformAdmin(undefined, req.actor.userId);

    try {
      await deleteCategory(id);

      await recordAudit({
        actorId: req.actor.userId,
        storeId: null,
        action: 'category.deleted',
        entityType: 'category',
        entityId: id,
        before: { id },
        after: null,
        requestId: requestIdOf(req),
      });

      return { success: true };
    } catch (err) {
      handleCategoryError(err);
    }
  }
}
