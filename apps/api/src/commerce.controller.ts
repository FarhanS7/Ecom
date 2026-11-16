// @shopscale/api/commerce.controller - Canonical checkout quote and commerce endpoints (T045, T047).
// Invariants:
// 1. Mounts under /v1/checkout via global v1 prefix.
// 2. Evaluates catalog prices in integer cents, fixed shipping per unique seller suborder.
// 3. Rejects price drift with 409 Conflict (PRICE_CHANGED) to prevent checkout on unreviewed prices.
// 4. Returns cryptographically signed quote token with 15-minute TTL.
// 5. POST /v1/checkout enforces mandatory Idempotency-Key header, validates session, reserves stock,
//    and creates parent order with child seller suborders in a single transaction (T047).

import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  AddressNotFoundError,
  IdempotencyConflictError,
  InsufficientStockError,
  InvalidCouponError,
  InvalidQuoteTokenError,
  MissingIdempotencyKeyError,
  PriceChangedError,
  QuoteValidationError,
  checkoutService,
  quoteService,
} from '@shopscale/backend';
import type { Actor } from '@shopscale/backend';
import { checkoutRequestSchema, quoteRequestSchema } from '@shopscale/contracts';
import type { CheckoutAcceptedDto, QuoteResponse } from '@shopscale/contracts';
import { SessionGuard } from './session.guard.js';

interface CommerceRequest {
  actor?: Actor;
  headers?: Record<string, string | string[] | undefined>;
}

function getFirstHeader(val: string | string[] | undefined): string | undefined {
  if (Array.isArray(val)) return val[0];
  return val;
}

@Controller('checkout')
export class CommerceController {
  @Post('quote')
  @HttpCode(200)
  async calculateQuote(@Body() body: unknown): Promise<QuoteResponse> {
    const parseResult = quoteRequestSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException({
        error: 'VALIDATION_ERROR',
        message: 'Invalid quote request payload',
        details: parseResult.error.flatten(),
      });
    }

    try {
      return await quoteService.calculateQuote(parseResult.data);
    } catch (err) {
      if (err instanceof PriceChangedError) {
        throw new ConflictException({
          error: 'PRICE_CHANGED',
          message: err.message,
          variantId: err.variantId,
          expectedPriceCents: err.expectedPriceCents,
          currentPriceCents: err.currentPriceCents,
        });
      }
      if (err instanceof InvalidCouponError) {
        throw new BadRequestException({
          error: 'INVALID_COUPON',
          message: err.message,
          code: err.couponCode,
        });
      }
      if (err instanceof QuoteValidationError) {
        throw new BadRequestException({
          error: 'QUOTE_VALIDATION_ERROR',
          message: err.message,
        });
      }
      throw err;
    }
  }

  @Post()
  @HttpCode(201)
  @UseGuards(SessionGuard)
  async initiateCheckout(
    @Req() req: CommerceRequest,
    @Body() body: unknown,
  ): Promise<CheckoutAcceptedDto> {
    if (!req.actor) {
      throw new UnauthorizedException('Authentication required for checkout.');
    }

    const idempotencyKey =
      getFirstHeader(req.headers?.['idempotency-key']) ??
      getFirstHeader(req.headers?.['Idempotency-Key']);

    if (!idempotencyKey || idempotencyKey.trim() === '') {
      throw new BadRequestException({
        error: 'MISSING_IDEMPOTENCY_KEY',
        message: 'Missing required Idempotency-Key header',
      });
    }

    const parseResult = checkoutRequestSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException({
        error: 'VALIDATION_ERROR',
        message: 'Invalid checkout request payload',
        details: parseResult.error.flatten(),
      });
    }

    try {
      return await checkoutService.initiateCheckout({
        ...parseResult.data,
        userId: req.actor.userId,
        idempotencyKey,
      });
    } catch (err) {
      if (err instanceof MissingIdempotencyKeyError) {
        throw new BadRequestException({
          error: 'MISSING_IDEMPOTENCY_KEY',
          message: err.message,
        });
      }
      if (err instanceof IdempotencyConflictError) {
        throw new ConflictException({
          error: 'IDEMPOTENCY_CONFLICT',
          message: err.message,
        });
      }
      if (err instanceof InsufficientStockError) {
        throw new ConflictException({
          error: 'INSUFFICIENT_STOCK',
          message: err.message,
          variantId: err.variantId,
          available: err.available,
        });
      }
      if (err instanceof InvalidQuoteTokenError) {
        throw new UnauthorizedException({
          error: 'INVALID_QUOTE',
          message: err.message,
        });
      }
      if (err instanceof AddressNotFoundError) {
        throw new BadRequestException({
          error: 'ADDRESS_NOT_FOUND',
          message: err.message,
          addressId: err.addressId,
        });
      }
      throw err;
    }
  }
}
