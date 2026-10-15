// T028a: the CLI's two promises — accept the documented spellings, and refuse
// the target it must never write to. Parsing is pure, so this needs no database.

import { describe, expect, it } from 'vitest';
import { assertSeedTarget, parseSeedArgs, redactedDatabaseLabel } from './seed.js';

describe('seed CLI arguments (T028a)', () => {
  it('accepts the documented --flag value form', () => {
    expect(parseSeedArgs(['--size', 's', '--seed', '42'], {})).toEqual({ size: 's', seed: 42, verify: false });
  });

  it('accepts --flag=value and the original SIZE=/SEED= form', () => {
    expect(parseSeedArgs(['--size=s', '--seed=7'], {})).toEqual({ size: 's', seed: 7, verify: false });
    expect(parseSeedArgs(['SIZE=s', 'SEED=9'], {})).toEqual({ size: 's', seed: 9, verify: false });
  });

  it('falls back to the environment, then to the documented defaults', () => {
    expect(parseSeedArgs([], { SIZE: 's', SEED: '5' })).toEqual({ size: 's', seed: 5, verify: false });
    expect(parseSeedArgs([], {})).toEqual({ size: 's', seed: 42, verify: false });
  });

  it('lets an explicit flag win over the environment', () => {
    expect(parseSeedArgs(['--seed', '3'], { SEED: '99' })).toEqual({ size: 's', seed: 3, verify: false });
  });

  it('defaults to seeding and accepts --verify as the read-only mode', () => {
    expect(parseSeedArgs([], {}).verify).toBe(false);
    expect(parseSeedArgs(['--verify'], {})).toEqual({ size: 's', seed: 42, verify: true });
    expect(parseSeedArgs(['--size', 's', '--seed', '7', '--verify'], {})).toEqual({
      size: 's',
      seed: 7,
      verify: true,
    });
  });

  it('rejects an unknown size and a non-integer seed instead of defaulting silently', () => {
    expect(() => parseSeedArgs(['--size', 'huge'], {})).toThrow(/SIZE must be one of: s, m, l, xl/);
    expect(() => parseSeedArgs(['--seed', 'abc'], {})).toThrow(/SEED must be an integer/);
  });
});

describe('production guard (T028a)', () => {
  it('refuses a production target without an explicit override', () => {
    expect(() => assertSeedTarget({ nodeEnv: 'production' })).toThrow(/NODE_ENV=production/);
    expect(() => assertSeedTarget({ nodeEnv: 'production', force: '0' })).toThrow(/Refusing/);
  });

  it('allows every non-production target and the explicit override', () => {
    expect(() => assertSeedTarget({ nodeEnv: 'development' })).not.toThrow();
    expect(() => assertSeedTarget({ nodeEnv: undefined })).not.toThrow();
    expect(() => assertSeedTarget({ nodeEnv: 'production', force: '1' })).not.toThrow();
  });
});

describe('credential redaction (T028a)', () => {
  it('reports host and database only, never the password', () => {
    const label = redactedDatabaseLabel('postgres://shopscale:s3cret@db.internal:5432/shopscale');
    expect(label).toBe('db.internal:5432/shopscale');
    expect(label).not.toContain('s3cret');
    expect(label).not.toContain('shopscale:');
  });

  it('redacts an unparsable url rather than echoing it', () => {
    expect(redactedDatabaseLabel('not a url with a password')).toBe('(unparsable DATABASE_URL, redacted)');
  });
});
