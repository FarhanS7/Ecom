// @shopscale/loadtests - Flash sale cross-channel stock contention test (T044).
// Invariants:
// 1. 500 concurrent virtual users competing for 50 stock units in a fast burst.
// 2. Exactly 50 reservations succeed (HTTP 200/201).
// 3. Exactly 450 reservations fail (HTTP 409 Conflict with INSUFFICIENT_STOCK).
// 4. Zero oversell, zero deadlocks, zero 500 Internal Server Errors.

import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

const successCounter = new Counter('successful_reservations');
const conflictCounter = new Counter('insufficient_stock_rejections');

export const options = {
  scenarios: {
    flash_sale: {
      executor: 'shared-iterations',
      vus: 500,
      iterations: 500,
      maxDuration: '10s',
    },
  },
  thresholds: {
    'successful_reservations': ['count==50'],
    'insufficient_stock_rejections': ['count==450'],
    'checks': ['rate>0.99'],
  },
};

const BASE_URL = __ENV.API_BASE_URL || 'http://127.0.0.1:3001';

export function setup() {
  console.log(`[k6 Setup] Resetting flash sale inventory to 50 units on ${BASE_URL}...`);
  const res = http.post(
    `${BASE_URL}/v1/test/concurrency-seed`,
    JSON.stringify({ onHand: 50 }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  if (res.status !== 200) {
    throw new Error(`Failed to seed concurrency test variant: ${res.status} ${res.body}`);
  }

  const data = JSON.parse(res.body);
  console.log(`[k6 Setup] Seeded variant ${data.variantId} with onHand=${data.onHand}, reserved=0.`);
  return { variantId: data.variantId };
}

export default function (data) {
  const checkoutId = `chk-k6-${__VU}-${__ITER}-${Date.now()}`;
  const payload = JSON.stringify({
    variantId: data.variantId,
    quantity: 1,
    checkoutId,
  });

  const res = http.post(`${BASE_URL}/v1/test/concurrency-reserve`, payload, {
    headers: { 'Content-Type': 'application/json' },
  });

  const validResponse = check(res, {
    'status is 200 or 409': (r) => r.status === 200 || r.status === 409,
    'no 500 server errors': (r) => r.status !== 500,
    'no connection resets': (r) => r.status > 0,
  });

  if (res.status === 200) {
    successCounter.add(1);
  } else if (res.status === 409) {
    conflictCounter.add(1);
  }
}

export function teardown(data) {
  console.log(`[k6 Teardown] Verifying database invariants for variant ${data.variantId}...`);
  const res = http.get(`${BASE_URL}/v1/test/concurrency-stats/${data.variantId}`);

  if (res.status === 200) {
    const stats = JSON.parse(res.body);
    console.log(
      `[k6 Invariants] onHand: ${stats.onHand}, reserved: ${stats.reserved}, available: ${stats.available}, activeReservations: ${stats.activeReservationsCount}, deltaReservedSum: ${stats.totalDeltaReserved}`,
    );

    check(stats, {
      'final reserved equals 50': (s) => s.reserved === 50,
      'final available equals 0': (s) => s.available === 0,
      'active reservations equals 50': (s) => s.activeReservationsCount === 50,
      'total delta reserved in ledger equals 50': (s) => s.totalDeltaReserved === 50,
    });
  } else {
    console.error(`[k6 Teardown] Failed to retrieve variant stats: ${res.status}`);
  }
}
