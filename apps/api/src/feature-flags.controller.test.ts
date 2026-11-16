// apps/api/src/feature-flags.controller.test.ts - Unit tests for FeatureFlagsController (TASK-076).
// Invariants verified:
// 1. Non-admin users are strictly rejected with 403 Forbidden for all administrative operations.
// 2. Unauthenticated requests are rejected with 401 Unauthorized.
// 3. Platform administrators can list, retrieve, and update feature flags.
// 4. Feature flag mutations are audited via auditService.recordMutation.
// 5. Evaluation endpoint allows callers to evaluate flag states per store.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { FeatureFlagsController } from './feature-flags.controller.js';
import { auditService, featureFlagService, requirePlatformAdmin } from '@shopscale/backend';

vi.mock('@shopscale/backend', () => ({
  auditService: {
    recordMutation: vi.fn(),
  },
  featureFlagService: {
    listFlags: vi.fn(),
    getFlag: vi.fn(),
    setFlag: vi.fn(),
    isEnabled: vi.fn(),
  },
  requirePlatformAdmin: vi.fn(),
}));

describe('FeatureFlagsController (TASK-076 Unit Tests)', () => {
  let controller: FeatureFlagsController;
  const adminUserId = '11111111-1111-4111-8111-111111111111';
  const nonAdminUserId = '22222222-2222-4222-8222-222222222222';
  const storeId = '33333333-3333-4333-8333-333333333333';

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new FeatureFlagsController();
  });

  describe('Security & Authorization Matrix', () => {
    it('rejects unauthenticated requests with UnauthorizedException (401)', async () => {
      await expect(controller.listFlags({})).rejects.toThrow(UnauthorizedException);
      await expect(controller.getFlag({}, 'checkout_v2')).rejects.toThrow(UnauthorizedException);
      await expect(controller.setFlag({}, 'checkout_v2', { enabled: true })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects non-admin users with ForbiddenException (403)', async () => {
      vi.mocked(requirePlatformAdmin).mockRejectedValueOnce(new Error('FORBIDDEN'));

      await expect(
        controller.listFlags({
          actor: { userId: nonAdminUserId, familyId: 'f1', roles: ['customer'] },
        }),
      ).rejects.toThrow(ForbiddenException);

      vi.mocked(requirePlatformAdmin).mockRejectedValueOnce(new Error('FORBIDDEN'));
      await expect(
        controller.setFlag(
          { actor: { userId: nonAdminUserId, familyId: 'f1', roles: ['customer'] } },
          'checkout_v2',
          { enabled: true },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows platform administrator with admin role', async () => {
      vi.mocked(featureFlagService.listFlags).mockResolvedValueOnce([
        {
          key: 'new_checkout',
          description: 'New checkout flow',
          enabled: true,
          storeAllowlist: [],
          rolloutPercentage: 50,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await controller.listFlags({
        actor: { userId: adminUserId, familyId: 'f1', roles: ['admin'] },
      });

      expect(result).toHaveLength(1);
      expect(result[0]!.key).toBe('new_checkout');
    });
  });

  describe('Flag Operations', () => {
    it('retrieves single flag and throws NotFoundException when missing', async () => {
      vi.mocked(featureFlagService.getFlag).mockResolvedValueOnce(null);

      await expect(
        controller.getFlag(
          { actor: { userId: adminUserId, familyId: 'f1', roles: ['admin'] } },
          'missing_flag',
        ),
      ).rejects.toThrow(NotFoundException);

      const existingFlag = {
        key: 'existing_flag',
        description: 'Existing',
        enabled: true,
        storeAllowlist: [storeId],
        rolloutPercentage: 0,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(featureFlagService.getFlag).mockResolvedValueOnce(existingFlag);

      const found = await controller.getFlag(
        { actor: { userId: adminUserId, familyId: 'f1', roles: ['admin'] } },
        'existing_flag',
      );
      expect(found).toEqual(existingFlag);
    });

    it('sets feature flag and records audit log mutation', async () => {
      const updatedFlag = {
        key: 'dark_mode',
        description: 'Dark mode theme',
        enabled: true,
        storeAllowlist: [storeId],
        rolloutPercentage: 25,
        version: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(featureFlagService.setFlag).mockResolvedValueOnce(updatedFlag);

      const result = await controller.setFlag(
        { actor: { userId: adminUserId, familyId: 'f1', roles: ['admin'] } },
        'dark_mode',
        {
          description: 'Dark mode theme',
          enabled: true,
          storeAllowlist: [storeId],
          rolloutPercentage: 25,
        },
      );

      expect(result).toEqual(updatedFlag);
      expect(featureFlagService.setFlag).toHaveBeenCalledWith({
        key: 'dark_mode',
        description: 'Dark mode theme',
        enabled: true,
        storeAllowlist: [storeId],
        rolloutPercentage: 25,
      });

      expect(auditService.recordMutation).toHaveBeenCalledWith({
        action: 'feature_flag.updated',
        entityType: 'feature_flag',
        entityId: 'dark_mode',
        actorId: adminUserId,
        before: null,
        after: { key: 'dark_mode', enabled: true, rolloutPercentage: 25 },
      });
    });

    it('evaluates flag state for caller without requiring session', async () => {
      vi.mocked(featureFlagService.isEnabled).mockResolvedValueOnce(true);

      const result = await controller.evaluateFlag('new_checkout', storeId);

      expect(result).toEqual({
        key: 'new_checkout',
        storeId,
        enabled: true,
      });
      expect(featureFlagService.isEnabled).toHaveBeenCalledWith('new_checkout', storeId);
    });
  });
});
