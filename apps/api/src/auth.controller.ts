// @shopscale/api/auth.controller - Thin Nest adapter over the identity
// service (T010b). Validation uses EXPLICIT zod parsing (never inferred
// design:paramtypes — stripped under esbuild/vitest, proven T006b). Cookies
// are set via raw Set-Cookie headers: no @fastify/cookie dependency, full
// control of flags, and the values are URL-safe by construction (JWT / hex).

import { Body, ConflictException, Controller, HttpCode, Post, Res, UnauthorizedException, UnprocessableEntityException } from '@nestjs/common';
import { getEnv } from '@shopscale/config';
import {
  AuthError,
  authenticateAccount,
  registerAccount,
} from '@shopscale/backend';
import {
  authCookies,
  authResponse,
  loginRequest,
  registerRequest,
} from '@shopscale/contracts';

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
}
