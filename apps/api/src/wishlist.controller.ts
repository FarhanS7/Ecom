// @shopscale/api/wishlist.controller - Customer wishlist endpoints (REQ-ENG-001 / T065).

import {
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Put,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ProductNotFoundError,
  wishlistService,
  type Actor,
} from '@shopscale/backend';
import {
  wishlistResponseSchema,
  type WishlistResponseDto,
} from '@shopscale/contracts';
import { SessionGuard } from './session.guard.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface GuardedRequest {
  actor?: Actor;
}

@Controller('wishlist')
@UseGuards(SessionGuard)
export class WishlistController {
  @Get()
  async getWishlist(@Req() req: GuardedRequest): Promise<WishlistResponseDto> {
    const actorId = req.actor?.userId;
    if (!actorId) {
      throw new UnauthorizedException('Authentication required');
    }

    const result = await wishlistService.getWishlist(actorId);
    return wishlistResponseSchema.parse(result);
  }

  @Put(':productId')
  @HttpCode(200)
  async addToWishlist(
    @Param('productId') productId: string,
    @Req() req: GuardedRequest,
  ): Promise<{ ok: boolean; added: boolean }> {
    if (!UUID_PATTERN.test(productId)) {
      throw new NotFoundException('Invalid product ID');
    }

    const actorId = req.actor?.userId;
    if (!actorId) {
      throw new UnauthorizedException('Authentication required');
    }

    try {
      return await wishlistService.addToWishlist(actorId, productId);
    } catch (err) {
      if (err instanceof ProductNotFoundError) {
        throw new NotFoundException(err.message);
      }
      throw err;
    }
  }

  @Delete(':productId')
  @HttpCode(200)
  async removeFromWishlist(
    @Param('productId') productId: string,
    @Req() req: GuardedRequest,
  ): Promise<{ ok: boolean; removed: boolean }> {
    if (!UUID_PATTERN.test(productId)) {
      throw new NotFoundException('Invalid product ID');
    }

    const actorId = req.actor?.userId;
    if (!actorId) {
      throw new UnauthorizedException('Authentication required');
    }

    return await wishlistService.removeFromWishlist(actorId, productId);
  }
}
