// @shopscale/api/session.guard - Nest adapter over the backend session
// decision contract (T011b). Denials always become one generic 401 — the
// backend decideSession() is silent by design, and this adapter keeps it so.

import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { decideSession, resolveActor } from '@shopscale/backend';

@Injectable()
export class SessionGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const decision = await decideSession(context, (token) => resolveActor(token));
    if (!decision.ok || !decision.actor) {
      throw new UnauthorizedException('Authentication required.');
    }
    return true;
  }
}
