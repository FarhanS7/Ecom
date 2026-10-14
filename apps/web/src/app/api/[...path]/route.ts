// Same-origin API gateway (T007a). Only GET exists in this scope — Next
// answers other methods with 405 automatically, and cookie/authorization
// forwarding arrives with identity work (T010), never here.
//
// Design (ARCHITECTURE.md): browsers never call Nest directly. The gateway
// forwards ONLY allowlisted paths and the documented headers (accept,
// x-request-id); it never trusts browser-supplied actor or store scope, and
// business rules stay in NestJS. Upstream problem bodies pass through with
// their status preserved.

import { NextRequest, NextResponse } from 'next/server';
import { apiBaseUrl, resolveGatewayTarget, resolveOutgoingRequestId } from '@/lib/api';

const UPSTREAM_TIMEOUT_MS = 5000;

function gatewayProblem(
  status: number,
  code: string,
  title: string,
  detail: string,
  requestId: string,
  instance: string,
): NextResponse {
  return NextResponse.json(
    {
      type: `https://shopscale.dev/problems/${code.toLowerCase().replace(/_/g, '-')}`,
      title,
      status,
      detail,
      instance,
      code,
      requestId,
    },
    { status, headers: { 'x-request-id': requestId } },
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: { path: string[] } },
): Promise<NextResponse> {
  const requestId = resolveOutgoingRequestId(req.headers.get('x-request-id'));
  const instance = `/api/${(params.path ?? []).join('/')}`;

  const target = resolveGatewayTarget(params.path ?? []);
  if (!target.ok) {
    return gatewayProblem(
      404,
      'NOT_FOUND',
      'Not found',
      `Gateway target rejected (${target.reason}).`,
      requestId,
      instance,
    );
  }

  let base: string;
  try {
    base = apiBaseUrl();
  } catch (err) {
    return gatewayProblem(
      500,
      'INTERNAL_ERROR',
      'Internal server error',
      err instanceof Error ? err.message : 'Upstream not configured.',
      requestId,
      instance,
    );
  }

  const search = req.nextUrl.search;
  let upstream: Response;
  try {
    upstream = await fetch(`${base}/${target.path}${search}`, {
      method: 'GET',
      headers: {
        accept: req.headers.get('accept') ?? 'application/json',
        'x-request-id': requestId,
      },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return gatewayProblem(
      503,
      'INTERNAL_ERROR',
      'Upstream unavailable',
      'The API did not answer in time.',
      requestId,
      instance,
    );
  }

  const headers = new Headers();
  const contentType = upstream.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);
  headers.set('x-request-id', requestId);
  return new NextResponse(upstream.body, { status: upstream.status, headers });
}
