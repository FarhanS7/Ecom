// T017a: gateway allowlist + cookie filtering without a server.

import { describe, expect, it } from 'vitest';
import { ALLOWED_GATEWAY_PATHS, filterSessionCookies, resolveGatewayTarget } from './api.js';

describe('gateway allowlist (T017a)', () => {
  it('proxies auth paths and still rejects everything else', () => {
    expect(ALLOWED_GATEWAY_PATHS).toContain('v1/auth/login');
    expect(ALLOWED_GATEWAY_PATHS).toContain('v1/auth/refresh');
    expect(resolveGatewayTarget(['v1', 'auth', 'login'])).toEqual({ ok: true, path: 'v1/auth/login' });
    expect(resolveGatewayTarget(['v1', 'admin', 'stores'])).toEqual({ ok: false, reason: 'not allowlisted' });
    expect(resolveGatewayTarget(['https:', 'evil.example'])).toEqual({ ok: false, reason: 'illegal segment' });
  });
});

describe('session cookie filtering (T017a)', () => {
  it('forwards exact session names and drops everything else', () => {
    expect(filterSessionCookies('access_token=a; refresh_token=b')).toBe('access_token=a; refresh_token=b');
    expect(filterSessionCookies('evil_access_token=x; access_token=a')).toBe('access_token=a');
    expect(filterSessionCookies('tracking=1; session=abc')).toBeNull();
    expect(filterSessionCookies(null)).toBeNull();
    expect(filterSessionCookies('access_token=')).toBeNull();
    expect(filterSessionCookies('nonsense')).toBeNull();
  });
});
