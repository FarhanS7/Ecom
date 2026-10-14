// T011a: guard contract without HTTP. Exact-name matching, silent denial,
// and actor attachment are pure decisions; the Nest adapter is proven by the
// T011b HTTP suite.

import { describe, expect, it } from 'vitest';
import { decideSession, extractCookie } from './session.guard.js';
import type { Actor } from './session.service.js';

const ACTOR: Actor = { userId: 'u1', familyId: 'f1', roles: ['customer'] };

function contextWith(cookie: string | undefined) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: cookie === undefined ? {} : { cookie },
      }),
    }),
  };
}

describe('cookie extraction (T011a)', () => {
  it('matches exact names only', () => {
    expect(extractCookie('access_token=abc; other=1', 'access_token')).toBe('abc');
    expect(extractCookie('evil_access_token=abc', 'access_token')).toBeNull();
    expect(extractCookie('access_token = spaced ', 'access_token')).toBe('spaced');
    expect(extractCookie(undefined, 'access_token')).toBeNull();
    expect(extractCookie('nonsense', 'access_token')).toBeNull();
  });
});

describe('session decisions (T011a)', () => {
  it('attaches live actors and denies everything else silently', async () => {
    const ok = await decideSession(contextWith('access_token=good'), async () => ACTOR);
    expect(ok).toEqual({ ok: true, actor: ACTOR });

    const missing = await decideSession(contextWith(undefined), async () => ACTOR);
    expect(missing).toEqual({ ok: false });

    const dead = await decideSession(contextWith('access_token=stale'), async () => null);
    expect(dead).toEqual({ ok: false });
  });
});
