'use client';

// Client-side gateway probe (T007b). Calls OUR origin only — never the API
// origin, never with secrets. Proves the browser → gateway → API path renders
// real data in the browser.

import { useEffect, useState } from 'react';

type Probe = { state: 'loading' } | { state: 'ok'; limit: number } | { state: 'error'; detail: string };

export function GatewayProbe() {
  const [probe, setProbe] = useState<Probe>({ state: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/ping?limit=5', { headers: { accept: 'application/json' } })
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setProbe({ state: 'error', detail: `Gateway answered ${res.status}.` });
          return;
        }
        const body = (await res.json()) as { pong?: boolean; limit?: number };
        if (body.pong === true && typeof body.limit === 'number') {
          setProbe({ state: 'ok', limit: body.limit });
        } else {
          setProbe({ state: 'error', detail: 'Unexpected gateway shape.' });
        }
      })
      .catch(() => {
        if (!cancelled) setProbe({ state: 'error', detail: 'Gateway unreachable.' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (probe.state === 'loading') return <p data-testid="gateway-probe">Probing gateway…</p>;
  if (probe.state === 'error')
    return (
      <p data-testid="gateway-probe" role="alert">
        Gateway error — {probe.detail}
      </p>
    );
  return <p data-testid="gateway-probe">Gateway ok — pong limit {probe.limit}.</p>;
}
