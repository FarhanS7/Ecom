// @shopscale/web - Marketplace landing page (T007b, server component).
// Health state is fetched SERVER-side straight from the API origin (no
// browser round-trip, no secrets: only public /health/* shapes). The browser
// path is proven separately by <GatewayProbe/>, which calls our own gateway.

import { apiBaseUrl } from '@/lib/api';
import { GatewayProbe } from './gateway-probe';

// Health state must be fresh per request, never frozen at build time.
export const dynamic = 'force-dynamic';

type HealthState = { status: 'ok' | 'degraded' | 'unreachable'; detail: string };

async function fetchHealth(path: 'health/live' | 'health/ready'): Promise<HealthState> {
  let base: string;
  try {
    base = apiBaseUrl();
  } catch (err) {
    return {
      status: 'unreachable',
      detail: err instanceof Error ? err.message : 'API origin not configured.',
    };
  }
  try {
    const res = await fetch(`${base}/${path}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (path === 'health/live') {
      return res.ok
        ? { status: 'ok', detail: 'API process is alive.' }
        : { status: 'unreachable', detail: `Liveness answered ${res.status}.` };
    }
    if (res.ok) return { status: 'ok', detail: 'All dependencies are ready.' };
    if (res.status === 503) return { status: 'degraded', detail: 'A dependency is unavailable.' };
    return { status: 'unreachable', detail: `Readiness answered ${res.status}.` };
  } catch {
    return { status: 'unreachable', detail: 'The API did not answer in time.' };
  }
}

export default async function HomePage() {
  const [live, ready] = await Promise.all([fetchHealth('health/live'), fetchHealth('health/ready')]);

  return (
    <section aria-labelledby="page-title">
      <h1 id="page-title">ShopScale Marketplace</h1>
      <p>Discover products from independent sellers.</p>

      <h2>Platform status</h2>
      <dl>
        <div>
          <dt>API liveness</dt>
          <dd data-testid="api-liveness">
            {live.status} — {live.detail}
          </dd>
        </div>
        <div>
          <dt>API readiness</dt>
          <dd data-testid="api-readiness">
            {ready.status} — {ready.detail}
          </dd>
        </div>
      </dl>

      <h2>Same-origin gateway</h2>
      <p>
        Browsers call <code>/api/…</code> on this origin; the server forwards
        only allowlisted paths to the API. Live probe:
      </p>
      <GatewayProbe />
    </section>
  );
}
