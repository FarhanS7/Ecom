// @shopscale/api/support.controller.test - Unit tests for SupportController (T069).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { SupportController } from './support.controller.js';
import {
  OnboardingError,
  RefundPolicyCapExceededError,
  refundService,
  requireSupportOrAdmin,
} from '@shopscale/backend';

vi.mock('@shopscale/backend', () => ({
  refundService: {
    processRefund: vi.fn(),
  },
  requireSupportOrAdmin: vi.fn(),
  RefundPolicyCapExceededError: class extends Error {
    constructor(public readonly requestedCents: number, public readonly policyCapCents: number) {
      super(`Policy limit exceeded: ${requestedCents} > ${policyCapCents}`);
    }
  },
  RefundExceedsPaymentError: class extends Error {
    constructor(public readonly requestedCents: number, public readonly remainingCents: number) {
      super(`Requested ${requestedCents} exceeds ${remainingCents}`);
    }
  },
  InvalidRefundAmountError: class extends Error {
    constructor(public readonly amountCents: number) {
      super(`Invalid amount: ${amountCents}`);
    }
  },
  NoPaidPaymentError: class extends Error {
    constructor(public readonly orderId: string) {
      super(`No paid payment for ${orderId}`);
    }
  },
  OnboardingError: class extends Error {
    constructor(public readonly failure: string, message: string) {
      super(message);
    }
  },
}));

describe('SupportController (T069 Unit Tests)', () => {
  let controller: SupportController;
  const supportUserId = '11111111-1111-4111-8111-111111111111';
  const adminUserId = '22222222-2222-4222-8222-222222222222';
  const customerUserId = '33333333-3333-4333-8333-333333333333';
  const orderId = '44444444-4444-4444-8444-444444444444';
  const refundId = '55555555-5555-4555-8555-555555555555';

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new SupportController();
  });

  it('allows support agent to issue refund within $200 policy limit', async () => {
    vi.mocked(requireSupportOrAdmin).mockResolvedValueOnce({ isAdmin: false, isSupport: true });
    vi.mocked(refundService.processRefund).mockResolvedValueOnce({
      refundId,
      orderId,
      amountCents: 5000,
      remainingCents: 15000,
      isFullyRefunded: false,
      status: 'COMPLETED',
    });

    const result = await controller.issueRefund(
      { actor: { userId: supportUserId, familyId: 'f1', roles: ['support'] } },
      orderId,
      { amountCents: 5000, reason: 'Damaged item courtesy refund' },
    );

    expect(result).toMatchObject({
      refundId,
      orderId,
      amountCents: 5000,
      remainingCents: 15000,
      status: 'COMPLETED',
    });
    expect(refundService.processRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId,
        amountCents: 5000,
        isSupportAgent: true,
        policyCapCents: 20000,
      }),
    );
  });

  it('rejects support refund with 403 POLICY_LIMIT_EXCEEDED when exceeding $200 cap', async () => {
    vi.mocked(requireSupportOrAdmin).mockResolvedValueOnce({ isAdmin: false, isSupport: true });
    vi.mocked(refundService.processRefund).mockRejectedValueOnce(
      new RefundPolicyCapExceededError(25000, 20000),
    );

    await expect(
      controller.issueRefund(
        { actor: { userId: supportUserId, familyId: 'f1', roles: ['support'] } },
        orderId,
        { amountCents: 25000, reason: 'Exorbitant support refund' },
      ),
    ).rejects.toThrow(new ForbiddenException('POLICY_LIMIT_EXCEEDED'));
  });

  it('allows platform admin to issue refund without policy cap restriction', async () => {
    vi.mocked(requireSupportOrAdmin).mockResolvedValueOnce({ isAdmin: true, isSupport: false });
    vi.mocked(refundService.processRefund).mockResolvedValueOnce({
      refundId,
      orderId,
      amountCents: 50000, // $500
      remainingCents: 0,
      isFullyRefunded: true,
      status: 'COMPLETED',
    });

    const result = await controller.issueRefund(
      { actor: { userId: adminUserId, familyId: 'f1', roles: ['admin'] } },
      orderId,
      { amountCents: 50000, reason: 'Executive resolution' },
    );

    expect(result).toMatchObject({
      amountCents: 50000,
      isFullyRefunded: true,
    });
    expect(refundService.processRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        isSupportAgent: false,
      }),
    );
  });

  it('rejects user with neither support nor admin role with 403 Forbidden', async () => {
    vi.mocked(requireSupportOrAdmin).mockRejectedValueOnce(
      new OnboardingError('FORBIDDEN', 'Support or admin access required.'),
    );

    await expect(
      controller.issueRefund(
        { actor: { userId: customerUserId, familyId: 'f1', roles: ['customer'] } },
        orderId,
        { amountCents: 1000, reason: 'Self refund attempt' },
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});
