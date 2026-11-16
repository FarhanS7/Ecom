// @shopscale/api/orders.controller - Customer and seller order endpoints (T055).
// Invariants:
// 1. GET /v1/orders: customer-scoped list with cursor pagination.
// 2. GET /v1/orders/:id: customer-scoped detail; foreign ID returns 404 (no oracle).
// 3. GET /v1/seller/stores/:storeId/orders: strictly scoped to storeId with fulfillment:manage grant.
// 4. GET /v1/seller/stores/:storeId/orders/:suborderId: suborder detail scoped to storeId.
// 5. Unpaid orders return masked recipient PII to vendors.

import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  AlreadyShippedError,
  FulfillmentStoreMismatchError,
  FulfillmentSuborderNotFoundError,
  IllegalFulfillmentTransitionError,
  InvoiceForbiddenError,
  InvoiceNotFoundError,
  MissingTrackingRefError,
  OrderAlreadyCancelledError,
  OrderItemNotFoundError,
  OrderNotDeliveredError,
  OrderNotFoundError,
  OrderNotPaidError,
  ReturnAlreadyInspectedError,
  ReturnQuantityExceededError,
  ReturnRequestNotFoundError,
  SuborderNotFoundError,
  authorizeStore,
  fulfillmentService,
  invoiceService,
  orderQueryService,
  returnsService,
  type Actor,
} from '@shopscale/backend';
import {
  cancelOrderSchema,
  createReturnRequestSchema,
  fulfillmentTransitionSchema,
  inspectReturnRequestSchema,
} from '@shopscale/contracts';
import { SessionGuard } from './session.guard.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface GuardedRequest {
  actor?: Actor;
}

function notFound(): never {
  throw new NotFoundException('Not found.');
}

@Controller('orders')
@UseGuards(SessionGuard)
export class OrdersController {
  @Get()
  async listCustomerOrders(
    @Req() req: GuardedRequest,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    if (!req.actor?.userId) {
      throw new UnauthorizedException();
    }
    const numLimit = limit ? parseInt(limit, 10) : undefined;
    return await orderQueryService.listCustomerOrders(req.actor.userId, {
      cursor,
      limit: numLimit,
    });
  }

  @Get(':id')
  async getCustomerOrder(
    @Req() req: GuardedRequest,
    @Param('id') id: string,
  ) {
    if (!req.actor?.userId) {
      throw new UnauthorizedException();
    }
    if (!UUID_PATTERN.test(id)) notFound();
    try {
      return await orderQueryService.getCustomerOrder(req.actor.userId, id);
    } catch (err) {
      if (err instanceof OrderNotFoundError) {
        notFound();
      }
      throw err;
    }
  }

  @Get(':id/invoice')
  async getOrderInvoice(
    @Req() req: GuardedRequest,
    @Param('id') id: string,
  ) {
    if (!req.actor?.userId) {
      throw new UnauthorizedException();
    }
    if (!UUID_PATTERN.test(id)) notFound();

    try {
      const isPrivileged = Boolean(
        req.actor.roles?.includes('admin') ||
        req.actor.roles?.includes('support') ||
        req.actor.roles?.includes('staff'),
      );

      const result = await invoiceService.getInvoiceForOrder({
        userId: req.actor.userId,
        orderId: id,
        isPrivileged,
      });

      return {
        id: result.invoice.id,
        orderId: result.invoice.order_id,
        invoiceNumber: result.invoice.invoice_number,
        totalCents: result.invoice.total_cents,
        currency: result.invoice.currency,
        status: result.invoice.status,
        downloadUrl: result.downloadUrl,
        createdAt: result.invoice.created_at.toISOString(),
      };
    } catch (err) {
      if (
        err instanceof InvoiceNotFoundError ||
        err instanceof InvoiceForbiddenError
      ) {
        notFound();
      }
      throw err;
    }
  }

  @Post(':id/cancel')
  async cancelOrder(
    @Req() req: GuardedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    if (!req.actor?.userId) {
      throw new UnauthorizedException();
    }
    if (!UUID_PATTERN.test(id)) notFound();

    const parseResult = cancelOrderSchema.safeParse(body ?? {});
    if (!parseResult.success) {
      throw new BadRequestException(parseResult.error.message);
    }

    try {
      return await returnsService.cancelOrder(
        req.actor.userId,
        id,
        parseResult.data.reason,
      );
    } catch (err) {
      if (err instanceof OrderNotFoundError) {
        notFound();
      }
      if (
        err instanceof AlreadyShippedError ||
        err instanceof OrderAlreadyCancelledError
      ) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  @Post(':id/returns')
  async createReturnRequest(
    @Req() req: GuardedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    if (!req.actor?.userId) {
      throw new UnauthorizedException();
    }
    if (!UUID_PATTERN.test(id)) notFound();

    const parseResult = createReturnRequestSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException(parseResult.error.message);
    }

    try {
      return await returnsService.createReturnRequest(req.actor.userId, {
        orderId: id,
        orderItemId: parseResult.data.orderItemId,
        qty: parseResult.data.qty,
        reason: parseResult.data.reason,
        customerNotes: parseResult.data.customerNotes,
      });
    } catch (err) {
      if (
        err instanceof OrderNotFoundError ||
        err instanceof OrderItemNotFoundError
      ) {
        notFound();
      }
      if (
        err instanceof OrderNotDeliveredError ||
        err instanceof OrderNotPaidError
      ) {
        throw new BadRequestException(err.message);
      }
      if (err instanceof ReturnQuantityExceededError) {
        throw new ConflictException(err.message);
      }
      throw err;
    }
  }

  @Get(':id/returns')
  async listReturnRequests(
    @Req() req: GuardedRequest,
    @Param('id') id: string,
  ) {
    if (!req.actor?.userId) {
      throw new UnauthorizedException();
    }
    if (!UUID_PATTERN.test(id)) notFound();
    return await returnsService.listReturnRequests(req.actor.userId, id);
  }
}

@Controller('seller/stores/:storeId/orders')
@UseGuards(SessionGuard)
export class SellerOrdersController {
  private async gate(req: GuardedRequest, storeId: string): Promise<void> {
    if (!UUID_PATTERN.test(storeId)) notFound();
    try {
      if (!req.actor?.userId) notFound();
      const allowed = await authorizeStore({
        userId: req.actor.userId,
        storeId,
        permission: 'fulfillment:manage',
      });
      if (!allowed) notFound();
    } catch {
      notFound();
    }
  }

  @Get()
  async listSellerOrders(
    @Req() req: GuardedRequest,
    @Param('storeId') storeId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    await this.gate(req, storeId);
    const numLimit = limit ? parseInt(limit, 10) : undefined;
    return await orderQueryService.listSellerOrders(storeId, {
      cursor,
      limit: numLimit,
    });
  }

  @Get(':suborderId')
  async getSellerOrder(
    @Req() req: GuardedRequest,
    @Param('storeId') storeId: string,
    @Param('suborderId') suborderId: string,
  ) {
    await this.gate(req, storeId);
    if (!UUID_PATTERN.test(suborderId)) notFound();
    try {
      return await orderQueryService.getSellerOrder(storeId, suborderId);
    } catch (err) {
      if (err instanceof SuborderNotFoundError) {
        notFound();
      }
      throw err;
    }
  }

  @Post([':suborderId/transitions', ':suborderId/transition'])
  async transitionSuborder(
    @Req() req: GuardedRequest,
    @Param('storeId') storeId: string,
    @Param('suborderId') suborderId: string,
    @Body() body: unknown,
  ) {
    await this.gate(req, storeId);
    if (!UUID_PATTERN.test(suborderId)) notFound();

    const parseResult = fulfillmentTransitionSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException(parseResult.error.message);
    }

    try {
      return await fulfillmentService.transitionSuborder({
        storeId,
        suborderId,
        toStatus: parseResult.data.toStatus,
        trackingRef: parseResult.data.trackingRef,
        carrier: parseResult.data.carrier,
        actorId: req.actor?.userId,
      });
    } catch (err) {
      if (
        err instanceof FulfillmentSuborderNotFoundError ||
        err instanceof FulfillmentStoreMismatchError
      ) {
        notFound();
      }
      if (
        err instanceof OrderNotPaidError ||
        err instanceof IllegalFulfillmentTransitionError ||
        err instanceof MissingTrackingRefError
      ) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }
}

@Controller('seller/stores/:storeId/returns')
@UseGuards(SessionGuard)
export class SellerReturnsController {
  private async gate(req: GuardedRequest, storeId: string): Promise<void> {
    if (!UUID_PATTERN.test(storeId)) notFound();
    try {
      if (!req.actor?.userId) notFound();
      const allowed = await authorizeStore({
        userId: req.actor.userId,
        storeId,
        permission: 'fulfillment:manage',
      });
      if (!allowed) notFound();
    } catch {
      notFound();
    }
  }

  @Get()
  async listStoreReturns(
    @Req() req: GuardedRequest,
    @Param('storeId') storeId: string,
    @Query('status') status?: string,
  ) {
    await this.gate(req, storeId);
    const validStatus =
      status === 'PENDING_INSPECTION' || status === 'APPROVED' || status === 'REJECTED'
        ? status
        : undefined;
    return await returnsService.listSellerReturnRequests(storeId, validStatus);
  }

  @Post(':returnId/inspect')
  async inspectReturn(
    @Req() req: GuardedRequest,
    @Param('storeId') storeId: string,
    @Param('returnId') returnId: string,
    @Body() body: unknown,
  ) {
    await this.gate(req, storeId);
    if (!UUID_PATTERN.test(returnId)) notFound();

    const parseResult = inspectReturnRequestSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException(parseResult.error.message);
    }

    try {
      return await returnsService.inspectReturnRequest(
        storeId,
        returnId,
        parseResult.data,
      );
    } catch (err) {
      if (err instanceof ReturnRequestNotFoundError) {
        notFound();
      }
      if (err instanceof ReturnAlreadyInspectedError) {
        throw new ConflictException(err.message);
      }
      throw err;
    }
  }
}
