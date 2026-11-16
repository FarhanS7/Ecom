// @shopscale/api/audit.controller.test - Unit tests for AuditController (T062).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AuditController } from './audit.controller.js';
import { auditService, requirePlatformAdmin } from '@shopscale/backend';

vi.mock('@shopscale/backend', () => ({
  auditService: {
    listAuditLogs: vi.fn(),
  },
  requirePlatformAdmin: vi.fn(),
}));

describe('AuditController (T062 Unit Tests)', () => {
  let controller: AuditController;
  const adminUserId = '11111111-1111-4111-8111-111111111111';
  const normalUserId = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new AuditController();
  });

  it('returns audit log items for platform admin actor', async () => {
    const mockLogs = [
      {
        id: '33333333-3333-4333-8333-333333333333',
        actor_id: adminUserId,
        store_id: '44444444-4444-4444-8444-444444444444',
        action: 'store.approved',
        entity_type: 'store',
        entity_id: '44444444-4444-4444-8444-444444444444',
        redacted_before: null,
        redacted_after: { status: 'active' },
        request_id: 'req_123',
        created_at: new Date('2026-11-16T12:00:00Z'),
      },
    ];

    vi.mocked(auditService.listAuditLogs).mockResolvedValueOnce({
      items: mockLogs,
      nextCursor: null,
    });

    const result = await controller.listAuditLogs(
      { actor: { userId: adminUserId, familyId: 'f1', roles: ['admin'] } },
      '44444444-4444-4444-8444-444444444444',
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.id).toBe('33333333-3333-4333-8333-333333333333');
    expect(result.items[0]?.action).toBe('store.approved');
    expect(auditService.listAuditLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: '44444444-4444-4444-8444-444444444444',
      }),
    );
  });

  it('throws UnauthorizedException if unauthenticated', async () => {
    await expect(controller.listAuditLogs({})).rejects.toThrow(UnauthorizedException);
  });

  it('throws ForbiddenException if actor is not an admin', async () => {
    vi.mocked(requirePlatformAdmin).mockRejectedValueOnce(new Error('Forbidden'));

    await expect(
      controller.listAuditLogs({
        actor: { userId: normalUserId, familyId: 'f2', roles: ['customer'] },
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows access if requirePlatformAdmin DB check succeeds for non-role token', async () => {
    vi.mocked(requirePlatformAdmin).mockResolvedValueOnce();
    vi.mocked(auditService.listAuditLogs).mockResolvedValueOnce({
      items: [],
      nextCursor: null,
    });

    const result = await controller.listAuditLogs({
      actor: { userId: normalUserId, familyId: 'f3', roles: [] },
    });

    expect(result.items).toEqual([]);
    expect(requirePlatformAdmin).toHaveBeenCalledWith(undefined, normalUserId);
  });
});
