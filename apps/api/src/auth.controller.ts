// @shopscale/api/auth.controller - Thin Nest adapter over the identity
// service (T010b). Validation uses EXPLICIT zod parsing (never inferred
// design:paramtypes — stripped under esbuild/vitest, proven T006b). Cookies
// are set via raw Set-Cookie headers: no @fastify/cookie dependency, full
// control of flags, and the values are URL-safe by construction (JWT / hex).

import { Body, ConflictException, Controller, Get, HttpCode, Post, Req, Res, UnauthorizedException, UnprocessableEntityException, UseGuards } from '@nestjs/common';
import { getEnv } from '@shopscale/config';
import {
  AuthError,
  authenticateAccount,
  extractCookie,
  getSafeUser,
  registerAccount,
  revokeFamily,
  rotateRefresh,
} from '@shopscale/backend';
import type { Actor } from '@shopscale/backend';
import {
  authCookies,
  authResponse,
  authUser,
  loginRequest,
  logoutResponse,
  registerRequest,
} from '@shopscale/contracts';
import { SessionGuard } from './session.guard.js';

/** Minimal zod-shape: satisfied structurally, no new dependency. */
interface BodySchema<T> {
  safeParse: (raw: unknown) =>
    | { success: true; data: T }
    | { success: false; error: { issues: Array<{ path: Array<string | number>; code: string }> } };
}

function parseBody<T>(schema: BodySchema<T>, raw: unknown): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    // Constraint locations + codes only — messages may embed values.
    throw new UnprocessableEntityException(
      parsed.error.issues.map((issue) => ({
        property: issue.path.join('.') || 'body',
        constraints: { [issue.code]: issue.code },
      })),
    );
  }
  return parsed.data;
}

function cookieFlags(maxAge: number, path: string): string {
  const env = getEnv();
  const sameSite = env.COOKIE_SAME_SITE.charAt(0).toUpperCase() + env.COOKIE_SAME_SITE.slice(1);
  const secure = env.COOKIE_SECURE ? '; Secure' : '';
  return `Path=${path}; Max-Age=${maxAge}; HttpOnly; SameSite=${sameSite}${secure}`;
}

interface PassthroughReply {
  header: (name: string, value: string | string[]) => unknown;
}

function issueAuthCookies(
  res: PassthroughReply,
  input: { accessToken: string; refreshRaw: string },
): void {
  res.header('Set-Cookie', [
    `${authCookies.accessName}=${input.accessToken}; ${cookieFlags(authCookies.accessMaxAgeSeconds, '/')}`,
    `${authCookies.refreshName}=${input.refreshRaw}; ${cookieFlags(7 * 24 * 60 * 60, authCookies.refreshPath)}`,
  ]);
}

function clearAuthCookies(res: PassthroughReply): void {
  const expired = 'Max-Age=0; HttpOnly';
  res.header('Set-Cookie', [
    `${authCookies.accessName}=; Path=/; ${expired}`,
    `${authCookies.refreshName}=; Path=${authCookies.refreshPath}; ${expired}`,
  ]);
}

interface CookieRequest {
  headers?: Record<string, string | string[] | undefined>;
  actor?: Actor;
}

function refreshCookieOf(req: CookieRequest): string | null {
  const raw = req.headers?.['cookie'];
  const header = Array.isArray(raw) ? raw.join('; ') : raw;
  return extractCookie(header, authCookies.refreshName);
}

function toAuthErrorResponse(err: unknown): never {
  if (err instanceof AuthError) {
    if (err.failure === 'ACCOUNT_EXISTS') {
      throw new ConflictException(err.message);
    }
    throw new UnauthorizedException(err.message);
  }
  throw err;
}

@Controller('auth')
export class AuthController {
  @Post('register')
  @HttpCode(201)
  async register(
    @Body() rawBody: unknown,
    @Res({ passthrough: true }) res: PassthroughReply,
  ): Promise<unknown> {
    const body = parseBody(registerRequest, rawBody);
    try {
      const issued = await registerAccount({ email: body.email, password: body.password });
      issueAuthCookies(res, issued);
      return authResponse.parse({ user: issued.user, expiresIn: issued.expiresIn });
    } catch (err) {
      toAuthErrorResponse(err);
    }
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() rawBody: unknown,
    @Res({ passthrough: true }) res: PassthroughReply,
  ): Promise<unknown> {
    const body = parseBody(loginRequest, rawBody);
    try {
      const issued = await authenticateAccount({ email: body.email, password: body.password });
      issueAuthCookies(res, issued);
      return authResponse.parse({ user: issued.user, expiresIn: issued.expiresIn });
    } catch (err) {
      toAuthErrorResponse(err);
    }
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: CookieRequest,
    @Res({ passthrough: true }) res: PassthroughReply,
  ): Promise<unknown> {
    const raw = refreshCookieOf(req);
    if (!raw) {
      clearAuthCookies(res);
      throw new UnauthorizedException('Invalid session.');
    }
    const outcome = await rotateRefresh(raw);
    if (outcome.kind === 'rotated') {
      issueAuthCookies(res, outcome);
      return authResponse.parse({ user: outcome.user, expiresIn: outcome.expiresIn });
    }
    clearAuthCookies(res);
    throw new UnauthorizedException('Invalid session.');
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(SessionGuard)
  async logout(
    @Req() req: CookieRequest,
    @Res({ passthrough: true }) res: PassthroughReply,
  ): Promise<unknown> {
    if (req.actor) {
      await revokeFamily(req.actor.familyId);
    }
    clearAuthCookies(res);
    return logoutResponse.parse({ ok: true });
  }

  @Get('me')
  @UseGuards(SessionGuard)
  async me(@Req() req: CookieRequest): Promise<unknown> {
    if (!req.actor) {
      throw new UnauthorizedException('Authentication required.');
    }
    const user = await getSafeUser(req.actor.userId);
    if (!user) {
      throw new UnauthorizedException('Authentication required.');
    }
    return authUser.parse({
      id: user.id,
      email: user.email,
      status: user.status,
      createdAt: user.createdAt,
    });
  }
}
