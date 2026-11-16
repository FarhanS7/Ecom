// @shopscale/api/concurrency-test.controller - High-concurrency stock verification (T044).
// Exposed endpoints under /v1/test:
// - POST /v1/test/concurrency-reserve: atomic stock reservation under race conditions.
// - POST /v1/test/concurrency-seed: resets inventory to specified onHand and clears past test state.
// - GET  /v1/test/concurrency-stats/:variantId: audits on_hand, reserved, and movement ledger.

import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { inventoryService } from '@shopscale/backend';

export interface ConcurrencyReserveBody {
  variantId: string;
  quantity?: number;
  checkoutId?: string;
  cartId?: string;
}

export interface ConcurrencySeedBody {
  variantId?: string;
  storeId?: string;
  onHand?: number;
}

@Controller('test')
export class ConcurrencyTestController {
  @Post('concurrency-reserve')
  @HttpCode(200)
  async concurrencyReserve(@Body() rawBody: ConcurrencyReserveBody) {
    const variantId = rawBody.variantId;
    if (!variantId) {
      throw new ConflictException('variantId is required');
    }
    const qty = Number(rawBody.quantity) || 1;
    const checkoutId = rawBody.checkoutId || rawBody.cartId || randomUUID();

    const result = await inventoryService.reserve({
      checkoutId,
      items: [{ variantId, qty }],
    });

    if (!result.ok) {
      throw new ConflictException({
        error: result.code,
        message: 'Insufficient stock available for reservation',
        variantId: result.variantId,
        available: result.available,
      });
    }

    return {
      success: true,
      checkoutId,
      reservationIds: result.reservationIds,
    };
  }

  @Post('concurrency-seed')
  @HttpCode(200)
  async concurrencySeed(@Body() body: ConcurrencySeedBody) {
    const onHand = body.onHand ?? 50;
    const res = await inventoryService.seedVariantStock(body.variantId, body.storeId, onHand);
    return res;
  }

  @Get('concurrency-stats/:variantId')
  async getConcurrencyStats(@Param('variantId') variantId: string) {
    return await inventoryService.getVariantStockStats(variantId);
  }
}
