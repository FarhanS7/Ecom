'use client';

// Session panel (T017b): proves the session without redirect loops. Logged
// out stays a state (with a login link), never a redirect; logout returns to
// the logged-out state, never to a login redirect. No tokens or passwords
// touch browser storage — the browser only holds HttpOnly cookies it cannot
// even read.

import { useCallback, useEffect, useState } from 'react';

type Session = { state: 'guest' } | { state: 'user'; email: string };

export function SessionPanel({ initialEmail }: { initialEmail: string | null }) {
  const [session, setSession] = useState<Session>(
    initialEmail ? { state: 'user', email: initialEmail } : { state: 'guest' },
  );
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    fetch('/api/v1/auth/me', { headers: { accept: 'application/json' } })
      .then(async (res) => {
        if (!res.ok) {
          setSession({ state: 'guest' });
          return;
        }
        const body = (await res.json()) as { email?: string };
        setSession(typeof body.email === 'string' ? { state: 'user', email: body.email } : { state: 'guest' });
      })
      .catch(() => setSession({ state: 'guest' }));
  }, []);

  useEffect(() => {
    if (initialEmail === null) refresh();
  }, [initialEmail, refresh]);

  async function logout(): Promise<void> {
    setBusy(true);
    try {
      await fetch('/api/v1/auth/logout', { method: 'POST' });
    } catch {
      // Logout is best-effort client-side; the session state below re-syncs.
    } finally {
      setBusy(false);
      setSession({ state: 'guest' });
    }
  }

  if (session.state === 'guest') {
    return (
      <p>
        You are logged out. <a href="/login">Log in</a>
      </p>
    );
  }
  return (
    <div>
      <p role="status">Logged in as {session.email}.</p>
      <button type="button" onClick={() => void logout()} disabled={busy} style={{ minHeight: '44px' }}>
        {busy ? 'Logging out…' : 'Log out'}
      </button>
    </div>
  );
}
