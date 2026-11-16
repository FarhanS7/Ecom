// loadtests/search-stress.js - k6 stress test for full-text search & autocomplete (TASK-079).
// Invariants:
// 1. 200 concurrent virtual users generating search and autocomplete queries.
// 2. Realistic typo injection (e.g., 'hedphone', 'keybord', 'wirless') testing pg_trgm fuzzy matching.
// 3. Search query latency p95 < 150ms.
// 4. Autocomplete suggestion latency p95 < 50ms.
// 5. Error rate < 0.5%.

import http from 'k6/http';
import { check, group } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const searchLatency = new Trend('search_duration', true);
const autocompleteLatency = new Trend('autocomplete_duration', true);
const searchErrors = new Rate('search_errors');

export const options = {
  scenarios: {
    search_stress: {
      executor: 'ramping-vus',
      startVUs: 10,
      stages: [
        { target: 50, duration: '1m' },   // Initial warm-up
        { target: 200, duration: '3m' },  // Ramp to 200 concurrent VUs
        { target: 200, duration: '5m' },  // Sustain 200 VUs under typo stress
        { target: 0, duration: '1m' },    // Cool down
      ],
    },
  },
  thresholds: {
    'search_duration': ['p(95)<150'],          // PRD Section 7: Search p95 < 150ms
    'autocomplete_duration': ['p(95)<50'],     // PRD Section 7: Autocomplete p95 < 50ms
    'search_errors': ['rate<0.005'],           // Error rate < 0.5%
    'http_req_failed': ['rate<0.005'],
    'checks': ['rate>0.995'],
  },
};

const BASE_URL = __ENV.API_BASE_URL || 'http://127.0.0.1:3000';

const DICTIONARY = [
  { exact: 'headphones', typo: 'hedphone' },
  { exact: 'keyboard', typo: 'keybord' },
  { exact: 'wireless', typo: 'wirless' },
  { exact: 'monitor', typo: 'moitor' },
  { exact: 'bluetooth', typo: 'blutooth' },
  { exact: 'mechanical', typo: 'mechanicall' },
  { exact: 'espresso', typo: 'expresso' },
  { exact: 'speaker', typo: 'speeker' },
  { exact: 'chair', typo: 'chare' },
  { exact: 'adapter', typo: 'adaptr' },
];

export default function () {
  const item = DICTIONARY[Math.floor(Math.random() * DICTIONARY.length)];
  const useTypo = Math.random() < 0.35; // 35% typo queries to exercise fuzzy tri-gram index
  const query = useTypo ? item.typo : item.exact;

  // 1. Autocomplete query prefix
  group('Autocomplete', () => {
    const prefix = query.slice(0, Math.min(query.length, 3));
    const url = `${BASE_URL}/v1/search/autocomplete?q=${prefix}`;
    const res = http.get(url, { tags: { endpoint: 'autocomplete' } });
    autocompleteLatency.add(res.timings.duration);

    const ok = check(res, {
      'autocomplete status is 200': (r) => r.status === 200,
      'autocomplete returns array': (r) => {
        try {
          const body = JSON.parse(r.body);
          return Array.isArray(body.suggestions);
        } catch {
          return false;
        }
      },
    });
    searchErrors.add(!ok);
  });

  // 2. Full Search query with filters
  group('FullSearch', () => {
    const url = `${BASE_URL}/v1/search?q=${query}&limit=20`;
    const res = http.get(url, { tags: { endpoint: 'search' } });
    searchLatency.add(res.timings.duration);

    const ok = check(res, {
      'search status is 200': (r) => r.status === 200,
      'search returns result items': (r) => {
        try {
          const body = JSON.parse(r.body);
          return Array.isArray(body.items);
        } catch {
          return false;
        }
      },
    });
    searchErrors.add(!ok);
  });
}
