// @shopscale/backend/platform/cache.service - Redis cache-aside with stampede mutex lock (T033).
// Invariants:
// 1. Single-flight mutex lock prevents multiple concurrent cache misses from stampeding PostgreSQL.
// 2. TTL jitter (+/- 10%) prevents synchronized cache expirations.
// 3. Graceful degradation: Redis unavailability or timeout falls back directly to the loader.
// 4. Import-safe: lazily connects to Redis with offline queue disabled.

import Redis from 'ioredis';
import { getEnv } from '@shopscale/config';

let sharedRedis: Redis | null = null;

export function getRedisCacheClient(): Redis | null {
  if (sharedRedis) return sharedRedis;
  try {
    const env = getEnv();
    if (!env.REDIS_CACHE_URL) return null;

    sharedRedis = new Redis(env.REDIS_CACHE_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
    // Suppress unhandled error crash if Redis is unreachable
    sharedRedis.on('error', () => {});
    return sharedRedis;
  } catch {
    return null;
  }
}

export class RedisCacheService {
  constructor(private readonly customRedis?: Redis | null | undefined) {}

  private get client(): Redis | null {
    if (this.customRedis !== undefined) return this.customRedis;
    return getRedisCacheClient();
  }

  /**
   * Read typed JSON value from Redis.
   */
  async get<T>(key: string): Promise<T | null> {
    const redis = this.client;
    if (!redis) return null;
    try {
      const data = await redis.get(key);
      if (!data) return null;
      return JSON.parse(data) as T;
    } catch {
      return null;
    }
  }

  /**
   * Set typed JSON value in Redis with TTL jitter (+/- 30s) to avoid stampedes.
   */
  async set(key: string, value: unknown, ttlSeconds = 300): Promise<void> {
    const redis = this.client;
    if (!redis) return;
    try {
      const jitter = Math.floor(Math.random() * 60) - 30;
      const effectiveTtl = Math.max(10, ttlSeconds + jitter);
      await redis.set(key, JSON.stringify(value), 'EX', effectiveTtl);
    } catch {
      // Degrade gracefully
    }
  }

  /**
   * Invalidate a single cache key.
   */
  async invalidate(key: string): Promise<void> {
    const redis = this.client;
    if (!redis) return;
    try {
      await redis.del(key);
    } catch {
      // Degrade gracefully
    }
  }

  /**
   * Invalidate all keys matching a glob pattern (e.g. cache:pdp:*).
   */
  async invalidatePattern(pattern: string): Promise<void> {
    const redis = this.client;
    if (!redis) return;
    try {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch {
      // Degrade gracefully
    }
  }

  /**
   * Cache-aside with single-flight mutex lock:
   * 1. Checks cache first.
   * 2. On miss, attempts to acquire SET lock:{key} 1 EX 5 NX.
   * 3. Winner calls loader and populates cache.
   * 4. Losers wait and re-read cached result.
   * 5. If Redis fails, executes loader directly.
   */
  async getOrSet<T>(
    key: string,
    ttlSeconds: number,
    loader: () => Promise<T>,
  ): Promise<T> {
    const redis = this.client;
    if (!redis) {
      return loader();
    }

    // 1. Check cache
    try {
      const cached = await this.get<T>(key);
      if (cached !== null) {
        return cached;
      }
    } catch {
      // Fall through to loader
    }

    // 2. Single-flight mutex lock
    const lockKey = `lock:${key}`;
    let lockAcquired = false;
    try {
      const lockRes = await redis.set(lockKey, '1', 'EX', 5, 'NX');
      lockAcquired = lockRes === 'OK';
    } catch {
      lockAcquired = false;
    }

    if (lockAcquired) {
      try {
        const result = await loader();
        if (result !== null && result !== undefined) {
          await this.set(key, result, ttlSeconds);
        }
        return result;
      } finally {
        try {
          await redis.del(lockKey);
        } catch {
          // Ignore lock release error
        }
      }
    }

    // 3. Wait for lock holder to populate cache
    for (let attempt = 0; attempt < 8; attempt++) {
      await new Promise((r) => setTimeout(r, 50));
      try {
        const cached = await this.get<T>(key);
        if (cached !== null) {
          return cached;
        }
      } catch {
        break;
      }
    }

    // 4. Fallback if lock expired or holder failed
    return loader();
  }
}

export const redisCacheService = new RedisCacheService();
