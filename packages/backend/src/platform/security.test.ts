// T013a: origin decision table + header map. Pure assertions; the API
// enforcement is proven over HTTP in T013b.

import { describe, expect, it } from 'vitest';
import { SECURITY_HEADERS, isSameOriginRequest } from './security.js';

describe('same-origin verification (T013a)', () => {
  it('accepts matching origins and bare non-browser calls', () => {
    expect(isSameOriginRequest({ origin: 'https://shop.example', host: 'shop.example' })).toBe(true);
    expect(isSameOriginRequest({ origin: 'http://localhost:3000', host: 'localhost:3000' })).toBe(true);
    expect(isSameOriginRequest({ host: 'shop.example' })).toBe(true);
    expect(isSameOriginRequest({})).toBe(true);
  });

  it('refuses mismatched or unparsable provenance', () => {
    expect(isSameOriginRequest({ origin: 'https://evil.example', host: 'shop.example' })).toBe(false);
    expect(isSameOriginRequest({ origin: 'not-a-url', host: 'shop.example' })).toBe(false);
    expect(isSameOriginRequest({ referer: 'https://evil.example/x', host: 'shop.example' })).toBe(false);
    expect(isSameOriginRequest({ referer: 'https://shop.example/x', host: 'shop.example' })).toBe(true);
    // Origin wins over Referer when both present.
    expect(
      isSameOriginRequest({ origin: 'https://shop.example', referer: 'https://evil.example/x', host: 'shop.example' }),
    ).toBe(true);
  });
});

describe('safe headers (T013a)', () => {
  it('pins the documented set', () => {
    expect(SECURITY_HEADERS).toMatchObject({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Cross-Origin-Opener-Policy': 'same-origin',
    });
  });
});
