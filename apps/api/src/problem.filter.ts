// @shopscale/api/problem.filter - Catch-all RFC 7807 mapper.
// Delegates every decision to the pure backend helpers in
// @shopscale/backend platform/http so status semantics are unit-tested
// without the framework. This file only translates Nest/fastify shapes.

import { Catch, HttpException } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import {
  REQUEST_ID_HEADER,
  mapHttpException,
  resolveRequestId,
  validationErrorMap,
} from '@shopscale/backend';
import type { ConstraintViolation } from '@shopscale/backend';

interface ValidationItem {
  property?: unknown;
  constraints?: unknown;
}

function isConstraintList(value: unknown): value is ConstraintViolation[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (item): item is ConstraintViolation =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as ValidationItem).property === 'string',
    )
  );
}

function messageOf(response: unknown): { title: string; detail: unknown } {
  if (typeof response === 'string') return { title: response, detail: response };
  if (typeof response === 'object' && response !== null) {
    const record = response as Record<string, unknown>;
    const message = record['message'];
    const error = record['error'];
    return {
      title: typeof error === 'string' ? error : 'Request failed',
      detail: message,
    };
  }
  return { title: 'Request failed', detail: undefined };
}

@Catch()
export class ProblemFilter implements ExceptionFilter {
  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<{
      headers?: Record<string, string | string[] | undefined>;
      requestId?: string;
      url?: string;
    }>();
    const res = ctx.getResponse();

    // Prefer the hook-attached ID; fall back to header resolution so every
    // error carries a requestId even if the hook was bypassed.
    let requestId = typeof req.requestId === 'string' ? req.requestId : undefined;
    if (!requestId) {
      const resolved = resolveRequestId(req.headers ?? {});
      requestId = resolved.ok ? resolved.requestId : 'unparsable-request-id';
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const raw = (response as { message?: unknown }).message;

      if (status === 422 && isConstraintList(raw)) {
        // class-validator failures shaped by our exceptionFactory:
        // constraint KEYS only, never rejected values.
        const mapped = mapHttpException({
          status,
          title: 'Validation failed',
          detail: 'Request validation failed',
          code: 'VALIDATION_FAILED',
          requestId,
          instance: req.url,
          errors: validationErrorMap(raw),
        });
        this.adapterHost.httpAdapter.reply(res, mapped.body, mapped.status);
        return;
      }

      const { title, detail } = messageOf(response);
      const mapped = mapHttpException({
        status,
        title,
        detail,
        requestId,
        instance: req.url,
      });
      this.adapterHost.httpAdapter.reply(res, mapped.body, mapped.status);
      return;
    }

    // Unknown throwables: generic 500. Log the requestId only — the error
    // itself may contain secrets or internals.
    console.error(`Unhandled error (requestId=${requestId})`);
    const mapped = mapHttpException({ status: 500, title: '', requestId, instance: req.url });
    this.adapterHost.httpAdapter.reply(res, mapped.body, mapped.status);
  }
}
