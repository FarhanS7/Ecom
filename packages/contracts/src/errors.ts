// @shopscale/contracts/errors - Canonical API error contract.
// RFC 7807 problem body plus stable machine-readable `code` and the
// `requestId` that ties the response to logs/traces, per
// docs/architecture/api-contracts.md:
//   {type,title,status,detail,instance,code,requestId}
// No stack traces or secret fields, ever. Validation `errors` maps carry
// constraint KEYS (isEmail, minLength), never messages: class-validator
// messages embed rejected values, which may be secrets.

import { z } from 'zod';

export const errorCodes = [
  'VALIDATION_FAILED',
  'INVALID_REQUEST_ID',
  'INVALID_CURSOR',
  'NOT_FOUND',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'CONFLICT',
  'IDEMPOTENCY_CONFLICT',
  'REQUEST_IN_PROGRESS',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof errorCodes)[number];

export const errorCodeSchema = z.enum(errorCodes);

const DEFAULT_STATUS: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 422,
  INVALID_REQUEST_ID: 400,
  INVALID_CURSOR: 400,
  NOT_FOUND: 404,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  CONFLICT: 409,
  IDEMPOTENCY_CONFLICT: 409,
  REQUEST_IN_PROGRESS: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

export function defaultStatusFor(code: ErrorCode): number {
  return DEFAULT_STATUS[code];
}

function kebab(code: ErrorCode): string {
  return code.toLowerCase().replace(/_/g, '-');
}

/**
 * Stable problem-type URI for a code. These identifiers are part of the API
 * contract (clients switch on `code`, humans follow `type`); they are not
 * claimed to be live documentation URLs.
 */
export function problemType(code: ErrorCode): string {
  return `https://shopscale.dev/problems/${kebab(code)}`;
}

export const problemResponse = z.object({
  type: z.string().url(),
  title: z.string().min(1),
  status: z.number().int().min(400).max(599),
  detail: z.string().optional(),
  instance: z.string().optional(),
  code: errorCodeSchema,
  requestId: z.string().min(1),
  errors: z.record(z.array(z.string())).optional(),
});

export type ProblemResponse = z.infer<typeof problemResponse>;
