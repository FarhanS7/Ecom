// T023a: theme validation and tenant variable mapping, no DOM required.

import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME } from '@shopscale/contracts';
import { isValidTheme, resolveTheme, tenantThemeStyle } from './theme.js';

const VALID: Record<string, unknown> = {
  primary: '#111111',
  background: '#222222',
  surface: '#333333',
  text: '#444444',
  muted: '#555555',
  accent: '#666666',
  radius: 8,
};

describe('theme validation (T023a)', () => {
  it('accepts only the closed token contract', () => {
    expect(isValidTheme(VALID)).toBe(true);
    // CSS functions, URLs, HTML, unknown keys, bad hex, non-hex, out-of-range.
    expect(isValidTheme({ ...VALID, accent: 'var(--x)' })).toBe(false);
    expect(isValidTheme({ ...VALID, accent: 'url(javascript:alert(1))' })).toBe(false);
    expect(isValidTheme({ ...VALID, accent: '#GGGGGG' })).toBe(false);
    expect(isValidTheme({ ...VALID, accent: 'red' })).toBe(false);
    expect(isValidTheme({ ...VALID, radius: 17 })).toBe(false);
    expect(isValidTheme({ ...VALID, radius: 8.5 })).toBe(false);
    expect(isValidTheme({ ...VALID, extra: '#000000' })).toBe(false);
    expect(isValidTheme({ ...VALID, primary: undefined })).toBe(false);
    expect(isValidTheme(null)).toBe(false);
    expect(isValidTheme('not-an-object')).toBe(false);
    expect(isValidTheme({})).toBe(false);
  });

  it('falls back to the design defaults instead of rendering raw data', () => {
    expect(resolveTheme({ accent: 'var(--x)' })).toEqual(DEFAULT_THEME);
    expect(resolveTheme(null)).toEqual(DEFAULT_THEME);
    expect(resolveTheme(VALID)).toEqual(VALID);
  });
});

describe('tenant variable mapping (T023a)', () => {
  it('emits exactly the allowlisted variables for a valid theme', () => {
    const style = tenantThemeStyle(VALID) as Record<string, string>;
    expect(Object.keys(style).sort()).toEqual(
      [
        '--store-accent',
        '--store-background',
        '--store-muted',
        '--store-primary',
        '--store-radius',
        '--store-surface',
        '--store-text',
      ].sort(),
    );
    expect(style['--store-accent']).toBe('#666666');
    expect(style['--store-primary']).toBe('#111111');
    expect(style['--store-radius']).toBe('8px');
  });

  it('never leaks a rejected value into the style attribute', () => {
    const style = tenantThemeStyle({ ...VALID, accent: 'var(--brand)' }) as Record<string, string>;
    expect(style['--store-accent']).toBe(DEFAULT_THEME.accent);
    for (const value of Object.values(style)) {
      expect(value).not.toContain('var(');
    }
  });
});
