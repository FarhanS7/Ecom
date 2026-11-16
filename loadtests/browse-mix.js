// loadtests/browse-mix.js - k6 load test for browse traffic mix (TASK-079, PRD Section 7).
// Traffic Distribution:
// - 70% Category Product Listing (PLP): GET /v1/products?categorySlug=...&limit=20
// - 20% Product Detail Page (PDP): GET /v1/products/:slug
// - 10% Catalog Search: GET /v1/search?q=...
//
// Target SLOs:
// - Browse PLP: p95 < 150ms
// - PDP: p95 < 80ms
// - Search: p95 < 150ms
// - Error rate: < 0.5% (rate < 0.005)
// - Sustained throughput: >= 1,000 req/s

import http from 'k6/http';
import { check, group } from 'k6';
import { Trend, Rate } from 'k6/metrics';

// Custom metric trends for fine-grained SLO tracking
const plpDuration = new Trend('http_req_duration_plp', true);
const pdpDuration = new Trend('http_req_duration_pdp', true);
const searchDuration = new Trend('http_req_duration_search', true);
const errorRate = new Rate('error_rate');

export const options = {
  scenarios: {
    browse_mix: {
      executor: 'ramping-arrival-rate',
      startRate: 50,
      timeUnit: '1s',
      preAllocatedVUs: 200,
      maxVUs: 1000,
      stages: [
        { target: 250, duration: '1m' },   // Warm-up ramp
        { target: 1000, duration: '2m' },  // Scale to target throughput
        { target: 1000, duration: '7m' },  // Sustained load at 1,000 req/s
        { target: 0, duration: '1m' },     // Graceful ramp-down
      ],
    },
  },
  thresholds: {
    'http_req_failed': ['rate<0.005'],               // Error rate < 0.5%
    'http_req_duration_plp': ['p(95)<150'],          // PLP p95 < 150ms
    'http_req_duration_pdp': ['p(95)<80'],           // PDP p95 < 80ms
    'http_req_duration_search': ['p(95)<150'],       // Search p95 < 150ms
    'http_reqs': ['rate>=950'],                      // Target throughput
    'checks': ['rate>0.995'],
  },
};

const BASE_URL = __ENV.API_BASE_URL || 'http://127.0.0.1:3000';

const POPULAR_SLUGS = [
  'seed-wireless-noise-cancelling-headphones-pro',
  'seed-mechanical-gaming-keyboard-rgb',
  'seed-ultra-wide-curved-monitor-34-inch',
  'seed-ergonomic-mesh-office-chair-black',
  'seed-smart-fitness-watch-series-5',
  'seed-compact-espresso-machine-15-bar',
  'seed-portable-bluetooth-speaker-waterproof',
  'seed-usb-c-multiport-hub-adapter-7-in-1',
];

const SEARCH_TERMS = [
  'headphones', 'wireless', 'mechanical', 'keyboard', 'monitor',
  'chair', 'watch', 'espresso', 'bluetooth', 'speaker', 'usb-c',
];

export default function () {
  const roll = Math.random();

  if (roll < 0.70) {
    // 70% Category Product Listing (PLP)
    group('PLP_Browse', () => {
      const page = Math.floor(Math.random() * 5);
      const url = `${BASE_URL}/v1/products?limit=20&sort=newest`;
      const res = http.get(url, { tags: { type: 'browse' } });
      plpDuration.add(res.timings.duration);

      const success = check(res, {
        'PLP status is 200': (r) => r.status === 200,
        'PLP returns items': (r) => {
          try {
            const body = JSON.parse(r.body);
            return Array.isArray(body.items) && body.items.length > 0;
          } catch {
            return false;
          }
        },
      });
      errorRate.add(!success);
    });
  } else if (roll < 0.90) {
    // 20% Product Detail Page (PDP)
    group('PDP_Detail', () => {
      const slug = POPULAR_SLUGS[Math.floor(Math.random() * POPULAR_SLUGS.length)];
      const url = `${BASE_URL}/v1/products/${slug}`;
      const res = http.get(url, { tags: { type: 'pdp' } });
      pdpDuration.add(res.timings.duration);

      const success = check(res, {
        'PDP status is 200': (r) => r.status === 200,
        'PDP has title': (r) => {
          try {
            const body = JSON.parse(r.body);
            return typeof body.title === 'string' && body.title.length > 0;
          } catch {
            return false;
          }
        },
      });
      errorRate.add(!success);
    });
  } else {
    // 10% Search Query
    group('Catalog_Search', () => {
      const query = SEARCH_TERMS[Math.floor(Math.random() * SEARCH_TERMS.length)];
      const url = `${BASE_URL}/v1/search?q=${query}&limit=20`;
      const res = http.get(url, { tags: { type: 'search' } });
      searchDuration.add(res.timings.duration);

      const success = check(res, {
        'Search status is 200': (r) => r.status === 200,
        'Search returns results': (r) => {
          try {
            const body = JSON.parse(r.body);
            return Array.isArray(body.items);
          } catch {
            return false;
          }
        },
      });
      errorRate.add(!success);
    });
  }
}
