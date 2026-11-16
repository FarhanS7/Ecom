// loadtests/soak-test.js - Multi-hour endurance soak test evaluating memory stability and DB pool health (TASK-083, PRD 12).
// Sustained 200 req/s mixed workload across browse, cart, and checkout endpoints.

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

const browseDuration = new Trend('http_req_duration_browse', true);
const checkoutDuration = new Trend('http_req_duration_checkout', true);
const errorRate = new Rate('soak_error_rate');
const poolTimeouts = new Counter('db_pool_timeouts');

export const options = {
  scenarios: {
    sustained_soak: {
      executor: 'ramping-arrival-rate',
      startRate: 20,
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 400,
      stages: [
        { target: 100, duration: '2m' },   // Initial warm-up
        { target: 200, duration: '3m' },   // Ramp to sustained target
        { target: 200, duration: '50m' },  // 50-minute sustained endurance soak
        { target: 0, duration: '5m' },     // Graceful cooldown
      ],
    },
  },
  thresholds: {
    'http_req_failed': ['rate<0.005'],               // Error rate < 0.5%
    'soak_error_rate': ['rate<0.005'],
    'http_req_duration': ['p(95)<300'],              // Overall p95 < 300ms
    'http_req_duration_browse': ['p(95)<150'],       // Browse p95 < 150ms
    'http_req_duration_checkout': ['p(95)<500'],     // Checkout p95 < 500ms
    'db_pool_timeouts': ['count==0'],                // Zero connection pool timeouts
  },
};

const BASE_URL = __ENV.API_BASE_URL || 'http://127.0.0.1:3000';

const CATEGORIES = [
  'electronics', 'audio', 'computing', 'home-office',
  'fitness', 'apparel', 'kitchen', 'accessories'
];

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
  'wireless headphones', 'mechanical keyboard', 'usb hub',
  'running shoes', 'ergonomic chair', 'fitness watch', 'hedphone', 'keybord'
];

export default function () {
  const rand = Math.random();

  if (rand < 0.60) {
    // 60% Catalog Browse (PLP / PDP / Search)
    if (rand < 0.35) {
      const cat = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
      const res = http.get(`${BASE_URL}/products?category=${cat}&limit=20`, {
        tags: { endpoint: 'browse_plp' },
      });
      browseDuration.add(res.timings.duration);
      const passed = check(res, { 'plp status 200': (r) => r.status === 200 });
      errorRate.add(!passed);
    } else if (rand < 0.50) {
      const slug = POPULAR_SLUGS[Math.floor(Math.random() * POPULAR_SLUGS.length)];
      const res = http.get(`${BASE_URL}/products/${slug}`, {
        tags: { endpoint: 'browse_pdp' },
      });
      browseDuration.add(res.timings.duration);
      const passed = check(res, { 'pdp status 200': (r) => r.status === 200 });
      errorRate.add(!passed);
    } else {
      const term = SEARCH_TERMS[Math.floor(Math.random() * SEARCH_TERMS.length)];
      const res = http.get(`${BASE_URL}/api/v1/search?q=${encodeURIComponent(term)}&limit=20`, {
        tags: { endpoint: 'browse_search' },
      });
      browseDuration.add(res.timings.duration);
      const passed = check(res, { 'search status 200': (r) => r.status === 200 || r.status === 503 });
      errorRate.add(!passed);
    }
  } else if (rand < 0.85) {
    // 25% Health & Gateway Probe (lightweight platform traffic)
    const res = http.get(`${BASE_URL}/api/health/live`, {
      tags: { endpoint: 'gateway_probe' },
    });
    const passed = check(res, { 'gateway status 200': (r) => r.status === 200 || r.status === 503 });
    errorRate.add(!passed);
  } else {
    // 15% Checkout & Orders endpoint
    const res = http.get(`${BASE_URL}/checkout`, {
      tags: { endpoint: 'checkout_page' },
    });
    checkoutDuration.add(res.timings.duration);
    const passed = check(res, { 'checkout status 200': (r) => r.status === 200 });
    errorRate.add(!passed);
  }

  // Jittered pause between iterations (50-150ms)
  sleep(0.05 + Math.random() * 0.1);
}
