// @shopscale/api/auth.controller - Thin Nest adapter over the identity
// service (T010b). Validation uses EXPLICIT zod parsing (never inferred
// design:paramtypes — stripped under esbuild/vitest, proven T006b). Cookies
// are set via raw Set-Cookie headers: no @fastify/cookie dependency, full
// control of flags, and the values are URL-safe by construction (JWT / hex).

import { Body, ConflictException, Controller, Get, HttpCode, NotFoundException, Post, Req, Res, UnauthorizedException, UnprocessableEntityException, UseGuards } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { getEnv } from '@shopscale/config';
import {
  AuthError,
  authenticateAccount,
  buildProblem,
  confirmPasswordReset,
  confirmVerification,
  consumeLimit,
  extractCookie,
  getLimiterRedis,
  getSafeUser,
  isSameOriginRequest,
  LimiterUnavailableError,
  loginEmailPolicy,
  loginIpPolicy,
  normalizeEmail,
  refreshIpPolicy,
  refreshTokenPolicy,
  registerAccount,
  requestPasswordReset,
  requestVerification,
  resolveRequestId,
  revokeFamily,
  rotateRefresh,
  sha256Hex,
} from '@shopscale/backend';
import type { Actor, RateLimitPolicy } from '@shopscale/backend';
import type { ProblemResponse } from '@shopscale/contracts';
import {
  authCookies,
  authResponse,
  authUser,
  flowAccepted,
  loginRequest,
  logoutResponse,
  passwordResetConfirm,
  passwordResetRequest,
  registerRequest,
  verificationConfirm,
} from '@shopscale/contracts';
import { SessionGuard } from './session.guard.js';

/** Minimal zod-shape: satisfied structurally, no new dependency. */
interface BodySchema<T> {
  safeParse: (raw: unknown) =>
    | { success: true; data: T }
    | { success: false; error: { issues: Array<{ path: Array<string | number>; code: string }> } };
}

export function parseBody<T>(schema: BodySchema<T>, raw: unknown): T {
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
  status: (code: number) => unknown;
}

/** Send a gate denial (429/503) with headers, for early handler return. */
function sendGateDenial(
  res: PassthroughReply,
  gate: { status?: number; retryAfterSeconds?: number; body?: unknown },
): unknown {
  if (gate.retryAfterSeconds !== undefined) {
    res.header('Retry-After', String(gate.retryAfterSeconds));
  }
  res.status(gate.status ?? 429);
  return gate.body;
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
  ip?: string;
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export interface AuthGateResult {
  allowed: boolean;
  status?: number;
  retryAfterSeconds?: number;
  body?: ProblemResponse;
}

/**
 * Mutation gate for credential-bearing endpoints (T013b): same-origin check,
 * then IP + identity budgets. Denials carry their own status/body so the
 * handler can send them with headers (Retry-After); the limiter outage maps
 * to fail-closed 503. Pure sequencing over backend primitives.
 */
export async function checkAuthGate(
  req: CookieRequest,
  policies: RateLimitPolicy[],
): Promise<AuthGateResult> {
  const headers = req.headers ?? {};
  const origin = firstHeader(headers['origin']);
  const referer = firstHeader(headers['referer']);
  const host = firstHeader(headers['host']);
  if (!isSameOriginRequest({ origin, referer, host })) {
    throw new ForbiddenException('Cross-origin request refused.');
  }
  const resolved = resolveRequestId(headers);
  const requestId = resolved.ok ? resolved.requestId : 'unparsable-request-id';
  try {
    const redis = getLimiterRedis();
    for (const policy of policies) {
      const outcome = await consumeLimit(redis, policy);
      if (!outcome.allowed) {
        return {
          allowed: false,
          status: 429,
          retryAfterSeconds: outcome.retryAfterSeconds,
          body: buildProblem({
            code: 'RATE_LIMITED',
            title: 'Too many requests',
            status: 429,
            detail: 'Rate limit exceeded. Try again later.',
            requestId,
          }),
        };
      }
    }
    return { allowed: true };
  } catch (err) {
    if (err instanceof LimiterUnavailableError) {
      return {
        allowed: false,
        status: 503,
        body: buildProblem({
          code: 'INTERNAL_ERROR',
          title: 'Service temporarily unavailable',
          status: 503,
          requestId,
        }),
      };
    }
    throw err;
  }
}

function clientIp(req: CookieRequest): string {
  return typeof req.ip === 'string' && req.ip !== '' ? req.ip : 'unknown';
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
    @Req() req: CookieRequest,
    @Body() rawBody: unknown,
    @Res({ passthrough: true }) res: PassthroughReply,
  ): Promise<unknown> {
    const body = parseBody(registerRequest, rawBody);
    const gate = await checkAuthGate(req, [
      loginIpPolicy(clientIp(req)),
      loginEmailPolicy(normalizeEmail(body.email)),
    ]);
    if (!gate.allowed) return sendGateDenial(res, gate);
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
    @Req() req: CookieRequest,
    @Body() rawBody: unknown,
    @Res({ passthrough: true }) res: PassthroughReply,
  ): Promise<unknown> {
    const body = parseBody(loginRequest, rawBody);
    const gate = await checkAuthGate(req, [
      loginIpPolicy(clientIp(req)),
      loginEmailPolicy(normalizeEmail(body.email)),
    ]);
    if (!gate.allowed) return sendGateDenial(res, gate);
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
    const gate = await checkAuthGate(req, [
      refreshIpPolicy(clientIp(req)),
      ...(raw ? [refreshTokenPolicy(sha256Hex(raw))] : []),
    ]);
    if (!gate.allowed) return sendGateDenial(res, gate);
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

  @Post('password-reset/request')
  @HttpCode(202)
  async requestReset(
    @Req() req: CookieRequest,
    @Body() rawBody: unknown,
    @Res({ passthrough: true }) res: PassthroughReply,
  ): Promise<unknown> {
    // Always 202 with the same body: unknown emails create nothing and take
    // an indistinguishable path (no account-existence oracle).
    const body = parseBody(passwordResetRequest, rawBody);
    const gate = await checkAuthGate(req, [
      loginIpPolicy(clientIp(req)),
      loginEmailPolicy(normalizeEmail(body.email)),
    ]);
    if (!gate.allowed) return sendGateDenial(res, gate);
    await requestPasswordReset(body.email);
    return flowAccepted.parse({ ok: true });
  }

  @Post('password-reset/confirm')
  @HttpCode(200)
  async confirmReset(@Body() rawBody: unknown): Promise<unknown> {
    const body = parseBody(passwordResetConfirm, rawBody);
    const out = await confirmPasswordReset({ token: body.token, newPassword: body.newPassword });
    if (!out) {
      // Unknown, consumed, and expired proofs share one generic 404.
      throw new NotFoundException('Invalid or expired reset link.');
    }
    return flowAccepted.parse({ ok: true });
  }

  @Post('verify-email/request')
  @HttpCode(202)
  @UseGuards(SessionGuard)
  async requestVerify(@Req() req: CookieRequest): Promise<unknown> {
    if (!req.actor) {
      throw new UnauthorizedException('Authentication required.');
    }
    await requestVerification(req.actor.userId);
    return flowAccepted.parse({ ok: true });
  }

  @Post('verify-email/confirm')
  @HttpCode(200)
  async confirmVerify(@Body() rawBody: unknown): Promise<unknown> {
    const body = parseBody(verificationConfirm, rawBody);
    const out = await confirmVerification(body.token);
    if (!out) {
      throw new NotFoundException('Invalid or expired verification link.');
    }
    return flowAccepted.parse({ ok: true });
  }
}
