// @shopscale/api/support.controller - Customer dispute resolution & support discretionary refunds (T060, T069).
// Invariants:
// 1. Gated by SessionGuard; requires platform role 'support' or 'admin'.
// 2. Support agents are strictly capped at $200.00 (20,000 cents) cumulative per order.
// 3. Exceeding policy limit throws 403 Forbidden with 'POLICY_LIMIT_EXCEEDED'.
// 4. Platform administrators have unlimited refund authority.
// 5. Balanced double-entry financial ledgering and outbox events executed in ACID tx.

import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  InvalidRefundAmountError,
  NoPaidPaymentError,
  OnboardingError,
  RefundExceedsPaymentError,
  RefundPolicyCapExceededError,
  refundService,
  requireSupportOrAdmin,
  type Actor,
} from '@shopscale/backend';
import {
  supportRefundRequestSchema,
  supportRefundResponseSchema,
} from '@shopscale/contracts';
import { SessionGuard } from './session.guard.js';

interface GuardedRequest {
  actor?: Actor;
  requestId?: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller()
@UseGuards(SessionGuard)
export class SupportController {
  @Post('admin/orders/:orderId/refund')
  @HttpCode(200)
  async issueRefund(
    @Req() req: GuardedRequest,
    @Param('orderId') orderId: string,
    @Body() rawBody: unknown,
  ): Promise<unknown> {
    if (!req.actor) throw new NotFoundException('Not found.');
    if (!UUID_PATTERN.test(orderId)) throw new NotFoundException('Order not found.');

    let isAdmin = false;
    let isSupport = false;
    try {
      const auth = await requireSupportOrAdmin(undefined, req.actor.userId);
      isAdmin = auth.isAdmin;
      isSupport = auth.isSupport;
    } catch (err) {
      if (err instanceof OnboardingError && err.failure === 'FORBIDDEN') {
        throw new ForbiddenException('Support or administrative access required.');
      }
      throw err;
    }

    const parsed = supportRefundRequestSchema.safeParse({
      ...(typeof rawBody === 'object' && rawBody !== null ? rawBody : {}),
      orderId,
    });
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors[0]?.message ?? 'Invalid refund request.');
    }

    // Support agent is subject to the $200 policy cap unless they hold admin role
    const isSupportAgent = !isAdmin && isSupport;

    try {
      const result = await refundService.processRefund({
        orderId,
        amountCents: parsed.data.amountCents,
        reason: parsed.data.reason,
        actorId: req.actor.userId,
        isSupportAgent,
        policyCapCents: 20000,
      });

      return supportRefundResponseSchema.parse(result);
    } catch (err) {
      if (err instanceof RefundPolicyCapExceededError) {
        throw new ForbiddenException('POLICY_LIMIT_EXCEEDED');
      }
      if (err instanceof RefundExceedsPaymentError || err instanceof InvalidRefundAmountError) {
        throw new BadRequestException(err.message);
      }
      if (err instanceof NoPaidPaymentError) {
        throw new NotFoundException(err.message);
      }
      throw err;
    }
  }

  // Alias route for /v1/support/orders/:orderId/refund
  @Post('support/orders/:orderId/refund')
  @HttpCode(200)
  async issueSupportRefund(
    @Req() req: GuardedRequest,
    @Param('orderId') orderId: string,
    @Body() rawBody: unknown,
  ): Promise<unknown> {
    return this.issueRefund(req, orderId, rawBody);
  }
}
