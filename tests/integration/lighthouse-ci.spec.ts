import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Frontend Core Web Vitals & Lighthouse Benchmarks', () => {
  const manifestPath = path.resolve(process.cwd(), 'docs/benchmarks/lighthouse/manifest.json');

  it('generates lighthouse manifest and reports', () => {
    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(Array.isArray(manifest)).toBe(true);
    expect(manifest.length).toBeGreaterThanOrEqual(3);
  });

  it('satisfies Core Web Vitals and Performance Score >= 90 across all audited routes', () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    for (const entry of manifest) {
      expect(fs.existsSync(entry.jsonPath)).toBe(true);
      const lhr = JSON.parse(fs.readFileSync(entry.jsonPath, 'utf8'));

      // Performance score >= 0.90 (90%)
      const perfScore = lhr.categories.performance.score;
      expect(perfScore).toBeGreaterThanOrEqual(0.9);

      // First Contentful Paint <= 1500ms
      const fcp = lhr.audits['first-contentful-paint'].numericValue;
      expect(fcp).toBeLessThanOrEqual(1500);

      // Largest Contentful Paint <= 2500ms
      const lcp = lhr.audits['largest-contentful-paint'].numericValue;
      expect(lcp).toBeLessThanOrEqual(2500);

      // Cumulative Layout Shift <= 0.1
      const cls = lhr.audits['cumulative-layout-shift'].numericValue;
      expect(cls).toBeLessThanOrEqual(0.1);

      // Total Blocking Time <= 100ms
      const tbt = lhr.audits['total-blocking-time'].numericValue;
      expect(tbt).toBeLessThanOrEqual(100);
    }
  });
});
