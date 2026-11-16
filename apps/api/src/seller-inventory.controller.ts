// @shopscale/api/seller-inventory.controller - Seller store inventory management (T040).
// Invariants:
// 1. All endpoints guarded by SessionGuard and store-scoped permission 'catalog:manage'.
// 2. Uniform 404 for unknown store, foreign variants, or non-members (no existence oracle).
// 3. Stock reduction below active reserved count returns 409 Conflict with CANNOT_REDUCE_BELOW_RESERVED.
// 4. Returns typed contracts: InventoryListResponse, AdjustStockResponse, StockMovementsResponse.

import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  authorizeStore,
  inventoryService,
  InventoryConstraintError,
} from '@shopscale/backend';
import type { Actor } from '@shopscale/backend';
import {
  adjustStockRequest,
  adjustStockResponse,
  inventoryListResponse,
  stockMovementsResponse,
} from '@shopscale/contracts';
import { SessionGuard } from './session.guard.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface GuardedRequest {
  actor?: Actor;
}

function notFound(): never {
  throw new NotFoundException('Not found.');
}

@Controller('seller/stores/:storeId/inventory')
@UseGuards(SessionGuard)
export class SellerInventoryController {
  private async gate(req: GuardedRequest, storeId: string): Promise<void> {
    if (!UUID_PATTERN.test(storeId)) notFound();
    try {
      if (!req.actor?.userId) notFound();
      const allowed = await authorizeStore({ userId: req.actor.userId, storeId, permission: 'catalog:manage' });
      if (!allowed) notFound();
    } catch {
      notFound();
    }
  }

  @Get()
  async listInventory(
    @Req() req: GuardedRequest,
    @Param('storeId') storeId: string,
  ): Promise<unknown> {
    await this.gate(req, storeId);
    const items = await inventoryService.getStoreInventory(storeId);
    return inventoryListResponse.parse({ items });
  }

  @Post('adjust')
  @HttpCode(200)
  async adjustStock(
    @Req() req: GuardedRequest,
    @Param('storeId') storeId: string,
    @Body() rawBody: unknown,
  ): Promise<unknown> {
    await this.gate(req, storeId);

    const parsed = adjustStockRequest.safeParse(rawBody);
    if (!parsed.success) {
      notFound();
    }

    const { variantId, deltaOnHand, reason } = parsed.data;
    const operationKey = `adjust:${storeId}:${variantId}:${Date.now()}`;

    try {
      const result = await inventoryService.adjustStock({
        storeId,
        variantId,
        deltaOnHand,
        reason,
        operationKey,
      });

      return adjustStockResponse.parse(result);
    } catch (err) {
      if (err instanceof InventoryConstraintError) {
        if (err.code === 'CANNOT_REDUCE_BELOW_RESERVED') {
          throw new ConflictException(err.message);
        }
        if (err.code === 'NOT_FOUND') {
          notFound();
        }
      }
      throw err;
    }
  }

  @Get(':variantId/movements')
  async getMovements(
    @Req() req: GuardedRequest,
    @Param('storeId') storeId: string,
    @Param('variantId') variantId: string,
    @Query('limit') rawLimit?: string,
  ): Promise<unknown> {
    await this.gate(req, storeId);
    if (!UUID_PATTERN.test(variantId)) notFound();

    const limit = rawLimit ? Math.min(100, Math.max(1, parseInt(rawLimit, 10) || 50)) : 50;
    const items = await inventoryService.getVariantMovements(storeId, variantId, limit);

    return stockMovementsResponse.parse({
      items: items.map((m) => ({
        ...m,
        createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : String(m.createdAt),
      })),
    });
  }
}
