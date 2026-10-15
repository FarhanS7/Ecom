// @shopscale/backend/db/seed/random - T028a deterministic generation core.
//
// The seed's entire promise is "SEED=42 reproduces the same dataset", so this
// module forbids the three inputs that would break it: `Math.random`, `Date.now`,
// and any consumption-order coupling. Ids are NAME-ADDRESSED (uuidV5 over a
// fixed namespace), which means adding a product never shifts the ids of the
// products generated after it — a property the RNG-stream alternative cannot
// offer. Randomness is only used for *values* (prices, picks, distributions),
// never for identity.

import { createHash } from 'node:crypto';

/**
 * Fixed namespace for every seeded id. Changing this constant re-ids the whole
 * dataset, which is a deliberate, reviewable act — never an accident.
 * (Version 4 shape is irrelevant here: an RFC 4122 namespace is just a UUID.)
 */
export const SEED_NAMESPACE = '6b3f0c1a-5b8e-4c2d-9f7a-1d2e3f4a5b6c';

/**
 * Fixed epoch for every seeded timestamp. Real clocks would make two runs of the
 * same seed differ by microseconds, so the seed instead derives timestamps from
 * this constant plus a deterministic offset. Consequence: seeded rows are
 * byte-identical across runs and machines, and "newest first" ordering is stable.
 */
export const SEED_EPOCH_MS = Date.UTC(2025, 0, 1, 0, 0, 0);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * mulberry32 — 32-bit PRNG chosen for a small, readable, well-tested state
 * transition and even output. Deterministic: the same seed yields the same
 * sequence, on every platform, forever (integer ops only, no floats in state).
 */
export function seedRandom(seed: number): () => number {
  let state = (seed >>> 0) + 0x9e3779b9;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function namespaceBytes(namespace: string): Buffer {
  if (!UUID_PATTERN.test(namespace)) {
    throw new Error('uuidV5: namespace must be a lowercase hyphenated uuid');
  }
  return Buffer.from(namespace.replace(/-/g, ''), 'hex');
}

/**
 * RFC 4122 version-5 (SHA-1, name-based) UUID.
 *
 * Name-addressed ids are what make the seed *stable* as it grows: `idFor('product',
 * 'seed-alpha', 7)` is the same uuid no matter how many rows were generated
 * before it, so a checksum diff after adding a category shows the category and
 * nothing else.
 */
export function uuidV5(name: string, namespace: string = SEED_NAMESPACE): string {
  const digest = createHash('sha1')
    .update(namespaceBytes(namespace))
    .update(Buffer.from(name, 'utf8'))
    .digest();
  const bytes = Buffer.from(digest.subarray(0, 16));
  // Version 5 in the high nibble of byte 6; RFC 4122 variant (10xx) in byte 8.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

/** A deterministic id for one entity. Parts are joined with `:` as the name. */
export function idFor(kind: string, ...parts: Array<string | number>): string {
  return uuidV5(`${kind}:${parts.join(':')}`);
}

/** Inclusive integer in [min, max]. */
export function intBetween(rng: () => number, min: number, max: number): number {
  if (max < min) throw new Error('intBetween: max must be >= min');
  return min + Math.floor(rng() * (max - min + 1));
}

/** Uniform pick; throws on an empty list rather than returning undefined. */
export function pick<T>(rng: () => number, items: readonly T[]): T {
  const item = items[Math.floor(rng() * items.length)];
  if (item === undefined) throw new Error('pick: empty list');
  return item;
}

/**
 * Weighted pick. Zero-weight entries are never returned, which is what lets the
 * generators express "2% archived" without a second code path.
 */
export function weighted<T>(rng: () => number, entries: ReadonlyArray<readonly [T, number]>): T {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  if (total <= 0) throw new Error('weighted: weights must sum above zero');
  let roll = rng() * total;
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll < 0) return value;
  }
  // Only reachable on floating-point drift at the very end of the range.
  return entries[entries.length - 1]![0];
}

/**
 * Log-normal sample (Box-Muller). Real price and popularity distributions are
 * multiplicative, so a uniform spread would make the seeded catalog useless for
 * sorting, pagination, and price-band work.
 */
export function logNormal(rng: () => number, median: number, sigma: number): number {
  let u = rng();
  let v = rng();
  if (u <= 0) u = Number.EPSILON;
  if (v <= 0) v = Number.EPSILON;
  const normal = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return median * Math.exp(sigma * normal);
}

/** Log-normal sample rounded to whole cents, clamped to a sane storefront band. */
export function priceCents(rng: () => number, medianCents = 2400, sigma = 0.9): number {
  const sample = Math.round(logNormal(rng, medianCents, sigma));
  return Math.min(Math.max(sample, 99), 500_000);
}

/** Deterministic ISO timestamp: the seed epoch plus whole minutes. */
export function isoAt(minutesFromEpoch: number): string {
  return new Date(SEED_EPOCH_MS + Math.round(minutesFromEpoch) * 60_000).toISOString();
}

/** Stable, locale-free key ordering for digests and JSONB comparisons. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
}
