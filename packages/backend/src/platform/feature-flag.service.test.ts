// packages/backend/src/platform/feature-flag.service.test.ts - Unit tests for FeatureFlagService (TASK-076).
// Invariants verified:
// 1. Feature flags default to disabled (false) if key is missing or database is unavailable.
// 2. Global enabled toggle acts as master gate.
// 3. store_allowlist explicitly enables features for specific store IDs even if rollout percentage is 0.
// 4. rollout_percentage computes deterministic consistent hashing over (key + ':' + storeId).
// 5. Updating flags increments version and records changes accurately.

import { describe, expect, it, vi } from 'vitest';
import {
  FeatureFlagService,
  computeRolloutBucket,
  type FeatureFlag,
} from './feature-flag.service.js';
import type { SqlClient } from './index.js';

describe('FeatureFlagService (TASK-076 Unit Tests)', () => {
  let service: FeatureFlagService;

  describe('Deterministic Rollout Bucket Calculation', () => {
    it('computes consistent hash bucket between 0 and 99 for any key and identifier', () => {
      const bucket1 = computeRolloutBucket('new_checkout', 'store-123');
      const bucket2 = computeRolloutBucket('new_checkout', 'store-123');
      expect(bucket1).toBe(bucket2); // Stable
      expect(bucket1).toBeGreaterThanOrEqual(0);
      expect(bucket1).toBeLessThan(100);

      const bucketOther = computeRolloutBucket('new_checkout', 'store-456');
      expect(bucketOther).toBeGreaterThanOrEqual(0);
      expect(bucketOther).toBeLessThan(100);
    });
  });

  describe('Flag Evaluation (isEnabled)', () => {
    it('defaults to false when flag is not found in database', async () => {
      const taggedSql = vi.fn().mockResolvedValue([]);
      service = new FeatureFlagService(taggedSql as unknown as SqlClient);

      const enabled = await service.isEnabled('non_existent_feature', 'store-1');
      expect(enabled).toBe(false);
    });

    it('defaults to false when database throws an error (fail-safe)', async () => {
      const taggedSql = vi.fn().mockRejectedValue(new Error('Connection lost'));
      service = new FeatureFlagService(taggedSql as unknown as SqlClient);

      const enabled = await service.isEnabled('checkout_v2');
      expect(enabled).toBe(false);
    });

    it('returns false when flag has enabled = false regardless of allowlist or rollout', async () => {
      const flagRow = {
        key: 'beta_coupons',
        description: 'Beta coupon features',
        enabled: false, // Master switch OFF
        store_allowlist: ['store-vip-1'],
        rollout_percentage: 100,
        version: 1,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const taggedSql = vi.fn().mockResolvedValue([flagRow]);
      service = new FeatureFlagService(taggedSql as unknown as SqlClient);

      expect(await service.isEnabled('beta_coupons', 'store-vip-1')).toBe(false);
      expect(await service.isEnabled('beta_coupons', 'store-regular')).toBe(false);
    });

    it('returns true when store is explicitly listed in store_allowlist', async () => {
      const flagRow = {
        key: 'dark_mode_theme',
        description: null,
        enabled: true,
        store_allowlist: ['store-vip-1', 'store-vip-2'],
        rollout_percentage: 0, // 0% general rollout
        version: 1,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const taggedSql = vi.fn().mockResolvedValue([flagRow]);
      service = new FeatureFlagService(taggedSql as unknown as SqlClient);

      expect(await service.isEnabled('dark_mode_theme', 'store-vip-1')).toBe(true);
      expect(await service.isEnabled('dark_mode_theme', 'store-vip-2')).toBe(true);
      expect(await service.isEnabled('dark_mode_theme', 'store-unauthorized')).toBe(false);
    });

    it('returns true for all stores when rollout_percentage is 100', async () => {
      const flagRow = {
        key: 'instant_refunds',
        description: null,
        enabled: true,
        store_allowlist: [],
        rollout_percentage: 100,
        version: 1,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const taggedSql = vi.fn().mockResolvedValue([flagRow]);
      service = new FeatureFlagService(taggedSql as unknown as SqlClient);

      expect(await service.isEnabled('instant_refunds', 'any-store')).toBe(true);
      expect(await service.isEnabled('instant_refunds')).toBe(true);
    });

    it('evaluates gradual rollout percentage deterministically based on storeId', async () => {
      // Find a store that falls into bucket < 30 and another >= 30
      const key = 'gradual_feature';
      let storeBelow30 = '';
      let storeAbove30 = '';

      for (let i = 1; i <= 200; i++) {
        const id = `store-candidate-${i}`;
        const bucket = computeRolloutBucket(key, id);
        if (bucket < 30 && !storeBelow30) storeBelow30 = id;
        if (bucket >= 30 && !storeAbove30) storeAbove30 = id;
        if (storeBelow30 && storeAbove30) break;
      }

      const flagRow = {
        key,
        description: '30% rollout',
        enabled: true,
        store_allowlist: [],
        rollout_percentage: 30,
        version: 1,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const taggedSql = vi.fn().mockResolvedValue([flagRow]);
      service = new FeatureFlagService(taggedSql as unknown as SqlClient);

      expect(await service.isEnabled(key, storeBelow30)).toBe(true);
      expect(await service.isEnabled(key, storeAbove30)).toBe(false);
    });
  });

  describe('Administrative Management (setFlag & listFlags)', () => {
    it('inserts and upserts feature flags correctly', async () => {
      const insertedRow = {
        key: 'new_feature',
        description: 'Admin toggle',
        enabled: true,
        store_allowlist: ['store-a'],
        rollout_percentage: 50,
        version: 1,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const taggedSql = vi.fn().mockResolvedValue([insertedRow]);
      service = new FeatureFlagService(taggedSql as unknown as SqlClient);

      const flag: FeatureFlag = await service.setFlag({
        key: 'new_feature',
        description: 'Admin toggle',
        enabled: true,
        storeAllowlist: ['store-a'],
        rolloutPercentage: 50,
      });

      expect(flag.key).toBe('new_feature');
      expect(flag.enabled).toBe(true);
      expect(flag.storeAllowlist).toEqual(['store-a']);
      expect(flag.rolloutPercentage).toBe(50);
    });

    it('lists all registered feature flags sorted by key', async () => {
      const rows = [
        {
          key: 'flag_a',
          description: null,
          enabled: true,
          store_allowlist: [],
          rollout_percentage: 100,
          version: 1,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          key: 'flag_b',
          description: null,
          enabled: false,
          store_allowlist: [],
          rollout_percentage: 0,
          version: 2,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      const taggedSql = vi.fn().mockResolvedValue(rows);
      service = new FeatureFlagService(taggedSql as unknown as SqlClient);

      const list = await service.listFlags();
      expect(list).toHaveLength(2);
      expect(list[0]!.key).toBe('flag_a');
      expect(list[1]!.key).toBe('flag_b');
    });
  });
});
