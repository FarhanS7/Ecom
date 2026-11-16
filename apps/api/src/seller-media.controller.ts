// @shopscale/api/seller-media.controller - Seller asset upload endpoints (T035).
// Invariants:
// 1. Scoped to store: unknown store, foreign asset, non-membership, or lack of catalog:manage -> 404 (no existence oracle).
// 2. Short-lived presigned PUT URLs (15 min) for direct MinIO upload.
// 3. Server-side magic byte inspection on completion: promotion to ready or 422 rejection.

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import {
  MediaError,
  authorizeStore,
  mediaService,
  type Actor,
} from '@shopscale/backend';
import {
  createUploadGrantRequest,
  uploadGrantResponse,
  completeUploadResponse,
  attachProductImageRequest,
  reorderProductImagesRequest,
} from '@shopscale/contracts';
import { SessionGuard } from './session.guard.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface GuardedRequest {
  actor?: Actor;
}

function notFound(): never {
  throw new NotFoundException('Not found.');
}

function unprocessable(msg = 'Invalid upload request'): never {
  throw new UnprocessableEntityException(msg);
}

@Controller('seller/stores')
@UseGuards(SessionGuard)
export class SellerMediaController {
  @Post(':storeId/uploads')
  @HttpCode(201)
  async createUpload(
    @Param('storeId') storeId: string,
    @Body() rawBody: unknown,
    @Req() req: GuardedRequest,
  ): Promise<unknown> {
    if (!UUID_PATTERN.test(storeId)) notFound();
    if (!req.actor) notFound();

    const allowed = await authorizeStore({
      userId: req.actor.userId,
      storeId,
      permission: 'catalog:manage',
    });
    if (!allowed) notFound();

    const parsed = createUploadGrantRequest.safeParse(rawBody);
    if (!parsed.success) {
      unprocessable('Invalid upload grant request.');
    }

    try {
      const grant = await mediaService.createUploadGrant(storeId, parsed.data);
      return uploadGrantResponse.parse(grant);
    } catch (err) {
      if (err instanceof MediaError) {
        if (err.failure === 'NOT_FOUND') notFound();
        if (err.failure === 'UNPROCESSABLE') unprocessable(err.message);
      }
      throw err;
    }
  }

  @Post(':storeId/uploads/:assetId/complete')
  @HttpCode(200)
  async completeUpload(
    @Param('storeId') storeId: string,
    @Param('assetId') assetId: string,
    @Req() req: GuardedRequest,
  ): Promise<unknown> {
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(assetId)) notFound();
    if (!req.actor) notFound();

    const allowed = await authorizeStore({
      userId: req.actor.userId,
      storeId,
      permission: 'catalog:manage',
    });
    if (!allowed) notFound();

    try {
      const result = await mediaService.completeUpload(storeId, assetId);
      return completeUploadResponse.parse(result);
    } catch (err) {
      if (err instanceof MediaError) {
        if (err.failure === 'NOT_FOUND') notFound();
        if (err.failure === 'UNPROCESSABLE') unprocessable(err.message);
      }
      throw err;
    }
  }

  @Get(':storeId/products/:productId/images')
  async listImages(
    @Param('storeId') storeId: string,
    @Param('productId') productId: string,
    @Req() req: GuardedRequest,
  ): Promise<unknown> {
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(productId)) notFound();
    if (!req.actor) notFound();

    const allowed = await authorizeStore({
      userId: req.actor.userId,
      storeId,
      permission: 'catalog:manage',
    });
    if (!allowed) notFound();

    try {
      return await mediaService.listProductImages(storeId, productId);
    } catch (err) {
      if (err instanceof MediaError && err.failure === 'NOT_FOUND') notFound();
      throw err;
    }
  }

  @Post(':storeId/products/:productId/images')
  @HttpCode(201)
  async attachImage(
    @Param('storeId') storeId: string,
    @Param('productId') productId: string,
    @Body() rawBody: unknown,
    @Req() req: GuardedRequest,
  ): Promise<unknown> {
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(productId)) notFound();
    if (!req.actor) notFound();

    const allowed = await authorizeStore({
      userId: req.actor.userId,
      storeId,
      permission: 'catalog:manage',
    });
    if (!allowed) notFound();

    const parsed = attachProductImageRequest.safeParse(rawBody);
    if (!parsed.success) unprocessable('Invalid attach image request.');

    try {
      return await mediaService.attachProductImage(storeId, productId, parsed.data);
    } catch (err) {
      if (err instanceof MediaError) {
        if (err.failure === 'NOT_FOUND') notFound();
        if (err.failure === 'UNPROCESSABLE') unprocessable(err.message);
      }
      throw err;
    }
  }

  @Delete(':storeId/products/:productId/images/:imageId')
  @HttpCode(204)
  async deleteImage(
    @Param('storeId') storeId: string,
    @Param('productId') productId: string,
    @Param('imageId') imageId: string,
    @Req() req: GuardedRequest,
  ): Promise<void> {
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(productId) || !UUID_PATTERN.test(imageId)) notFound();
    if (!req.actor) notFound();

    const allowed = await authorizeStore({
      userId: req.actor.userId,
      storeId,
      permission: 'catalog:manage',
    });
    if (!allowed) notFound();

    try {
      await mediaService.deleteProductImage(storeId, productId, imageId);
    } catch (err) {
      if (err instanceof MediaError && err.failure === 'NOT_FOUND') notFound();
      throw err;
    }
  }

  @Put(':storeId/products/:productId/images/reorder')
  @HttpCode(200)
  async reorderImages(
    @Param('storeId') storeId: string,
    @Param('productId') productId: string,
    @Body() rawBody: unknown,
    @Req() req: GuardedRequest,
  ): Promise<unknown> {
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(productId)) notFound();
    if (!req.actor) notFound();

    const allowed = await authorizeStore({
      userId: req.actor.userId,
      storeId,
      permission: 'catalog:manage',
    });
    if (!allowed) notFound();

    const parsed = reorderProductImagesRequest.safeParse(rawBody);
    if (!parsed.success) unprocessable('Invalid reorder request.');

    try {
      return await mediaService.reorderProductImages(storeId, productId, parsed.data.imageIds);
    } catch (err) {
      if (err instanceof MediaError && err.failure === 'NOT_FOUND') notFound();
      throw err;
    }
  }
}
