// @shopscale/web lib/session - Browser session helpers (T011b).
// `refreshSession()` serializes concurrent refresh calls into ONE network
// request (single-flight): the module spec requires rotation to treat a
// replayed refresh as theft, so the browser must never fire two refreshes
// for one expiry on its own. First caller performs the fetch; concurrent
// callers share its promise; the slot clears on settle.

export interface RefreshOutcome {
  ok: boolean;
}

let pending: Promise<RefreshOutcome> | null = null;

export function refreshSession(fetcher: typeof fetch = fetch): Promise<RefreshOutcome> {
  if (!pending) {
    pending = fetcher('/api/v1/auth/refresh', { method: 'POST' })
      .then((res) => ({ ok: res.ok }))
      .catch((): RefreshOutcome => ({ ok: false }))
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

/** Test-only reset for the module slot (documented seam, never prod logic). */
export function __resetRefreshSlotForTests(): void {
  pending = null;
}
