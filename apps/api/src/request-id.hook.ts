// Request-ID hook shared by createApp (Nest/Fastify adapter level).
// Kept adapter-structural (no fastify import): the instance from
// getHttpAdapter().getInstance() satisfies these shapes at runtime.

import { REQUEST_ID_HEADER, buildProblem, resolveRequestId } from '@shopscale/backend';

interface HookRequest {
  headers: Record<string, string | string[] | undefined>;
  requestId?: string;
  method?: string;
  url?: string;
}

interface HookReply {
  header: (name: string, value: string) => HookReply;
  code: (status: number) => HookReply;
  send: (body: unknown) => unknown;
}

type Done = (err?: Error) => void;

/**
 * onRequest hook: valid header → attach + echo; invalid → 400 problem;
 * missing → generated UUID. Every downstream handler and the problem filter
 * can rely on req.requestId being present.
 */
export function requestIdHook(req: HookRequest, reply: HookReply, done: Done): void {
  const resolved = resolveRequestId(req.headers ?? {});
  if (!resolved.ok) {
    const body = buildProblem({
      code: 'INVALID_REQUEST_ID',
      title: 'Invalid request ID',
      status: 400,
      detail: `Header ${REQUEST_ID_HEADER} must match [A-Za-z0-9-]{1,64}. Omit it to let the server generate one.`,
      instance: req.url,
      requestId: 'unparsable-request-id',
    });
    reply.header(REQUEST_ID_HEADER, 'unparsable-request-id');
    reply.code(400).send(body);
    done();
    return;
  }
  req.requestId = resolved.requestId;
  reply.header(REQUEST_ID_HEADER, resolved.requestId);
  done();
}
