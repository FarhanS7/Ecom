// @shopscale/web - Marketplace landing page (T007b shell, T024b bento home).
// Server component. The bento home renders REAL products from the public
// channel read (server-side, no browser round-trip, no secrets). Health state
// is still fetched server-side and the browser path is still proven by
// <GatewayProbe/> — the T007 shell contract keeps its observable testids.

import { apiBaseUrl } from '@/lib/api';
import { GatewayProbe } from './gateway-probe';
import { Card } from '@/components/ui';
import { StorefrontHome } from '@/features/storefront/home';
import { loadHomeContent } from '@/features/storefront/load';

// Fresh per request, never frozen at build time.
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
  const [content, live, ready] = await Promise.all([
    loadHomeContent({ channel: 'marketplace' }),
    fetchHealth('health/live'),
    fetchHealth('health/ready'),
  ]);

  return (
    <>
      <StorefrontHome content={content} />

      <Card as="section" labelledBy="status-heading">
        <h2 id="status-heading" className="type-card-title">
          Platform status
        </h2>
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
        <h3 className="type-body-sm">Same-origin gateway</h3>
        <p className="type-body-sm">
          Browsers call <code>/api/…</code> on this origin; the server forwards only allowlisted
          paths to the API. Live probe:
        </p>
        <GatewayProbe />
      </Card>
    </>
  );
}
