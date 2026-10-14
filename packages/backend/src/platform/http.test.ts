// T006a: HTTP convention helpers. Every assertion targets observable output:
// header/body values, status codes, and absence of secrets — never internals.

import { describe, expect, it } from 'vitest';
import {
  REQUEST_ID_HEADER,
  buildProblem,
  mapHttpException,
  mapUnknownRoute,
  resolveRequestId,
  validationErrorMap,
} from './http.js';

describe('request IDs (T006a)', () => {
  it('echoes a valid client ID without generating', () => {
    const out = resolveRequestId({ [REQUEST_ID_HEADER]: 'req-abc-123' });
    expect(out).toEqual({ ok: true, requestId: 'req-abc-123', generated: false });
  });

  it('generates a UUID when absent', () => {
    const out = resolveRequestId({});
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.generated).toBe(true);
      expect(out.requestId).toMatch(/^[0-9a-f-]{36}$/);
    }
  });

  it('rejects dangerous, overlong, or repeated IDs', () => {
    expect(resolveRequestId({ [REQUEST_ID_HEADER]: 'a\nb' }).ok).toBe(false);
    expect(resolveRequestId({ [REQUEST_ID_HEADER]: 'x'.repeat(65) }).ok).toBe(false);
    expect(resolveRequestId({ [REQUEST_ID_HEADER]: ['a', 'b'] }).ok).toBe(false);
    expect(resolveRequestId({ [REQUEST_ID_HEADER]: '../../etc' }).ok).toBe(false);
  });
});

describe('problem bodies (T006a)', () => {
  it('defaults status per code and builds a valid type URI', () => {
    const body = buildProblem({ code: 'NOT_FOUND', title: 'Not found', requestId: 'r1' });
    expect(body.status).toBe(404);
    expect(body.type).toBe('https://shopscale.dev/problems/not-found');
    expect(body.requestId).toBe('r1');
  });
});

describe('validation mapping (T006a)', () => {
  it('exposes constraint keys, never rejected values', () => {
    const errors = validationErrorMap([
      { property: 'password', constraints: { minLength: 'password S3cr3t-value-xyz is too short' } },
      { property: 'email', constraints: { isEmail: 'not-an-email' } },
    ]);
    expect(errors).toEqual({ password: ['minLength'], email: ['isEmail'] });
    expect(JSON.stringify(errors)).not.toContain('S3cr3t-value-xyz');
  });
});

describe('exception mapping (T006a)', () => {
  it('redacts 5xx details entirely', () => {
    const mapped = mapHttpException({
      status: 500,
      title: 'anything',
      detail: 'connect postgres://user:S3cr3t-value-xyz@db:5432 boom',
      requestId: 'r1',
    });
    expect(mapped.status).toBe(500);
    expect(mapped.body.code).toBe('INTERNAL_ERROR');
    expect(mapped.body.title).toBe('Internal server error');
    expect(JSON.stringify(mapped.body)).not.toContain('S3cr3t-value-xyz');
    expect(JSON.stringify(mapped.body)).not.toContain('postgres://');
  });

  it('strips query strings from unknown-route instances', () => {
    const mapped = mapUnknownRoute({
      method: 'get',
      url: '/reset-password?token=one-time-secret-xyz',
      requestId: 'r1',
    });
    expect(mapped.status).toBe(404);
    expect(mapped.body.code).toBe('NOT_FOUND');
    expect(JSON.stringify(mapped.body)).not.toContain('one-time-secret-xyz');
    expect(mapped.body.instance).toBe('/reset-password');
  });
});
