// @shopscale/web lib/api - Server-only API access helpers.
// NEVER import this module (or API_BASE_URL) from a client component: it
// carries server configuration. Client components call the same-origin
// gateway (/api/...) instead — see app/api/[...path]/route.ts.

const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

/**
 * Foundation allowlist: the only upstream paths the gateway proxies.
 * Extended by owning tasks as endpoints land (never by client input).
 */
export const ALLOWED_GATEWAY_PATHS = ['health/live', 'health/ready', 'v1/ping'] as const;

export type AllowedGatewayPath = (typeof ALLOWED_GATEWAY_PATHS)[number];

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
): { ok: true; path: AllowedGatewayPath } | { ok: false; reason: string } {
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
  if (!(ALLOWED_GATEWAY_PATHS as readonly string[]).includes(joined)) {
    return { ok: false, reason: 'not allowlisted' };
  }
  return { ok: true, path: joined as AllowedGatewayPath };
}

/** Resolve or mint the request ID to forward upstream. */
export function resolveOutgoingRequestId(header: string | null): string {
  if (header && REQUEST_ID_PATTERN.test(header)) return header;
  return crypto.randomUUID();
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
