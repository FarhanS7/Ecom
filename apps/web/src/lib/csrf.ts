// @shopscale/web lib/csrf - Same-origin client requests (T013b).
// Browser fetch always sends Origin on cookie POSTs, so the API's
// same-origin check is the enforcement; this helper keeps the client from
// ever constructing a cross-origin target by accident (absolute URLs,
// protocol-relative URLs, backslashes, traversal are rejected pre-fetch).

export function isSameOriginPath(path: string): boolean {
  if (path === '') return false;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(path)) return false;
  if (path.startsWith('//')) return false;
  if (path.includes('\\')) return false;
  if (!path.startsWith('/')) return false;
  const segments = path.split('?')[0]?.split('/') ?? [];
  if (segments.includes('..')) return false;
  return true;
}

/** POST to our own origin with session cookies attached. */
export async function csrfFetch(
  path: string,
  body: unknown,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  if (!isSameOriginPath(path)) {
    throw new Error(`Refused cross-origin client target (${path}).`);
  }
  return fetcher(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
