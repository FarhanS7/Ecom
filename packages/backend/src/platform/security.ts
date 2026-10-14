// @shopscale/backend/platform/security - Browser protection helpers (pure).
// Same-origin verification for cookie mutations plus the safe-headers map
// applied to every API response. Framework-free so the decision table is
// unit-tested; the API applies it in createApp, the web client mirrors the
// same-origin rule in lib/csrf.ts.

export const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

function requestHost(hostHeader: string | undefined): string | null {
  if (!hostHeader) return null;
  // Host may carry a port; origin comparison uses hostname (+port when set).
  const host = hostHeader.split(',')[0]?.trim() ?? '';
  return host === '' ? null : host.toLowerCase();
}

function originHost(originOrReferer: string): string | null {
  try {
    const url = new URL(originOrReferer);
    return url.host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Same-origin check for cookie-authenticated mutations (ADR-0004).
 * - Origin present → must equal the request host (mismatch refused).
 * - Else Referer present → its origin must equal the host (refused otherwise).
 * - Else (no provenance headers) → allowed, DOCUMENTED limitation: browsers
 *   always send Origin on cookie POSTs, so absent provenance means a
 *   non-browser client, which CSRF cannot ride. Token-based CSRF would
 *   strengthen this; recorded as future work, not silently assumed.
 */
export function isSameOriginRequest(input: {
  origin?: string | undefined;
  referer?: string | undefined;
  host?: string | undefined;
}): boolean {
  const host = requestHost(input.host);
  if (!host) return true;
  if (input.origin !== undefined && input.origin !== '') {
    return originHost(input.origin) === host;
  }
  if (input.referer !== undefined && input.referer !== '') {
    return originHost(input.referer) === host;
  }
  return true;
}
