// @shopscale/api/reviews.controller - Verified purchaser reviews and ratings (RV-1, RV-2 / T064).

import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  InvalidRatingError,
  NotVerifiedPurchaserError,
  ReviewAlreadyExistsError,
  ReviewNotFoundError,
  reviewService,
  type Actor,
} from '@shopscale/backend';
import {
  createReviewSchema,
  listReviewsResponseSchema,
  reviewDtoSchema,
  type ListReviewsResponseDto,
  type ReviewDto,
} from '@shopscale/contracts';
import { SessionGuard } from './session.guard.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface GuardedRequest {
  actor?: Actor;
}

@Controller()
export class ReviewsController {
  @Get('catalog/products/:productId/reviews')
  async listReviews(
    @Param('productId') productId: string,
  ): Promise<ListReviewsResponseDto> {
    if (!UUID_PATTERN.test(productId)) {
      throw new NotFoundException('Invalid product ID');
    }

    const result = await reviewService.listReviewsForProduct(productId);
    return listReviewsResponseSchema.parse(result);
  }

  @Post('catalog/products/:productId/reviews')
  @UseGuards(SessionGuard)
  @HttpCode(201)
  async createReview(
    @Param('productId') productId: string,
    @Req() req: GuardedRequest,
    @Body() body: unknown,
  ): Promise<ReviewDto> {
    if (!UUID_PATTERN.test(productId)) {
      throw new NotFoundException('Invalid product ID');
    }

    const actorId = req.actor?.userId;
    if (!actorId) {
      throw new UnauthorizedException('Authentication required');
    }

    const parsed = createReviewSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Invalid review data');
    }

    try {
      const review = await reviewService.createReview(actorId, productId, parsed.data);
      return reviewDtoSchema.parse(review);
    } catch (err) {
      if (err instanceof NotVerifiedPurchaserError) {
        throw new ForbiddenException(err.message);
      }
      if (err instanceof ReviewAlreadyExistsError) {
        throw new ConflictException(err.message);
      }
      if (err instanceof InvalidRatingError) {
        throw new BadRequestException(err.message);
      }
      if (err instanceof ReviewNotFoundError) {
        throw new NotFoundException(err.message);
      }
      throw err;
    }
  }
}
