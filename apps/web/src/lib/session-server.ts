// @shopscale/web lib/session-server - Server-side session reads (T017b).
// Server components forward the browser's cookies to the API directly
// (server-to-server). Only HttpOnly session cookies are meaningful here;
// the helper forwards the whole header to OUR api only.

import { cookies } from 'next/headers';
import { apiBaseUrl } from './api';

/** Logged-in account email, or null. Never throws (guest on any failure). */
export async function currentSessionEmail(): Promise<string | null> {
  let base: string;
  try {
    base = apiBaseUrl();
  } catch {
    return null;
  }
  try {
    const res = await fetch(`${base}/v1/auth/me`, {
      headers: { cookie: cookies().toString(), accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { email?: unknown };
    return typeof body.email === 'string' ? body.email : null;
  } catch {
    return null;
  }
}
