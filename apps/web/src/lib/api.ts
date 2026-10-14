// @shopscale/web lib/api - Server-only API access helpers.
// NEVER import this module (or API_BASE_URL) from a client component: it
// carries server configuration. Client components call the same-origin
// gateway (/api/...) instead — see app/api/[...path]/route.ts.

const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

/**
 * Foundation + auth allowlist: the only upstream paths the gateway proxies.
 * Extended by owning tasks as endpoints land (never by client input).
 * Auth paths (T017a) enable browser login/refresh/logout/recovery: cookies
 * are name-filtered and upstream Origin rules still apply server-side.
 */
export const ALLOWED_GATEWAY_PATHS = [
  'health/live',
  'health/ready',
  'v1/ping',
  'v1/auth/register',
  'v1/auth/login',
  'v1/auth/refresh',
  'v1/auth/logout',
  'v1/auth/me',
  'v1/auth/password-reset/request',
  'v1/auth/password-reset/confirm',
  'v1/auth/verify-email/request',
  'v1/auth/verify-email/confirm',
] as const;

export type AllowedGatewayPath = (typeof ALLOWED_GATEWAY_PATHS)[number];

/**
 * Prefix patterns for per-ID routes (T091b): exact paths stay literal, while
 * `<prefix>/{single-segment}` proxies e.g. `v1/me/addresses/{id}`. Depth is
 * capped at one extra segment and every segment keeps the strict character
 * rule, so this cannot smuggle traversal or absolute URLs.
 */
export const ALLOWED_GATEWAY_PREFIXES = ['v1/me/addresses'] as const;

/** Server-only API origin. Names the variable on failure, never its value. */
export function apiBaseUrl(): string {
  const value = process.env['API_BASE_URL'];
  if (!value) {
    throw new Error(
      'API_BASE_URL is not configured. Set it for the web server process (see .env.example). Value redacted.',
    );
  }
  return value.replace(/\/+$/, '');
}

const SEGMENT_PATTERN = /^[A-Za-z0-9._~-]+$/;

/**
 * Validate raw path segments from the catch-all route. Rejects absolute URLs
 * (scheme), protocol-relative targets, traversal, backslashes, and anything
 * off the allowlist — before any fetch happens.
 */
export function resolveGatewayTarget(
  segments: string[],
): { ok: true; path: string } | { ok: false; reason: string } {
  if (segments.length === 0) return { ok: false, reason: 'empty path' };
  const decoded: string[] = [];
  for (const seg of segments) {
    let piece: string;
    try {
      piece = decodeURIComponent(seg);
    } catch {
      return { ok: false, reason: 'malformed encoding' };
    }
    if (!SEGMENT_PATTERN.test(piece)) return { ok: false, reason: 'illegal segment' };
    if (piece === '..' || piece === '.') return { ok: false, reason: 'traversal' };
    decoded.push(piece);
  }
  const joined = decoded.join('/');
  if (joined.includes('://')) return { ok: false, reason: 'absolute URL' };
  if ((ALLOWED_GATEWAY_PATHS as readonly string[]).includes(joined)) {
    return { ok: true, path: joined };
  }
  for (const prefix of ALLOWED_GATEWAY_PREFIXES) {
    if (joined === prefix || (joined.startsWith(`${prefix}/`) && decoded.length === prefix.split('/').length + 1)) {
      return { ok: true, path: joined };
    }
  }
  return { ok: false, reason: 'not allowlisted' };
}

/** Resolve or mint the request ID to forward upstream. */
export function resolveOutgoingRequestId(header: string | null): string {
  if (header && REQUEST_ID_PATTERN.test(header)) return header;
  return crypto.randomUUID();
}

const FORWARDED_COOKIES = ['access_token', 'refresh_token'] as const;

/**
 * Rebuild a Cookie header from exact-name session matches only (T017a).
 * Tracking, adversarial, and empty values never ride into the API.
 */
export function filterSessionCookies(header: string | null): string | null {
  if (!header) return null;
  const kept: string[] = [];
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const name = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if ((FORWARDED_COOKIES as readonly string[]).includes(name) && value !== '') {
      kept.push(`${name}=${value}`);
    }
  }
  return kept.length > 0 ? kept.join('; ') : null;
}

/**
 * Direct server-to-server fetch (server components only). Same validation as
 * the gateway; throws redacted errors, never echoes configuration values.
 */
export async function apiFetch(path: AllowedGatewayPath, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${apiBaseUrl()}/${path}`, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(5000),
  });
  return res;
}
