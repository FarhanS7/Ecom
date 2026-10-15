// T028a: the deterministic core. These are the tests that make the seed's
// promise checkable without a database: the same seed must reproduce the same
// values, ids must not move when unrelated rows are added, and the RFC 4122
// construction must match an independently written one.

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  SEED_EPOCH_MS,
  SEED_NAMESPACE,
  canonicalJson,
  idFor,
  intBetween,
  isoAt,
  logNormal,
  pick,
  priceCents,
  seedRandom,
  uuidV5,
  weighted,
} from './random.js';

function sequence(rng: () => number, count: number): number[] {
  return Array.from({ length: count }, () => rng());
}

describe('seeded randomness (T028a)', () => {
  it('reproduces the same sequence for the same seed and diverges otherwise', () => {
    expect(sequence(seedRandom(42), 20)).toEqual(sequence(seedRandom(42), 20));
    // Not just "somewhere": the first draw must already differ, or two different
    // datasets would share their head and hide a seeding bug.
    expect(sequence(seedRandom(43), 1)).not.toEqual(sequence(seedRandom(42), 1));
    for (const value of sequence(seedRandom(7), 200)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('keeps intBetween inside its bounds and reaches both ends', () => {
    const rng = seedRandom(3);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i += 1) {
      const value = intBetween(rng, 0, 9);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(9);
      seen.add(value);
    }
    expect(seen.size).toBe(10);
    expect(() => intBetween(rng, 5, 4)).toThrow(/max must be >= min/);
  });

  it('picks only from the list, refusing an empty one', () => {
    const rng = seedRandom(11);
    for (let i = 0; i < 50; i += 1) {
      expect(['a', 'b', 'c']).toContain(pick(rng, ['a', 'b', 'c']));
    }
    expect(() => pick(rng, [])).toThrow(/empty list/);
  });

  it('never returns a zero-weight entry and refuses an empty weight budget', () => {
    const rng = seedRandom(5);
    for (let i = 0; i < 500; i += 1) {
      expect(
        weighted(rng, [
          ['kept', 1],
          ['impossible', 0],
        ]),
      ).toBe('kept');
    }
    expect(() => weighted(rng, [['x', 0]])).toThrow(/weights must sum above zero/);
  });

  it('samples a positive log-normal distribution around the given median', () => {
    const rng = seedRandom(9);
    // sigma 0 collapses to the median exactly, which pins the transform itself.
    expect(logNormal(rng, 2500, 0)).toBeCloseTo(2500, 6);
    const samples = Array.from({ length: 400 }, () => logNormal(rng, 2500, 0.9)).sort((a, b) => a - b);
    expect(samples.every((value) => value > 0)).toBe(true);
    // A multiplicative spread, not a uniform one: the median sample sits near the
    // median and the tail is long, so the extremes must be far from it.
    expect(samples[Math.floor(samples.length / 2)]!).toBeGreaterThan(1500);
    expect(samples[Math.floor(samples.length / 2)]!).toBeLessThan(4000);
    expect(samples[samples.length - 1]! / samples[0]!).toBeGreaterThan(10);
  });

  it('rounds prices to whole cents inside the storefront band', () => {
    const rng = seedRandom(13);
    const prices = Array.from({ length: 300 }, () => priceCents(rng));
    for (const price of prices) {
      expect(Number.isInteger(price)).toBe(true);
      expect(price).toBeGreaterThanOrEqual(99);
      expect(price).toBeLessThanOrEqual(500_000);
    }
  });

  it('derives timestamps from a fixed epoch, never from the clock', () => {
    expect(isoAt(0)).toBe('2025-01-01T00:00:00.000Z');
    expect(SEED_EPOCH_MS).toBe(Date.UTC(2025, 0, 1));
    expect(isoAt(90)).toBe(new Date(SEED_EPOCH_MS + 90 * 60_000).toISOString());
    expect(isoAt(90)).toBe(isoAt(90));
  });
});

describe('name-addressed ids (T028a)', () => {
  // The RFC construction, written a second time with string surgery instead of
  // buffer bit-masking, so the test cannot simply agree with the implementation.
  function rfcReference(name: string, namespace: string): string {
    const hex = createHash('sha1')
      .update(Buffer.concat([Buffer.from(namespace.replace(/-/g, ''), 'hex'), Buffer.from(name, 'utf8')]))
      .digest('hex')
      .slice(0, 32);
    const versioned = `${hex.slice(0, 12)}5${hex.slice(13)}`;
    const variant = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
    const bits = `${versioned.slice(0, 16)}${variant}${versioned.slice(17)}`;
    return `${bits.slice(0, 8)}-${bits.slice(8, 12)}-${bits.slice(12, 16)}-${bits.slice(16, 20)}-${bits.slice(20)}`;
  }

  it('matches the RFC 4122 v5 construction', () => {
    expect(uuidV5('www.example.com', '6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(
      rfcReference('www.example.com', '6ba7b810-9dad-11d1-80b4-00c04fd430c8'),
    );
    // Pinned so a silent change to the project namespace cannot pass unnoticed.
    expect(idFor('store', 'seed-alpha')).toBe('f0d039a1-37d3-5f27-b9f2-f2fa5a0a6382');
  });

  it('stamps version 5 and the RFC variant', () => {
    const id = idFor('product', 'seed-alpha', 12);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('is stable when unrelated rows are generated first', () => {
    const before = idFor('product', 'seed-alpha', 7);
    for (let i = 0; i < 25; i += 1) idFor('product', 'seed-beta', i);
    const after = idFor('product', 'seed-alpha', 7);
    expect(after).toBe(before);
    // Name and namespace sensitivity: both halves of the input matter.
    expect(idFor('product', 'seed-alpha', 8)).not.toBe(before);
    expect(uuidV5('same-name', SEED_NAMESPACE)).not.toBe(
      uuidV5('same-name', '6ba7b810-9dad-11d1-80b4-00c04fd430c8'),
    );
  });

  it('rejects a malformed namespace instead of hashing garbage', () => {
    expect(() => uuidV5('x', 'not-a-uuid')).toThrow(/namespace/);
  });

  it('canonicalises JSON so digests ignore key order', () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }] })).toBe(canonicalJson({ a: [{ c: 3, d: 2 }], b: 1 }));
    expect(canonicalJson({ a: undefined, b: 1 })).toBe('{"b":1}');
    expect(canonicalJson([1, 'two', null])).toBe('[1,"two",null]');
  });
});
