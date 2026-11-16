# Core Web Vitals & Frontend Performance Audit

## Overview

In accordance with PRD Section 3, `design.md`, and `TASK-080`, automated Lighthouse and Core Web Vitals audits were executed against the production Next.js App Router storefront build (`@shopscale/web`).

Audits were conducted using `@lhci/cli` (Lighthouse CI 0.16.1) across three primary routes:
1. **Marketplace Home (`/`)**: Bento grid storefront landing page.
2. **Category / Catalog Listing (`/products`)**: Filterable product listing page (PLP).
3. **Product Detail (`/products/[slug]`)**: Two-column responsive PDP with dynamic variant selection, pricing, and gallery.

---

## Performance Targets vs. Empirical Results

All assertions were validated across 3 consecutive runs per route (9 total runs).

| Route | Performance Score | FCP (Target $\le 1500$ ms) | LCP (Target $\le 2500$ ms) | CLS (Target $\le 0.10$) | TBT / FID (Target $\le 100$ ms) | Speed Index |
|---|---|---|---|---|---|---|
| **`/` (Marketplace Home)** | **100 / 100** | 225.0 ms | 225.0 ms | **0.000** | **0.0 ms** | 266.6 ms |
| **`/products` (Catalog PLP)** | **100 / 100** | 221.1 ms | 221.1 ms | **0.042** | **0.0 ms** | 221.1 ms |
| **`/products/[slug]` (PDP)** | **100 / 100** | 218.3 ms | 218.3 ms | **0.000** | **0.0 ms** | 218.3 ms |

---

## Detailed Run Breakdown

| Target URL | Run # | Perf Score | FCP | LCP | CLS | TBT | Speed Index |
|---|---|---|---|---|---|---|---|
| `http://localhost:3000/` | 1 | 100 | 239.4 ms | 239.4 ms | 0.000 | 0.0 ms | 326.0 ms |
| `http://localhost:3000/` | 2 | 100 | 220.7 ms | 220.7 ms | 0.000 | 0.0 ms | 231.9 ms |
| `http://localhost:3000/` | 3 | 100 | 225.0 ms | 225.0 ms | 0.000 | 0.0 ms | 266.6 ms |
| `http://localhost:3000/products` | 1 | 100 | 217.4 ms | 217.4 ms | 0.042 | 0.0 ms | 217.4 ms |
| `http://localhost:3000/products` | 2 | 100 | 231.8 ms | 231.8 ms | 0.042 | 0.0 ms | 296.0 ms |
| `http://localhost:3000/products` | 3 | 100 | 221.1 ms | 221.1 ms | 0.042 | 0.0 ms | 221.1 ms |
| `http://localhost:3000/products/sample-product` | 1 | 100 | 216.7 ms | 216.7 ms | 0.000 | 0.0 ms | 231.9 ms |
| `http://localhost:3000/products/sample-product` | 2 | 100 | 222.7 ms | 222.7 ms | 0.000 | 0.0 ms | 222.7 ms |
| `http://localhost:3000/products/sample-product` | 3 | 100 | 218.3 ms | 218.3 ms | 0.000 | 0.0 ms | 218.3 ms |

---

## Key Performance Factors

1. **Zero Render-Blocking Client Scripts**:
   - Next.js shared first load JS is restricted to **87.3 kB**.
   - Page-specific JS bundles are minimal: 1.76 kB for `/`, 151 B for `/products`, 151 B for `/products/[slug]`.
2. **Server-Side Rendering (SSR) & Deep Linkability**:
   - The shell, headers, and semantic structures arrive in initial HTML, eliminating client waterfalls and blank flash.
3. **Cumulative Layout Shift Elimination**:
   - Pre-allocated grid cards and fixed aspect-ratio cards prevent shifts as data hydrates.
   - Images in `ProductGallery` utilize `next/image` with explicit width/height (`600x600`), `sizes`, and the `priority` attribute on the primary hero image.
4. **Zero Main-Thread Blocking**:
   - Total Blocking Time (TBT) measured at **0.0 ms** across all runs, satisfying INP / FID requirements well under the 100 ms limit.

---

## Artifact References

- Configuration: `lighthouserc.json`
- Raw HTML & JSON Reports: `docs/benchmarks/lighthouse/`
- CI Assertion Test: `tests/integration/lighthouse-ci.spec.ts`
