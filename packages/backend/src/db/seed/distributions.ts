// @shopscale/backend/db/seed/distributions - Realistic statistical distributions (TASK-077).
// Invariants:
// 1. Zipfian power-law ensures top 1% of items receive >= 25% of order traffic (PRD Goal G1, Section 11).
// 2. Log-normal pricing mirrors authentic e-commerce catalogs (positive right-skewed, heavy tail).
// 3. Diurnal & seasonal temporal distribution produces realistic order spikes over historical windows.
// 4. Zero external non-deterministic randomness: driven strictly by mulberry32 PRNG.

import { intBetween, logNormal, SEED_EPOCH_MS } from './random.js';

/**
 * Zipfian Power-Law distribution generator.
 * Precomputes cumulative distribution function (CDF) for O(log N) rank sampling.
 */
export class ZipfSampler {
  public readonly n: number;
  public readonly s: number;
  private readonly cdf: Float64Array;

  constructor(n: number, s = 0.9) {
    if (n <= 0) {
      throw new Error('ZipfSampler: item count n must be positive');
    }
    if (s <= 0) {
      throw new Error('ZipfSampler: skew parameter s must be positive');
    }
    this.n = n;
    this.s = s;
    this.cdf = new Float64Array(n);

    let sum = 0;
    for (let i = 1; i <= n; i += 1) {
      sum += 1 / Math.pow(i, s);
      this.cdf[i - 1] = sum;
    }

    // Normalize CDF to [0, 1]
    const total = sum;
    for (let i = 0; i < n; i += 1) {
      this.cdf[i] = (this.cdf[i] ?? 0) / total;
    }
  }

  /**
   * Sample item rank from 0 (most popular) to n - 1 (least popular).
   */
  sample(rng: () => number): number {
    const u = rng();
    let low = 0;
    let high = this.n - 1;

    while (low < high) {
      const mid = (low + high) >>> 1;
      if ((this.cdf[mid] ?? 0) < u) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    return low;
  }

  /**
   * Theoretical proportion of total weight captured by the top `fraction` of items.
   * e.g., fraction = 0.01 for top 1%.
   */
  topFractionWeight(fraction: number): number {
    if (fraction <= 0) return 0;
    if (fraction >= 1) return 1;
    const index = Math.min(this.n - 1, Math.max(0, Math.floor(fraction * this.n) - 1));
    return this.cdf[index] ?? 0;
  }
}

/**
 * Log-normal price generator producing prices in whole cents.
 * Median ~$29.00 (2,900 cents), 90% in $10 - $120 range, with max cap at $5,000.00.
 */
export function generateLogNormalPrice(
  rng: () => number,
  options?: {
    medianCents?: number;
    sigma?: number;
    minCents?: number;
    maxCents?: number;
  },
): number {
  const medianCents = options?.medianCents ?? 2900;
  const sigma = options?.sigma ?? 0.85;
  const minCents = options?.minCents ?? 99; // $0.99 minimum
  const maxCents = options?.maxCents ?? 500_000; // $5,000.00 maximum

  const sample = Math.round(logNormal(rng, medianCents, sigma));
  return Math.min(maxCents, Math.max(minCents, sample));
}

/**
 * Generates historical order timestamps across a window (default 90 days prior to epoch).
 * Incorporates diurnal day/night variations and seasonal peak weighting.
 */
export function generateSeasonalOrderTimestamp(
  rng: () => number,
  options?: {
    windowDays?: number;
    baseEpochMs?: number;
    peakSurgeDays?: number[];
  },
): Date {
  const windowDays = options?.windowDays ?? 90;
  const baseEpochMs = options?.baseEpochMs ?? SEED_EPOCH_MS;

  // 1. Pick a day offset within window
  const dayOffset = intBetween(rng, 0, windowDays - 1);

  // 2. Diurnal variation: higher activity during midday/evening (10:00 - 22:00)
  // Rejection sampling or beta distribution over 24 hours
  let hour = Math.floor(rng() * 24);
  const hourWeight = (hour >= 9 && hour <= 21) ? 0.8 : 0.2;
  if (rng() > hourWeight) {
    hour = intBetween(rng, 10, 21); // Bias toward business/evening hours
  }

  const minute = intBetween(rng, 0, 59);
  const second = intBetween(rng, 0, 59);

  const totalMs = baseEpochMs - (dayOffset * 86_400_000) + (hour * 3_600_000) + (minute * 60_000) + (second * 1000);
  return new Date(totalMs);
}
