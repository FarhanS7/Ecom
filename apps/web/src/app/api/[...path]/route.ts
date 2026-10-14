// Same-origin API gateway (T007a foundation, T017a auth support).
//
// Design (ARCHITECTURE.md): browsers never call Nest directly. The gateway
// forwards ONLY allowlisted paths and documented headers; it never trusts
// browser-supplied actor or store scope, and business rules stay in NestJS.
// Upstream problem bodies and statuses pass through preserved.
//
// Cookie policy (T017a): the `Cookie` header is REBUILT from exact-name
// matches (`access_token`, `refresh_token`) — never blindly proxied — so
// tracking/adversarial cookies cannot ride into the API. `Authorization`
// headers are never forwarded. All upstream `Set-Cookie` values pass through
// (session issuance must reach the browser).

import { NextRequest, NextResponse } from 'next/server';
import { apiBaseUrl, filterSessionCookies, resolveGatewayTarget, resolveOutgoingRequestId } from '@/lib/api';

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

async function proxy(req: NextRequest, params: { path: string[] }, method: 'GET' | 'POST'): Promise<NextResponse> {
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

  const headers: Record<string, string> = {
    accept: req.headers.get('accept') ?? 'application/json',
    'x-request-id': requestId,
  };
  const cookies = filterSessionCookies(req.headers.get('cookie'));
  if (cookies) headers['cookie'] = cookies;
  // Body is buffered as text first: no duplex streaming semantics, and the
  // content type is re-declared explicitly (never trust-blended).
  const incomingContentType = req.headers.get('content-type');
  if (method === 'POST' && incomingContentType) headers['content-type'] = incomingContentType;

  let upstream: Response;
  try {
    upstream = await fetch(`${base}/${target.path}${method === 'GET' ? req.nextUrl.search : ''}`, {
      method,
      headers,
      ...(method === 'POST' ? { body: await req.text() } : {}),
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

  const out = new Headers();
  const upstreamContentType = upstream.headers.get('content-type');
  if (upstreamContentType) out.set('content-type', upstreamContentType);
  out.set('x-request-id', requestId);
  for (const setCookie of upstream.headers.getSetCookie()) {
    out.append('set-cookie', setCookie);
  }
  return new NextResponse(upstream.body, { status: upstream.status, headers: out });
}

export async function GET(
  req: NextRequest,
  { params }: { params: { path: string[] } },
): Promise<NextResponse> {
  return proxy(req, params, 'GET');
}

export async function POST(
  req: NextRequest,
  { params }: { params: { path: string[] } },
): Promise<NextResponse> {
  return proxy(req, params, 'POST');
}
