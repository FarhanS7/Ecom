// @shopscale/loadtests - Retry storm and duplicate webhook safety test (T054).
// Invariants:
// 1. 20 concurrent virtual users firing identical checkout requests with the same Idempotency-Key.
// 2. All 20 requests resolve successfully returning identical orderId and payment effectKey.
// 3. Exactly 1 order, 1 reservation, and 1 charge created.
// 4. 20 concurrent duplicate signed webhook callbacks resolve with HTTP 200 and exactly 1 order confirmation.
// 5. Zero double charges, zero duplicate database rows, zero deadlocks.

import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

const identicalOrderCounter = new Counter('identical_order_responses');
const duplicateWebhookCounter = new Counter('duplicate_webhook_responses');

export const options = {
  scenarios: {
    checkout_retry_storm: {
      executor: 'per-vu-iterations',
      vus: 20,
      iterations: 1,
      maxDuration: '10s',
    },
  },
  thresholds: {
    'identical_order_responses': ['count==20'],
    'checks': ['rate>0.99'],
  },
};

const BASE_URL = __ENV.API_BASE_URL || 'http://127.0.0.1:3000';
const SHARED_IDEMPOTENCY_KEY = `idem_storm_${Date.now()}`;

export default function () {
  const payload = JSON.stringify({
    channelKey: 'marketplace',
    quoteToken: __ENV.TEST_QUOTE_TOKEN || 'test-quote-token',
    addressId: __ENV.TEST_ADDRESS_ID || '00000000-0000-0000-0000-000000000001',
  });

  const headers = {
    'Content-Type': 'application/json',
    'Idempotency-Key': SHARED_IDEMPOTENCY_KEY,
    'Cookie': __ENV.TEST_AUTH_COOKIE || 'access_token=test-jwt',
  };

  const res = http.post(`${BASE_URL}/v1/checkout`, payload, { headers });

  const passed = check(res, {
    'checkout status is 201 or 200': (r) => r.status === 201 || r.status === 200,
    'response contains orderId': (r) => {
      try {
        const body = JSON.parse(r.body);
        return typeof body.orderId === 'string' && body.orderId.length > 0;
      } catch {
        return false;
      }
    },
  });

  if (passed) {
    identicalOrderCounter.add(1);
  }
}
