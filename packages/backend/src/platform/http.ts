// @shopscale/backend/platform/http - Framework-free HTTP conventions.
// Pure helpers shared by every entry point (Nest API today, workers/gateway
// later): request-ID handling, RFC 7807 problem building, and exception
// mapping with secret-safe messages. Adapters (Nest filter/hook) live in
// apps/api and delegate here so behavior is unit-testable without HTTP.

import { randomUUID } from 'node:crypto';
import {
  defaultStatusFor,
  problemResponse,
  problemType,
} from '@shopscale/contracts';
import type { ErrorCode, ProblemResponse } from '@shopscale/contracts';

export const REQUEST_ID_HEADER = 'x-request-id';
const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

export type RequestIdOutcome =
  | { ok: true; requestId: string; generated: boolean }
  | { ok: false; code: Extract<ErrorCode, 'INVALID_REQUEST_ID'> };

/**
 * Resolve the request ID from headers. A present header must match the
 * allowlist pattern; anything else (bad characters, overlong, repeated) is
 * rejected so IDs stay safe for logs, headers, and problem bodies. Missing
 * header → server-generated UUID v4.
 */
export function resolveRequestId(
  headers: Record<string, string | string[] | undefined>,
): RequestIdOutcome {
  const raw = headers[REQUEST_ID_HEADER] ?? headers['X-Request-Id'];
  if (raw === undefined || raw === '') {
    return { ok: true, requestId: randomUUID(), generated: true };
  }
  if (Array.isArray(raw)) {
    return { ok: false, code: 'INVALID_REQUEST_ID' };
  }
  if (!REQUEST_ID_PATTERN.test(raw)) {
    return { ok: false, code: 'INVALID_REQUEST_ID' };
  }
  return { ok: true, requestId: raw, generated: false };
}

export interface ProblemInput {
  code: ErrorCode;
  title: string;
  status?: number | undefined;
  detail?: string | undefined;
  instance?: string | undefined;
  requestId: string;
  errors?: Record<string, string[]> | undefined;
}

/** Build a contract-valid problem body. Throws on programmer error (bug). */
export function buildProblem(input: ProblemInput): ProblemResponse {
  return problemResponse.parse({
    type: problemType(input.code),
    title: input.title,
    status: input.status ?? defaultStatusFor(input.code),
    detail: input.detail,
    instance: stripQuery(input.instance),
    code: input.code,
    requestId: input.requestId,
    errors: input.errors,
  });
}

/**
 * Strip query strings from echoed URLs. Query parameters may carry one-time
 * tokens (password-reset, invitations); they must never round-trip into
 * bodies or logs via `instance`.
 */
export function stripQuery(url: string | undefined): string | undefined {
  if (url === undefined) return undefined;
  const idx = url.indexOf('?');
  return idx >= 0 ? url.slice(0, idx) : url;
}

export interface ConstraintViolation {
  property: string;
  constraints?: Record<string, string>;
}

/**
 * Map class-validator errors to `{field: [constraintKeys]}`. Only constraint
 * KEYS cross the boundary — messages embed rejected values, which may be
 * secrets (passwords, tokens). Unit-tested: output never contains the value.
 */
export function validationErrorMap(
  violations: ConstraintViolation[],
): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  for (const v of violations) {
    errors[v.property] = Object.keys(v.constraints ?? { unknown: '' });
  }
  return errors;
}

export interface MappedHttpError {
  status: number;
  body: ProblemResponse;
}

const STATUS_CODES: Record<number, ErrorCode> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'VALIDATION_FAILED',
  429: 'RATE_LIMITED',
};

/**
 * Map a framework HTTP error onto a problem. 5xx details are ALWAYS replaced
 * with a generic message (stacks/messages may contain secrets or internals);
 * 4xx details pass through only as short safe strings, never objects.
 */
export function mapHttpException(input: {
  status: number;
  title: string;
  detail?: unknown;
  code?: ErrorCode | undefined;
  requestId: string;
  instance?: string | undefined;
  errors?: Record<string, string[]> | undefined;
}): MappedHttpError {
  const status = input.status >= 400 && input.status <= 599 ? input.status : 500;
  if (status >= 500) {
    return {
      status,
      body: buildProblem({
        code: 'INTERNAL_ERROR',
        title: 'Internal server error',
        status,
        requestId: input.requestId,
        instance: input.instance,
      }),
    };
  }
  const code = input.code ?? STATUS_CODES[status] ?? 'VALIDATION_FAILED';
  const detail = typeof input.detail === 'string' ? input.detail.slice(0, 500) : undefined;
  return {
    status,
    body: buildProblem({
      code,
      title: input.title,
      status,
      detail,
      requestId: input.requestId,
      instance: input.instance,
      errors: input.errors,
    }),
  };
}

/** Unknown-route mapping: 404 with query-stripped instance. */
export function mapUnknownRoute(input: {
  method: string;
  url: string;
  requestId: string;
}): MappedHttpError {
  return {
    status: 404,
    body: buildProblem({
      code: 'NOT_FOUND',
      title: 'Not found',
      status: 404,
      detail: `Cannot ${input.method.toUpperCase()} ${stripQuery(input.url)}`,
      instance: input.url,
      requestId: input.requestId,
    }),
  };
}
