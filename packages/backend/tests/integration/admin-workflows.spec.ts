// packages/backend/tests/integration/admin-workflows.spec.ts - Integration test for admin moderation and support policies (T069).
// Invariants verified:
// 1. Seller applications create pending stores; only platform admin can approve or suspend.
// 2. Support agents cannot approve seller applications (403 / FORBIDDEN).
// 3. Support refunds are strictly capped at $200.00 (20,000 cents) cumulative per order.
// 4. Support refund of $200.01 is rejected with RefundPolicyCapExceededError.
// 5. Cumulative support refunds totaling > $200 on same order are rejected.
// 6. Platform administrators have unlimited refund authority.

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetEnvCache } from '@shopscale/config';
import {
  OnboardingError,
  RefundPolicyCapExceededError,
  RefundService,
  applyForStore,
  approveStore,
  findMigrationsDir,
  listAdminStores,
  openAdminConnection,
  requireDatabaseUrl,
  runMigrations,
  suspendStore,
} from '../../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = findMigrationsDir(here);

type Sql = Awaited<ReturnType<typeof openAdminConnection>>;

async function connectOrSkip(): Promise<Sql | null> {
  resetEnvCache();
  let url: string;
  try {
    url = requireDatabaseUrl();
  } catch {
    console.warn('SKIP: DATABASE_URL not configured; start infra first.');
    return null;
  }
  const sql = openAdminConnection(url);
  try {
    await sql`SELECT 1`;
    return sql;
  } catch {
    await sql.end();
    console.warn('SKIP: database unreachable; start infra first.');
    return null;
  }
}

describe('Platform Admin Moderation & Support Workflows Integration (T069)', () => {
  let sql: Sql | null = null;
  let refundService: RefundService;

  beforeAll(async () => {
    sql = await connectOrSkip();
    if (sql) {
      await runMigrations(sql, migrationsDir);
      refundService = new RefundService(sql);
    }
  });

  afterAll(async () => {
    if (sql) {
      await sql.end();
    }
  });

  it('enforces platform admin permissions for seller moderation and support refund caps', async () => {
    if (!sql) return;

    const prefix = `adm_${Date.now()}`;

    // 1. Create admin, support, and seller users
    const [adminUser] = await sql`
      INSERT INTO "users" ("email_normalized", "password_hash", "status")
      VALUES (${`admin_${prefix}@shopscale.dev`}, 'hash', 'active')
      RETURNING id;
    `;
    await sql`
      INSERT INTO "user_platform_roles" ("user_id", "role_id")
      SELECT ${adminUser.id}, id FROM "platform_roles" WHERE "key" = 'admin';
    `;

    const [supportUser] = await sql`
      INSERT INTO "users" ("email_normalized", "password_hash", "status")
      VALUES (${`support_${prefix}@shopscale.dev`}, 'hash', 'active')
      RETURNING id;
    `;
    await sql`
      INSERT INTO "user_platform_roles" ("user_id", "role_id")
      SELECT ${supportUser.id}, id FROM "platform_roles" WHERE "key" = 'support';
    `;

    const [sellerUser] = await sql`
      INSERT INTO "users" ("email_normalized", "password_hash", "status")
      VALUES (${`seller_${prefix}@test.com`}, 'hash', 'active')
      RETURNING id;
    `;

    // 2. Seller submits application for new store
    const application = await applyForStore(
      {
        userId: sellerUser.id,
        slug: `store-${prefix}`,
        name: `Store ${prefix}`,
        requestId: `req_app_${prefix}`,
      },
      sql,
    );
    expect(application.status).toBe('pending');

    // 3. Admin can list pending store
    const adminStoreList = await listAdminStores({ status: 'pending', actorId: adminUser.id }, sql);
    expect(adminStoreList.some((s) => s.id === application.storeId)).toBe(true);

    // 4. Security Regression: Support agent CANNOT approve seller applications
    await expect(
      approveStore(
        {
          storeId: application.storeId,
          actorId: supportUser.id,
          requestId: `req_sup_appr_${prefix}`,
        },
        sql,
      ),
    ).rejects.toThrow(OnboardingError);

    // 5. Admin approves store application -> transitions to 'active'
    const approval = await approveStore(
      {
        storeId: application.storeId,
        actorId: adminUser.id,
        requestId: `req_adm_appr_${prefix}`,
      },
      sql,
    );
    expect(approval.status).toBe('active');

    // 6. Admin can suspend active store -> transitions to 'suspended'
    const suspension = await suspendStore(
      {
        storeId: application.storeId,
        actorId: adminUser.id,
        requestId: `req_adm_susp_${prefix}`,
      },
      sql,
    );
    expect(suspension.status).toBe('suspended');

    // 7. Test Support Refund Cap Enforcement ($200.00 / 20,000 cents)
    const [buyer] = await sql`
      INSERT INTO "users" ("email_normalized", "password_hash", "status")
      VALUES (${`buyer_${prefix}@test.com`}, 'hash', 'active')
      RETURNING id;
    `;

    const [order] = await sql`
      INSERT INTO "orders" (
        "user_id", "channel_key", "payment_status", "fulfillment_status",
        "subtotal_cents", "shipping_cents", "discount_cents", "total_cents", "currency"
      ) VALUES (
        ${buyer.id}, 'marketplace', 'PAID', 'PENDING',
        50000, 0, 0, 50000, 'USD'
      ) RETURNING id;
    `;

    await sql`
      INSERT INTO "payment_attempts" (
        "order_id", "amount_cents", "currency", "status", "provider"
      ) VALUES (
        ${order.id}, 50000, 'USD', 'PAID', 'mock'
      );
    `;

    // Security Regression: Support refund of $200.01 (20,001 cents) FAILS with RefundPolicyCapExceededError
    await expect(
      refundService.processRefund({
        orderId: order.id,
        amountCents: 20001,
        reason: 'Attempted $200.01 refund',
        actorId: supportUser.id,
        isSupportAgent: true,
      }),
    ).rejects.toThrow(RefundPolicyCapExceededError);

    // Valid support refund of $50 (5,000 cents) SUCCEEDS
    const firstRefund = await refundService.processRefund({
      orderId: order.id,
      amountCents: 5000,
      reason: 'Support courtesy $50',
      actorId: supportUser.id,
      isSupportAgent: true,
    });
    expect(firstRefund.amountCents).toBe(5000);
    expect(firstRefund.remainingCents).toBe(45000);

    // Support agent attempts second refund of $160 (cumulative $50 + $160 = $210 > $200 cap) -> FAILS
    await expect(
      refundService.processRefund({
        orderId: order.id,
        amountCents: 16000,
        reason: 'Second support courtesy exceeding cap',
        actorId: supportUser.id,
        isSupportAgent: true,
      }),
    ).rejects.toThrow(RefundPolicyCapExceededError);

    // Admin agent issues $300 refund (30,000 cents) -> SUCCEEDS (unlimited admin authority)
    const adminRefund = await refundService.processRefund({
      orderId: order.id,
      amountCents: 30000,
      reason: 'Platform admin discretionary settlement',
      actorId: adminUser.id,
      isSupportAgent: false,
    });
    expect(adminRefund.amountCents).toBe(30000);
    expect(adminRefund.remainingCents).toBe(15000);
  });
});
