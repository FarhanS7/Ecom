// @shopscale/mock-payments/server - HTTP mock payment gateway simulator server (T049).
// Invariants:
// 1. POST /mock-payments/charges accepts charge requests and schedules signed webhook callbacks.
// 2. GET /mock-payments/charges/:effectKey provides reconciliation lookup.
// 3. POST /mock-payments/reset allows test cleanup.
// 4. Returns 400 on validation failure, 409 on conflicting effect key re-use.

import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { ConflictingEffectKeyError } from './ledger.js';
import { MockPaymentSimulator } from './simulator.js';

export interface CreateServerOptions {
  simulator: MockPaymentSimulator;
  port?: number;
}

export function createMockPaymentServer(options: CreateServerOptions): Server {
  const { simulator } = options;

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const method = req.method?.toUpperCase();

    // CORS headers for local testing
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, X-ShopScale-Timestamp, X-ShopScale-Signature, X-Mock-Outcome, X-Mock-Delay-Ms',
    );

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (method === 'GET' && url.pathname === '/health/live') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    if (method === 'POST' && url.pathname === '/mock-payments/reset') {
      simulator.clear();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (method === 'GET' && url.pathname.startsWith('/mock-payments/charges/')) {
      const effectKey = decodeURIComponent(url.pathname.replace('/mock-payments/charges/', ''));
      const attempt = simulator.ledger.getAttempt(effectKey);
      if (!attempt) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'NOT_FOUND', message: `Attempt for effectKey '${effectKey}' not found` }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(attempt));
      return;
    }

    if (method === 'POST' && url.pathname === '/mock-payments/charges') {
      let bodyData = '';
      req.on('data', (chunk: Buffer) => {
        bodyData += chunk.toString();
      });

      req.on('end', () => {
        try {
          const body = JSON.parse(bodyData || '{}') as Record<string, unknown>;
          const headerOutcome = req.headers['x-mock-outcome'] as string | undefined;
          const headerDelay = req.headers['x-mock-delay-ms']
            ? parseInt(req.headers['x-mock-delay-ms'] as string, 10)
            : undefined;

          // @ts-expect-error - runtime validation by Zod schema
          const response = simulator.charge(body, {
            outcome: headerOutcome,
            delayMs: headerDelay,
          });

          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(response));
        } catch (err) {
          if (err instanceof ConflictingEffectKeyError) {
            res.writeHead(409, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'CONFLICTING_EFFECT_KEY', message: err.message }));
            return;
          }
          if (err && typeof err === 'object' && 'name' in err && err.name === 'ZodError') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                error: 'VALIDATION_FAILED',
                message: err instanceof Error ? err.message : 'Validation failed',
              }),
            );
            return;
          }
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              error: 'INTERNAL_ERROR',
              message: err instanceof Error ? err.message : 'Unknown server error',
            }),
          );
        }
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'ROUTE_NOT_FOUND', path: url.pathname }));
  });

  return server;
}

// Standalone execution entrypoint
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  const port = process.env['MOCK_PAYMENTS_PORT'] ? parseInt(process.env['MOCK_PAYMENTS_PORT'], 10) : 3100;
  const secret = process.env['MOCK_PAYMENTS_SECRET'] || 'dev-mock-payments-secret-32-bytes-minimum-size';
  const simulator = new MockPaymentSimulator({ secret });
  const server = createMockPaymentServer({ simulator, port });
  server.listen(port, () => {
    console.log(`[mock-payments] Simulator running on http://127.0.0.1:${port}`);
  });
}
