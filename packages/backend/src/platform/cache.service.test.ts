// Unit tests for RedisCacheService (T033)
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type Redis from 'ioredis';
import { RedisCacheService } from './cache.service.js';

describe('RedisCacheService (T033)', () => {
  let mockRedis: {
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
    del: ReturnType<typeof vi.fn>;
    keys: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockRedis = {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
      keys: vi.fn(),
    };
  });

  it('returns cached data on cache hit without calling loader', async () => {
    mockRedis.get.mockResolvedValueOnce(JSON.stringify({ title: 'Cached Lamp', price: 2000 }));
    const loader = vi.fn();

    const cache = new RedisCacheService(mockRedis as unknown as Redis);
    const result = await cache.getOrSet('test:key', 300, loader);

    expect(result).toEqual({ title: 'Cached Lamp', price: 2000 });
    expect(loader).not.toHaveBeenCalled();
    expect(mockRedis.get).toHaveBeenCalledWith('test:key');
  });

  it('calls loader, sets cache with jitter, and releases lock on cache miss', async () => {
    mockRedis.get.mockResolvedValueOnce(null); // cache miss
    mockRedis.set.mockResolvedValueOnce('OK'); // lock acquired
    mockRedis.set.mockResolvedValueOnce('OK'); // cache set
    mockRedis.del.mockResolvedValueOnce(1); // lock released

    const loader = vi.fn().mockResolvedValue({ id: 'prod-1', title: 'New Lamp' });

    const cache = new RedisCacheService(mockRedis as unknown as Redis);
    const result = await cache.getOrSet('pdp:lamp', 300, loader);

    expect(result).toEqual({ id: 'prod-1', title: 'New Lamp' });
    expect(loader).toHaveBeenCalledTimes(1);

    // Lock was acquired with EX 5 NX
    expect(mockRedis.set).toHaveBeenCalledWith('lock:pdp:lamp', '1', 'EX', 5, 'NX');
    // Cache was written
    expect(mockRedis.set).toHaveBeenCalledWith(
      'pdp:lamp',
      JSON.stringify({ id: 'prod-1', title: 'New Lamp' }),
      'EX',
      expect.any(Number),
    );
    // Lock was deleted
    expect(mockRedis.del).toHaveBeenCalledWith('lock:pdp:lamp');
  });

  it('handles stampede concurrency: second caller waits and reads cached value without duplicate loader execution', async () => {
    let cachedValue: string | null = null;
    let lockHolder: string | null = null;

    mockRedis.get.mockImplementation(async (key: string) => {
      if (key === 'pdp:hot-item') return cachedValue;
      return null;
    });

    mockRedis.set.mockImplementation(async (key: string, val: string, ..._args: unknown[]) => {
      if (key === 'lock:pdp:hot-item') {
        if (lockHolder === null) {
          lockHolder = 'holder';
          return 'OK';
        }
        return null; // lock already held!
      }
      if (key === 'pdp:hot-item') {
        cachedValue = val;
        return 'OK';
      }
      return 'OK';
    });

    mockRedis.del.mockImplementation(async (key: string) => {
      if (key === 'lock:pdp:hot-item') {
        lockHolder = null;
      }
      return 1;
    });

    const loader = vi.fn().mockImplementation(async () => {
      // Simulate slow DB query
      await new Promise((r) => setTimeout(r, 60));
      return { id: 'hot-1', views: 500 };
    });

    const cache = new RedisCacheService(mockRedis as unknown as Redis);

    // Fire 2 concurrent requests for the same key
    const [res1, res2] = await Promise.all([
      cache.getOrSet('pdp:hot-item', 300, loader),
      cache.getOrSet('pdp:hot-item', 300, loader),
    ]);

    expect(res1).toEqual({ id: 'hot-1', views: 500 });
    expect(res2).toEqual({ id: 'hot-1', views: 500 });

    // Invariant: exactly 1 database query executed!
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('gracefully degrades to loader when Redis throws', async () => {
    mockRedis.get.mockRejectedValueOnce(new Error('Connection refused'));
    const loader = vi.fn().mockResolvedValue({ status: 'live' });

    const cache = new RedisCacheService(mockRedis as unknown as Redis);
    const result = await cache.getOrSet('any:key', 300, loader);

    expect(result).toEqual({ status: 'live' });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('invalidates pattern correctly', async () => {
    mockRedis.keys.mockResolvedValueOnce(['cache:pdp:mkt:item1', 'cache:pdp:mkt:item2']);
    mockRedis.del.mockResolvedValueOnce(2);

    const cache = new RedisCacheService(mockRedis as unknown as Redis);
    await cache.invalidatePattern('cache:pdp:mkt:*');

    expect(mockRedis.keys).toHaveBeenCalledWith('cache:pdp:mkt:*');
    expect(mockRedis.del).toHaveBeenCalledWith('cache:pdp:mkt:item1', 'cache:pdp:mkt:item2');
  });
});
