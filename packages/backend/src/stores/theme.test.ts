// T016a: theme token attacks fail closed. Every injection shape from the
// threat model (CSS functions, URLs, HTML, unknown keys, bad hex, wild
// radius) must reject; the exact default palette must accept.

import { describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { DEFAULT_THEME } from '@shopscale/contracts';
import { isValidTheme, parseThemeTokens } from './theme.service.js';
import { getTheme } from './theme.service.js';
import { extractStoreSlug } from './channel.service.js';

const GOOD = { ...DEFAULT_THEME };

describe('theme tokens (T016a)', () => {
  it('accepts the default palette and well-formed customs', () => {
    expect(isValidTheme(GOOD)).toBe(true);
    expect(parseThemeTokens({ ...GOOD, radius: 0 })).toMatchObject({ radius: 0 });
    expect(parseThemeTokens({ ...GOOD, radius: 16 })).toMatchObject({ radius: 16 });
  });

  it('rejects every injection shape', () => {
    const attacks: unknown[] = [
      { ...GOOD, primary: 'expression(alert(1))' },
      { ...GOOD, background: 'url(https://evil.example/x.png)' },
      { ...GOOD, text: '<img src=x onerror=alert(1)>' },
      { ...GOOD, accent: 'red' },
      { ...GOOD, primary: '#fff' },
      { ...GOOD, primary: '#gggggg' },
      { ...GOOD, radius: 99 },
      { ...GOOD, radius: -1 },
      { ...GOOD, cssText: 'color:red' },
      { ...GOOD, '--evil': '1' },
      'not-an-object',
      null,
      [],
    ];
    for (const attack of attacks) {
      expect(isValidTheme(attack)).toBe(false);
      expect(parseThemeTokens(attack)).toBeNull();
    }
  });
});

describe('theme fallback (T016b)', () => {
  // No database: stub the single query getTheme issues.
  function stubSql(tokens: unknown): Sql {
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      unsafe: async (): Promise<any> => [{ approved_tokens: tokens }],
    } as unknown as Sql;
  }

  it('serves defaults for missing or malicious rows', async () => {
    expect(await getTheme('store-1', stubSql(null))).toEqual(DEFAULT_THEME);
    expect(
      await getTheme('store-1', stubSql({ primary: 'expression(alert(1))', radius: 8 })),
    ).toEqual(DEFAULT_THEME);
    expect(await getTheme('store-1', stubSql({ ...DEFAULT_THEME }))).toEqual(DEFAULT_THEME);
  });
});

describe('store slug extraction (T016a)', () => {
  it('resolves path slugs and rejects hostile shapes', () => {
    expect(extractStoreSlug('/stores/acme')).toBe('acme');
    expect(extractStoreSlug('/stores/acme/products')).toBe('acme');
    expect(extractStoreSlug('/stores/../admin')).toBeNull();
    expect(extractStoreSlug('/stores/%2e%2e/admin')).toBeNull();
    expect(extractStoreSlug('/stores/ACME')).toBeNull();
    expect(extractStoreSlug('/stores/a')).toBeNull();
    expect(extractStoreSlug('/products')).toBeNull();
    expect(extractStoreSlug('/')).toBeNull();
  });
});
