// @shopscale/backend/platform/feature-flag.service - Database-driven feature flag engine (TASK-076, PRD P2 AD-4).
// Invariants:
// 1. Defaults to disabled (false) if flag is missing, disabled, or on database error (fail-safe).
// 2. Global enabled toggle acts as master circuit breaker.
// 3. store_allowlist grants explicit access to specific stores even if rollout_percentage is 0.
// 4. rollout_percentage computes deterministic consistent hash over (flagKey + ':' + storeId).

import type { Sql } from 'postgres';
import { getDb } from '../db/client.js';

export interface FeatureFlag {
  key: string;
  description: string | null;
  enabled: boolean;
  storeAllowlist: string[];
  rolloutPercentage: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SetFeatureFlagInput {
  key: string;
  description?: string | null | undefined;
  enabled?: boolean | undefined;
  storeAllowlist?: string[] | undefined;
  rolloutPercentage?: number | undefined;
}

export interface FeatureFlagPort {
  isEnabled(flagKey: string, storeId?: string): Promise<boolean>;
  getFlag(flagKey: string): Promise<FeatureFlag | null>;
  setFlag(input: SetFeatureFlagInput): Promise<FeatureFlag>;
  listFlags(): Promise<FeatureFlag[]>;
}

interface FeatureFlagDbRow {
  key: string;
  description: string | null;
  enabled: boolean;
  store_allowlist: string[] | null;
  rollout_percentage: number;
  version: number;
  created_at: Date;
  updated_at: Date;
}

/**
 * Computes deterministic integer 0-99 for percentage-based feature flag rollout.
 */
export function computeRolloutBucket(key: string, identifier: string): number {
  const combined = `${key}:${identifier}`;
  let hash = 2166136261; // FNV-1a 32-bit offset basis
  for (let i = 0; i < combined.length; i++) {
    hash ^= combined.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % 100;
}

export class FeatureFlagService implements FeatureFlagPort {
  constructor(private readonly explicitSql?: Sql) {}

  private get sql(): Sql {
    return this.explicitSql ?? getDb();
  }

  /**
   * Evaluates whether a feature flag is enabled for the given context.
   * Fails safe to false on any database error or missing flag key.
   */
  async isEnabled(flagKey: string, storeId?: string): Promise<boolean> {
    try {
      const flag = await this.getFlag(flagKey);
      if (!flag) return false;
      if (!flag.enabled) return false;

      // 1. Check explicit store allowlist
      if (storeId && flag.storeAllowlist.includes(storeId)) {
        return true;
      }

      // 2. Check rollout percentage
      if (flag.rolloutPercentage >= 100) {
        return true;
      }

      if (flag.rolloutPercentage <= 0) {
        return false;
      }

      // If storeId provided, compute consistent deterministic percentage bucket
      if (storeId) {
        const bucket = computeRolloutBucket(flagKey, storeId);
        return bucket < flag.rolloutPercentage;
      }

      // If no storeId, rollout percentage cannot be evaluated specifically
      return false;
    } catch {
      // Non-blocking: fail-safe to false
      return false;
    }
  }

  async getFlag(flagKey: string): Promise<FeatureFlag | null> {
    try {
      const rows = (await this.sql`
        SELECT "key", "description", "enabled", "store_allowlist", "rollout_percentage", "version", "created_at", "updated_at"
        FROM "feature_flags"
        WHERE "key" = ${flagKey}
        LIMIT 1;
      `) as unknown as FeatureFlagDbRow[];

      const row = rows[0];
      if (!row) return null;

      return {
        key: row.key,
        description: row.description,
        enabled: Boolean(row.enabled),
        storeAllowlist: Array.isArray(row.store_allowlist) ? row.store_allowlist : [],
        rolloutPercentage: Number(row.rollout_percentage),
        version: Number(row.version),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    } catch {
      return null;
    }
  }

  async setFlag(input: SetFeatureFlagInput): Promise<FeatureFlag> {
    const allowlistJson = JSON.stringify(input.storeAllowlist ?? []);
    const rollout = input.rolloutPercentage !== undefined
      ? Math.max(0, Math.min(100, input.rolloutPercentage))
      : 0;
    const enabled = input.enabled ?? false;

    const rows = (await this.sql`
      INSERT INTO "feature_flags" (
        "key", "description", "enabled", "store_allowlist", "rollout_percentage", "version", "updated_at"
      ) VALUES (
        ${input.key},
        ${input.description ?? null},
        ${enabled},
        ${allowlistJson}::jsonb,
        ${rollout},
        1,
        now()
      )
      ON CONFLICT ("key") DO UPDATE SET
        "description" = COALESCE(EXCLUDED."description", "feature_flags"."description"),
        "enabled" = EXCLUDED."enabled",
        "store_allowlist" = EXCLUDED."store_allowlist",
        "rollout_percentage" = EXCLUDED."rollout_percentage",
        "version" = "feature_flags"."version" + 1,
        "updated_at" = now()
      RETURNING "key", "description", "enabled", "store_allowlist", "rollout_percentage", "version", "created_at", "updated_at";
    `) as unknown as FeatureFlagDbRow[];

    const row = rows[0]!;
    return {
      key: row.key,
      description: row.description,
      enabled: Boolean(row.enabled),
      storeAllowlist: Array.isArray(row.store_allowlist) ? row.store_allowlist : [],
      rolloutPercentage: Number(row.rollout_percentage),
      version: Number(row.version),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async listFlags(): Promise<FeatureFlag[]> {
    try {
      const rows = (await this.sql`
        SELECT "key", "description", "enabled", "store_allowlist", "rollout_percentage", "version", "created_at", "updated_at"
        FROM "feature_flags"
        ORDER BY "key" ASC;
      `) as unknown as FeatureFlagDbRow[];

      return rows.map((row) => ({
        key: row.key,
        description: row.description,
        enabled: Boolean(row.enabled),
        storeAllowlist: Array.isArray(row.store_allowlist) ? row.store_allowlist : [],
        rolloutPercentage: Number(row.rollout_percentage),
        version: Number(row.version),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    } catch {
      return [];
    }
  }
}

export const featureFlagService = new FeatureFlagService();
