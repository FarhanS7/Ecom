// T011b: single-flight serialization with a mocked fetch (no network).

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetRefreshSlotForTests, refreshSession } from './session.js';

function okFetcher(delayMs = 20) {
  return vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        setTimeout(() => resolve(new Response(JSON.stringify({ ok: true }), { status: 200 })), delayMs);
      }),
  );
}

beforeEach(() => {
  __resetRefreshSlotForTests();
});

describe('refresh serialization (T011b)', () => {
  it('coalesces concurrent refreshes into one request', async () => {
    const fetcher = okFetcher();
    const [a, b, c] = await Promise.all([refreshSession(fetcher), refreshSession(fetcher), refreshSession(fetcher)]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect([a, b, c]).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
  });

  it('allows a new request after settle and reports failure', async () => {
    const failing = vi.fn(() => Promise.reject(new Error('down')));
    await expect(refreshSession(failing)).resolves.toEqual({ ok: false });
    const succeeding = okFetcher(0);
    await expect(refreshSession(succeeding)).resolves.toEqual({ ok: true });
    expect(failing).toHaveBeenCalledTimes(1);
    expect(succeeding).toHaveBeenCalledTimes(1);
  });
});
