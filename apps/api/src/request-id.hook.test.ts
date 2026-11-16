// apps/api/src/request-id.hook.test.ts - Unit tests for requestIdHook and W3C traceparent propagation (T071).
import { describe, expect, it, vi } from 'vitest';
import { parseTraceparent } from '@shopscale/backend';
import { requestIdHook } from './request-id.hook.js';

describe('requestIdHook & W3C TraceContext (T071)', () => {
  it('propagates incoming valid traceparent header', () => {
    const incomingTraceparent = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
    const req: Record<string, unknown> = {
      headers: {
        'x-request-id': 'req-test-1234',
        traceparent: incomingTraceparent,
      },
    };

    const headersSent: Record<string, string> = {};
    const reply = {
      header: vi.fn((name: string, value: string) => {
        headersSent[name.toLowerCase()] = value;
        return reply;
      }),
      code: vi.fn().mockReturnThis(),
      send: vi.fn(),
    };
    const done = vi.fn();

    requestIdHook(
      req as unknown as Parameters<typeof requestIdHook>[0],
      reply as unknown as Parameters<typeof requestIdHook>[1],
      done,
    );

    expect(done).toHaveBeenCalled();
    expect(req.requestId).toBe('req-test-1234');
    expect(req.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    expect(headersSent['x-request-id']).toBe('req-test-1234');
    expect(headersSent['traceparent']).toBe(incomingTraceparent);
  });

  it('generates new valid root traceparent when traceparent is missing', () => {
    const req: Record<string, unknown> = {
      headers: {},
    };

    const headersSent: Record<string, string> = {};
    const reply = {
      header: vi.fn((name: string, value: string) => {
        headersSent[name.toLowerCase()] = value;
        return reply;
      }),
      code: vi.fn().mockReturnThis(),
      send: vi.fn(),
    };
    const done = vi.fn();

    requestIdHook(
      req as unknown as Parameters<typeof requestIdHook>[0],
      reply as unknown as Parameters<typeof requestIdHook>[1],
      done,
    );

    expect(done).toHaveBeenCalled();
    expect(req.requestId).toBeDefined();
    expect(req.traceId).toBeDefined();

    const traceparent = headersSent['traceparent'];
    expect(traceparent).toBeDefined();
    const parsed = parseTraceparent(traceparent);
    expect(parsed.valid).toBe(true);
    if (parsed.valid) {
      expect(parsed.traceId).toBe(req.traceId);
      expect(parsed.sampled).toBe(true);
    }
  });

  it('returns 400 problem on invalid X-Request-Id format', () => {
    const req: Record<string, unknown> = {
      headers: {
        'x-request-id': 'invalid request id with spaces!',
      },
    };

    const reply = {
      header: vi.fn().mockReturnThis(),
      code: vi.fn().mockReturnThis(),
      send: vi.fn(),
    };
    const done = vi.fn();

    requestIdHook(
      req as unknown as Parameters<typeof requestIdHook>[0],
      reply as unknown as Parameters<typeof requestIdHook>[1],
      done,
    );

    expect(reply.code).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'INVALID_REQUEST_ID',
        status: 400,
      }),
    );
  });
});
