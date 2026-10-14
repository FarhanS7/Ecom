// T013b: client never builds a cross-origin target; credentials ride along.

import { describe, expect, it, vi } from 'vitest';
import { csrfFetch, isSameOriginPath } from './csrf.js';

describe('same-origin paths (T013b)', () => {
  it('accepts app paths and rejects cross-origin shapes', () => {
    expect(isSameOriginPath('/v1/auth/login')).toBe(true);
    expect(isSameOriginPath('/api/v1/ping?limit=5')).toBe(true);
    expect(isSameOriginPath('https://evil.example/x')).toBe(false);
    expect(isSameOriginPath('//evil.example/x')).toBe(false);
    expect(isSameOriginPath('/a/../admin')).toBe(false);
    expect(isSameOriginPath('/a\\b')).toBe(false);
    expect(isSameOriginPath('relative/path')).toBe(false);
    expect(isSameOriginPath('')).toBe(false);
  });
});

describe('csrfFetch (T013b)', () => {
  it('sends same-origin with credentials and refuses absolute URLs', async () => {
    const fetcher = vi.fn(() => Promise.resolve(new Response('{}', { status: 200 })));
    await csrfFetch('/v1/auth/login', { email: 'a@b.co' }, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const calls = fetcher.mock.calls as unknown[][];
    expect(calls).toHaveLength(1);
    const first = calls[0];
    expect(first?.[0]).toBe('/v1/auth/login');
    expect((first?.[1] as { credentials?: string } | undefined)?.credentials).toBe('same-origin');
    await expect(csrfFetch('https://evil.example/', {}, fetcher)).rejects.toThrow(/cross-origin/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
