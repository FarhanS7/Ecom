// @shopscale/contracts/identity - Auth DTOs and cookie contract (T010a).
// Password hashes NEVER appear in any DTO (asserted by tests, not by eye).
// Refresh tokens NEVER appear in bodies (ADR-0004: HttpOnly cookies only);
// the T002 `tokenResponse` shape is superseded by `authResponse` below.

import { z } from 'zod';

/** Registration input. No `name`: the users table stores accounts, not
 * profiles (names live on addresses, T091). Changed from the T002 draft —
 * see T010a commit (change control). */
export const registerRequest = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
});

export const loginRequest = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});

/**
 * Safe account DTO: the caller's OWN account only (register/login/me).
 * Email here is self-context, not public listing (data model keeps email out
 * of public DTOs; this exception is documented, not assumed).
 */
export const authUser = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  status: z.enum(['active', 'suspended', 'pending_verification']),
  createdAt: z.string().datetime(),
});

export type AuthUser = z.infer<typeof authUser>;

export const authResponse = z.object({
  user: authUser,
  // Seconds until the access cookie expires (client scheduling hint only;
  // authority stays server-side).
  expiresIn: z.number().int().positive(),
});

export type AuthResponse = z.infer<typeof authResponse>;

/** Refresh request (T011 rotation; defined here with the auth family). */
export const refreshRequest = z.object({
  refreshToken: z.string().min(1),
});

/** Cookie issuance contract (ADR-0004). Refresh is path-scoped to /v1/auth
 * so it is never sent to business routes; logout lives under /v1/auth (T011)
 * so it can still clear it. */
export const authCookies = {
  accessName: 'access_token',
  refreshName: 'refresh_token',
  accessMaxAgeSeconds: 15 * 60,
  refreshPath: '/v1/auth',
} as const;
