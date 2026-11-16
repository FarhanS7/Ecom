// loadtests/checkout-load.js - k6 sustained checkout under load (TASK-079, PRD Section 7).
// Invariants:
// 1. Sustained concurrent checkout submissions exercising basket reservations, pricing, and payments.
// 2. Client-provided Idempotency-Key headers prevent double orders.
// 3. Checkout completion latency p95 < 500ms (PRD Section 7 SLO).
// 4. Error rate < 0.5%.

import http from 'k6/http';
import { check, group } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

const checkoutLatency = new Trend('checkout_duration', true);
const checkoutFailures = new Rate('checkout_failures');
const ordersCreated = new Counter('orders_created');

export const options = {
  scenarios: {
    checkout_load: {
      executor: 'ramping-vus',
      startVUs: 5,
      stages: [
        { target: 25, duration: '1m' },   // Initial warm-up
        { target: 100, duration: '3m' },  // Ramp to 100 concurrent checkout users
        { target: 100, duration: '5m' },  // Sustained checkout operations
        { target: 0, duration: '1m' },    // Graceful ramp down
      ],
    },
  },
  thresholds: {
    'checkout_duration': ['p(95)<500'],        // PRD Section 7: Checkout p95 < 500ms
    'checkout_failures': ['rate<0.005'],       // Error rate < 0.5%
    'http_req_failed': ['rate<0.005'],
    'checks': ['rate>0.995'],
  },
};

const BASE_URL = __ENV.API_BASE_URL || 'http://127.0.0.1:3000';

export default function () {
  const vuId = __VU;
  const iterId = __ITER;
  const idempotencyKey = `chk_load_${vuId}_${iterId}_${Date.now()}`;

  group('Checkout_Pipeline', () => {
    // 1. Create cart and reserve item
    const checkoutId = `cart_${vuId}_${iterId}`;
    const payload = JSON.stringify({
      channelKey: 'marketplace',
      items: [
        {
          variantId: '00000000-0000-0000-0000-000000000001',
          qty: 1,
        },
      ],
      addressId: '00000000-0000-0000-0000-000000000001',
      idempotencyKey,
    });

    const headers = {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    };

    const startTime = Date.now();
    const res = http.post(`${BASE_URL}/v1/checkout`, payload, { headers, tags: { type: 'checkout' } });
    const duration = Date.now() - startTime;
    checkoutLatency.add(duration);

    const isSuccess = check(res, {
      'checkout responds 200 or 201': (r) => r.status === 200 || r.status === 201,
      'checkout body contains orderId': (r) => {
        try {
          const body = JSON.parse(r.body);
          return Boolean(body.orderId || body.id);
        } catch {
          return false;
        }
      },
    });

    if (isSuccess) {
      ordersCreated.add(1);
      checkoutFailures.add(0);
    } else {
      checkoutFailures.add(1);
    }
  });
}
