// @shopscale/backend/identity/session.guard - Guard decision contract.
// Nest-free by module boundary: the framework adapter lives in
// apps/api/src/session.guard.ts and delegates here. Pure functions only —
// the decision table is unit-tested without HTTP, the adapter is proven by
// the T011b HTTP suite.

import { authCookies } from '@shopscale/contracts';
import type { Actor } from './session.service.js';

/** Exact-name cookie extraction (no substring matching: `access_token` must
 * not match `evil_access_token`). */
export function extractCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) {
      return part.slice(idx + 1).trim();
    }
  }
  return null;
}

export interface GuardRequestShape {
  headers?: Record<string, string | string[] | undefined>;
  actor?: Actor;
}

export interface GuardContextShape {
  switchToHttp: () => {
    getRequest: () => GuardRequestShape;
  };
}

export type ActorResolver = (accessToken: string) => Promise<Actor | null>;

export interface SessionDecision {
  ok: boolean;
  actor?: Actor;
}

/**
 * Decide the request's session: resolve the bearer access cookie to a live
 * actor and attach it, or deny. Denial is silent (no reason strings toward
 * clients — the adapter maps every denial to one generic 401).
 */
export async function decideSession(
  context: GuardContextShape,
  resolveActor: ActorResolver,
): Promise<SessionDecision> {
  const req = context.switchToHttp().getRequest();
  const raw = req.headers?.['cookie'];
  const header = Array.isArray(raw) ? raw.join('; ') : raw;
  const token = extractCookie(header, authCookies.accessName);
  if (!token) return { ok: false };
  const actor = await resolveActor(token);
  if (!actor) return { ok: false };
  req.actor = actor;
  return { ok: true, actor };
}
