// @shopscale/api/promotions.controller - Coupon and promotion endpoints (OR-9 / T063).

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
  authorizeStore,
  couponService,
  CouponConflictError,
  CouponExpiredError,
  CouponGlobalLimitExceededError,
  CouponInactiveError,
  CouponNotFoundError,
  CouponNotStartedError,
  CouponPerUserLimitExceededError,
  CouponStoreMismatchError,
  requirePlatformAdmin,
  type Actor,
} from '@shopscale/backend';
import {
  createCouponSchema,
  listCouponsResponseSchema,
  validateCouponRequestSchema,
  validateCouponResponseSchema,
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
export class PromotionsController {
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

  private async gateAdmin(req: GuardedRequest): Promise<void> {
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
  }

  // ==================== Seller Store Coupons ====================

  @Get('seller/stores/:storeId/coupons')
  @UseGuards(SessionGuard)
  async listStoreCoupons(@Req() req: GuardedRequest, @Param('storeId') storeId: string) {
    await this.gateStore(req, storeId);
    const coupons = await couponService.listStoreCoupons(storeId);
    return listCouponsResponseSchema.parse({ coupons });
  }

  @Post('seller/stores/:storeId/coupons')
  @UseGuards(SessionGuard)
  @HttpCode(201)
  async createStoreCoupon(
    @Req() req: GuardedRequest,
    @Param('storeId') storeId: string,
    @Body() body: unknown,
  ) {
    await this.gateStore(req, storeId);
    const parsed = createCouponSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Invalid coupon payload');
    }

    try {
      const created = await couponService.createCoupon(
        parsed.data,
        storeId,
        req.actor?.userId,
      );
      return created;
    } catch (err: unknown) {
      if (err instanceof CouponConflictError) {
        throw new ConflictException(err.message);
      }
      throw err;
    }
  }

  // ==================== Public/Shopper Coupon Validation ====================

  @Post('coupons/validate')
  @HttpCode(200)
  async validateCoupon(@Req() req: GuardedRequest, @Body() body: unknown) {
    const parsed = validateCouponRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Invalid request');
    }

    const { code, subtotalCents, storeIds } = parsed.data;

    try {
      const items = storeIds.map((sid, idx) => ({
        variantId: `preview-${idx}`,
        storeId: sid,
        subtotalCents: Math.floor(subtotalCents / (storeIds.length || 1)),
      }));

      // If no storeIds provided, create a dummy item with total subtotal
      if (items.length === 0) {
        items.push({
          variantId: 'preview-0',
          storeId: '00000000-0000-0000-0000-000000000000',
          subtotalCents,
        });
      }

      const result = await couponService.validateAndCalculateDiscount({
        code,
        items,
        userId: req.actor?.userId,
      });

      return validateCouponResponseSchema.parse({
        valid: true,
        code: result.code,
        kind: result.kind,
        value: result.value,
        discountCents: result.discountCents,
        storeScoped: result.isStoreScoped,
      });
    } catch (err) {
      if (
        err instanceof CouponNotFoundError ||
        err instanceof CouponInactiveError ||
        err instanceof CouponExpiredError ||
        err instanceof CouponNotStartedError ||
        err instanceof CouponGlobalLimitExceededError ||
        err instanceof CouponPerUserLimitExceededError ||
        err instanceof CouponStoreMismatchError
      ) {
        return validateCouponResponseSchema.parse({
          valid: false,
          code,
          discountCents: 0,
          storeScoped: false,
          message: err.message,
        });
      }
      throw err;
    }
  }

  // ==================== Admin Platform Coupons ====================

  @Get('admin/coupons')
  @UseGuards(SessionGuard)
  async listPlatformCoupons(@Req() req: GuardedRequest) {
    await this.gateAdmin(req);
    const coupons = await couponService.listPlatformCoupons();
    return listCouponsResponseSchema.parse({ coupons });
  }

  @Post('admin/coupons')
  @UseGuards(SessionGuard)
  @HttpCode(201)
  async createPlatformCoupon(@Req() req: GuardedRequest, @Body() body: unknown) {
    await this.gateAdmin(req);
    const parsed = createCouponSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Invalid coupon payload');
    }

    try {
      const created = await couponService.createCoupon(
        parsed.data,
        null,
        req.actor?.userId,
      );
      return created;
    } catch (err: unknown) {
      if (err instanceof CouponConflictError) {
        throw new ConflictException(err.message);
      }
      throw err;
    }
  }
}
