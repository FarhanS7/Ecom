// packages/backend/src/db/seed/distributions.test.ts - Unit tests for statistical seed distributions (TASK-077).
import { describe, expect, it } from 'vitest';
import {
  ZipfSampler,
  generateLogNormalPrice,
  generateSeasonalOrderTimestamp,
} from './distributions.js';
import { seedRandom } from './random.js';

describe('Seed Distributions (TASK-077 Unit Tests)', () => {
  describe('ZipfSampler (Product Popularity Power-Law)', () => {
    it('validates bounds on constructor parameters', () => {
      expect(() => new ZipfSampler(0)).toThrow(/positive/);
      expect(() => new ZipfSampler(-5)).toThrow(/positive/);
      expect(() => new ZipfSampler(100, 0)).toThrow(/positive/);
      expect(() => new ZipfSampler(100, -0.5)).toThrow(/positive/);
    });

    it('theoretically proves top 1% accounts for >= 25% of volume', () => {
      // Test across different catalog sizes: 1k (Tier S), 10k (Tier M), 100k (Tier L)
      const sizes = [1000, 10_000, 100_000];

      for (const n of sizes) {
        const sampler = new ZipfSampler(n, 0.9);
        const top1PercentWeight = sampler.topFractionWeight(0.01);
        // Requirement: top 1% of products account for >= 25% of orders
        expect(top1PercentWeight).toBeGreaterThanOrEqual(0.25);
      }
    });

    it('empirically verifies sampled distribution matches power-law skew', () => {
      const rng = seedRandom(42);
      const n = 1000;
      const sampler = new ZipfSampler(n, 0.95);
      const sampleCount = 20_000;
      const counts = new Uint32Array(n);

      for (let i = 0; i < sampleCount; i += 1) {
        const rank = sampler.sample(rng);
        expect(rank).toBeGreaterThanOrEqual(0);
        expect(rank).toBeLessThan(n);
        counts[rank] += 1;
      }

      // Check top 1% (ranks 0 to 9 out of 1000 items)
      let top1PercentSamples = 0;
      for (let i = 0; i < 10; i += 1) {
        top1PercentSamples += counts[i]!;
      }

      const empiricalFraction = top1PercentSamples / sampleCount;
      expect(empiricalFraction).toBeGreaterThanOrEqual(0.25);

      // Rank 0 should have more samples than rank 1, rank 1 more than rank 10, etc.
      expect(counts[0]!).toBeGreaterThan(counts[1]!);
      expect(counts[0]!).toBeGreaterThan(counts[10]!);
      expect(counts[10]!).toBeGreaterThan(counts[100]!);
    });
  });

  describe('generateLogNormalPrice', () => {
    it('strictly respects min and max price boundaries in cents', () => {
      const rng = seedRandom(101);
      const minCents = 499; // $4.99
      const maxCents = 150_000; // $1,500.00

      for (let i = 0; i < 500; i += 1) {
        const price = generateLogNormalPrice(rng, { minCents, maxCents });
        expect(price).toBeGreaterThanOrEqual(minCents);
        expect(price).toBeLessThanOrEqual(maxCents);
        expect(Number.isInteger(price)).toBe(true);
      }
    });

    it('produces realistic right-skewed pricing distribution', () => {
      const rng = seedRandom(202);
      const prices: number[] = [];
      const sampleCount = 5000;

      for (let i = 0; i < sampleCount; i += 1) {
        prices.push(generateLogNormalPrice(rng, { medianCents: 3000, sigma: 0.85 }));
      }

      prices.sort((a, b) => a - b);
      const median = prices[Math.floor(sampleCount / 2)]!;
      const p90 = prices[Math.floor(sampleCount * 0.9)]!;
      const p99 = prices[Math.floor(sampleCount * 0.99)]!;

      // Median should be close to 3000 cents ($30)
      expect(median).toBeGreaterThan(2000);
      expect(median).toBeLessThan(4000);

      // 90th percentile should reflect higher priced catalog items ($80 - $250)
      expect(p90).toBeGreaterThan(median);
      expect(p99).toBeGreaterThan(p90);
    });
  });

  describe('generateSeasonalOrderTimestamp', () => {
    it('generates timestamps within requested window', () => {
      const rng = seedRandom(303);
      const baseEpoch = Date.UTC(2025, 0, 1, 0, 0, 0);
      const windowDays = 60;

      for (let i = 0; i < 100; i += 1) {
        const date = generateSeasonalOrderTimestamp(rng, {
          baseEpochMs: baseEpoch,
          windowDays,
        });

        const time = date.getTime();
        expect(time).toBeLessThanOrEqual(baseEpoch + 86_400_000);
        expect(time).toBeGreaterThanOrEqual(baseEpoch - (windowDays * 86_400_000));
      }
    });
  });
});
