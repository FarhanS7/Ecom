// packages/backend/tests/integration/mock-payments.spec.ts - Integration test for mock payment provider (T049).
// Invariants:
// 1. Accepts charges, records attempts in persistent ledger.
// 2. Dispatches signed webhooks with X-ShopScale-Timestamp and X-ShopScale-Signature.
// 3. Handles deterministic outcomes: SUCCESS, DECLINED, TIMEOUT.
// 4. Idempotent replay on identical effectKey, rejects conflicting amounts with 409.

import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  MockPaymentSimulator,
  createMockPaymentServer,
  verifyWebhookSignature,
} from '../../../../apps/mock-payments/src/index.js';
import type { PaymentWebhookPayload } from '@shopscale/contracts';

describe('Mock Payment Provider Integration (T049)', () => {
  const SECRET = 'test-mock-payments-secret-12345678901234567890';
  let simulator: MockPaymentSimulator;
  let paymentServer: import('node:http').Server;
  let paymentBaseUrl: string;

  let webhookServer: import('node:http').Server;
  let webhookUrl: string;
  const receivedWebhooks: Array<{
    headers: Record<string, string | string[] | undefined>;
    rawBody: string;
    payload: PaymentWebhookPayload;
  }> = [];

  beforeAll(async () => {
    // 1. Start mock webhook receiver
    webhookServer = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body) as PaymentWebhookPayload;
          receivedWebhooks.push({
            headers: req.headers,
            rawBody: body,
            payload,
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ received: true }));
        } catch {
          res.writeHead(400);
          res.end();
        }
      });
    });

    await new Promise<void>((resolve) => {
      webhookServer.listen(0, '127.0.0.1', () => resolve());
    });
    const webhookAddr = webhookServer.address() as AddressInfo;
    webhookUrl = `http://127.0.0.1:${webhookAddr.port}/webhooks`;

    // 2. Start mock payment simulator server
    simulator = new MockPaymentSimulator({
      secret: SECRET,
      defaultWebhookUrl: webhookUrl,
    });
    paymentServer = createMockPaymentServer({ simulator });
    await new Promise<void>((resolve) => {
      paymentServer.listen(0, '127.0.0.1', () => resolve());
    });
    const paymentAddr = paymentServer.address() as AddressInfo;
    paymentBaseUrl = `http://127.0.0.1:${paymentAddr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => paymentServer.close(() => resolve()));
    await new Promise<void>((resolve) => webhookServer.close(() => resolve()));
  });

  beforeEach(() => {
    simulator.clear();
    receivedWebhooks.length = 0;
  });

  it('health check returns ok', async () => {
    const res = await fetch(`${paymentBaseUrl}/health/live`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('ok');
  });

  it('submits charge, returns 201, and delivers signed webhook callback', async () => {
    const chargeReq = {
      effectKey: 'eff_test_success_1',
      amountCents: '15000',
      currency: 'USD',
      webhookUrl,
      simulateOutcome: 'SUCCESS',
    };

    const res = await fetch(`${paymentBaseUrl}/mock-payments/charges`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chargeReq),
    });

    expect(res.status).toBe(201);
    const chargeRes = (await res.json()) as {
      effectKey: string;
      providerRef: string;
      status: string;
      amountCents: string;
    };

    expect(chargeRes.effectKey).toBe('eff_test_success_1');
    expect(chargeRes.amountCents).toBe('15000');
    expect(chargeRes.providerRef).toMatch(/^mock_ch_/);

    // Wait for async webhook delivery
    await new Promise((r) => setTimeout(r, 60));

    expect(receivedWebhooks).toHaveLength(1);
    const delivered = receivedWebhooks[0]!;

    // Verify webhook headers
    const signature = delivered.headers['x-shopscale-signature'] as string;
    const timestampStr = delivered.headers['x-shopscale-timestamp'] as string;
    expect(signature).toBeDefined();
    expect(timestampStr).toBeDefined();

    // Verify cryptographic signature over raw bytes
    const check = verifyWebhookSignature(SECRET, signature, Number(timestampStr), delivered.rawBody);
    expect(check.valid).toBe(true);

    // Verify payload contents
    expect(delivered.payload.type).toBe('payment.succeeded');
    expect(delivered.payload.effectKey).toBe('eff_test_success_1');
    expect(delivered.payload.amountCents).toBe('15000');
    expect(delivered.payload.providerRef).toBe(chargeRes.providerRef);
  });

  it('handles identical effectKey replay idempotently without extra charge', async () => {
    const chargeReq = {
      effectKey: 'eff_replay_1',
      amountCents: '9900',
      currency: 'USD',
      webhookUrl,
    };

    const res1 = await fetch(`${paymentBaseUrl}/mock-payments/charges`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chargeReq),
    });
    expect(res1.status).toBe(201);
    const data1 = (await res1.json()) as { providerRef: string };

    const res2 = await fetch(`${paymentBaseUrl}/mock-payments/charges`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chargeReq),
    });
    expect(res2.status).toBe(201);
    const data2 = (await res2.json()) as { providerRef: string };

    expect(data1.providerRef).toBe(data2.providerRef);
  });

  it('rejects conflicting amount on reused effectKey with 409 Conflict', async () => {
    const chargeReq1 = {
      effectKey: 'eff_conflict_1',
      amountCents: '5000',
      currency: 'USD',
      webhookUrl,
    };
    const res1 = await fetch(`${paymentBaseUrl}/mock-payments/charges`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chargeReq1),
    });
    expect(res1.status).toBe(201);

    const chargeReq2 = {
      effectKey: 'eff_conflict_1',
      amountCents: '7500', // conflicting amount
      currency: 'USD',
      webhookUrl,
    };
    const res2 = await fetch(`${paymentBaseUrl}/mock-payments/charges`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chargeReq2),
    });
    expect(res2.status).toBe(409);
    const errBody = (await res2.json()) as { error: string };
    expect(errBody.error).toBe('CONFLICTING_EFFECT_KEY');
  });

  it('handles simulated DECLINED outcome and dispatches payment.failed webhook', async () => {
    const chargeReq = {
      effectKey: 'eff_declined_1',
      amountCents: '8000',
      currency: 'USD',
      webhookUrl,
      simulateOutcome: 'DECLINED',
    };

    const res = await fetch(`${paymentBaseUrl}/mock-payments/charges`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chargeReq),
    });
    expect(res.status).toBe(201);

    await new Promise((r) => setTimeout(r, 60));

    expect(receivedWebhooks).toHaveLength(1);
    const delivered = receivedWebhooks[0]!;
    expect(delivered.payload.type).toBe('payment.failed');
    expect(delivered.payload.effectKey).toBe('eff_declined_1');

    const check = verifyWebhookSignature(
      SECRET,
      delivered.headers['x-shopscale-signature'] as string,
      Number(delivered.headers['x-shopscale-timestamp']),
      delivered.rawBody,
    );
    expect(check.valid).toBe(true);
  });

  it('handles simulated TIMEOUT without immediate webhook dispatch', async () => {
    const chargeReq = {
      effectKey: 'eff_timeout_1',
      amountCents: '12000',
      currency: 'USD',
      webhookUrl,
      simulateOutcome: 'TIMEOUT',
    };

    const res = await fetch(`${paymentBaseUrl}/mock-payments/charges`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chargeReq),
    });
    expect(res.status).toBe(201);
    const chargeRes = (await res.json()) as { status: string };
    expect(chargeRes.status).toBe('PENDING');

    await new Promise((r) => setTimeout(r, 80));
    expect(receivedWebhooks).toHaveLength(0);
  });

  it('allows reconciliation lookup via GET /mock-payments/charges/:effectKey', async () => {
    const chargeReq = {
      effectKey: 'eff_lookup_1',
      amountCents: '2500',
      currency: 'USD',
      webhookUrl,
    };
    await fetch(`${paymentBaseUrl}/mock-payments/charges`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chargeReq),
    });

    const res = await fetch(`${paymentBaseUrl}/mock-payments/charges/eff_lookup_1`);
    expect(res.status).toBe(200);
    const lookup = (await res.json()) as { effectKey: string; amountCents: string };
    expect(lookup.effectKey).toBe('eff_lookup_1');
    expect(lookup.amountCents).toBe('2500');

    // Non-existent key returns 404
    const notFound = await fetch(`${paymentBaseUrl}/mock-payments/charges/eff_missing`);
    expect(notFound.status).toBe(404);
  });

  it('fails signature check if raw webhook payload is tampered in transit', async () => {
    const chargeReq = {
      effectKey: 'eff_tamper_1',
      amountCents: '3000',
      currency: 'USD',
      webhookUrl,
    };
    await fetch(`${paymentBaseUrl}/mock-payments/charges`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chargeReq),
    });

    await new Promise((r) => setTimeout(r, 60));
    expect(receivedWebhooks).toHaveLength(1);
    const delivered = receivedWebhooks[0]!;

    const tamperedBody = delivered.rawBody.replace('3000', '9999');
    const check = verifyWebhookSignature(
      SECRET,
      delivered.headers['x-shopscale-signature'] as string,
      Number(delivered.headers['x-shopscale-timestamp']),
      tamperedBody,
    );
    expect(check.valid).toBe(false);
    expect(check.reason).toBe('INVALID_SIGNATURE');
  });
});
