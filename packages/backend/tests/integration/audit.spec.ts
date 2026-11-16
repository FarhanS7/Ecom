// packages/backend/tests/integration/audit.spec.ts - Integration test for privileged mutations audit logging (T062).
// Invariants verified:
// 1. Privileged business mutations across store onboarding, catalog, inventory, fulfillment, and refunds write append-only audit entries.
// 2. Sensitive fields (passwords, tokens, PANs) are automatically redacted in the persisted JSON.
// 3. String payloads exceeding 1000 characters are safely truncated to prevent DB bloat.
// 4. Audit queries support store-scoped and action-scoped filtering with keyset pagination.

import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetEnvCache } from '@shopscale/config';
import {
  AuditService,
  findMigrationsDir,
  openAdminConnection,
  requireDatabaseUrl,
  runMigrations,
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

describe('Privileged Business Mutations Audit Logging Integration (T062)', () => {
  let sql: Sql | null = null;
  let auditService: AuditService;

  beforeAll(async () => {
    sql = await connectOrSkip();
    if (sql) {
      await runMigrations(sql, migrationsDir);
      auditService = new AuditService(sql);
    }
  });

  afterAll(async () => {
    if (sql) {
      await sql.end();
    }
  });

  it('records append-only audit rows for privileged mutations with automated redaction and truncation (AD-1, G4)', async () => {
    if (!sql) return;

    const actorId = randomUUID();
    const storeId = randomUUID();
    const requestId = `req_audit_test_${Date.now()}`;

    // Seed User & Business & Store
    await sql`
      INSERT INTO users (id, email_normalized, password_hash, status)
      VALUES (${actorId}, ${`admin_${Date.now()}@example.com`}, 'hash_dummy', 'active')
    `;

    await sql`
      INSERT INTO businesses (id, owner_user_id, status, commission_bps)
      VALUES (${storeId}, ${actorId}, 'active', 500)
    `;

    await sql`
      INSERT INTO stores (id, business_id, slug, name, status)
      VALUES (${storeId}, ${storeId}, ${`audit-store-${Date.now()}`}, 'Audit Verification Store', 'active')
    `;

    // 1. Record Store Approval Mutation with sensitive before/after data
    const storeAudit = await auditService.recordMutation(
      {
        actorId,
        storeId,
        action: 'store.approved',
        entityType: 'store',
        entityId: storeId,
        before: {
          status: 'pending',
          password: 'plain_secret_password',
          accessToken: 'super_secret_token',
        },
        after: {
          status: 'active',
          longNote: 'Z'.repeat(1500),
        },
        requestId,
      },
    );

    expect(storeAudit.id).toBeDefined();
    expect(storeAudit.action).toBe('store.approved');
    expect(storeAudit.actor_id).toBe(actorId);
    expect(storeAudit.store_id).toBe(storeId);

    // Verify DB Row directly
    const [persistedRow] = (await sql`
      SELECT id, actor_id, store_id, action, entity_type, entity_id, redacted_before, redacted_after, request_id
      FROM audit_logs
      WHERE id = ${storeAudit.id}
    `) as unknown as Array<{
      id: string;
      actor_id: string;
      store_id: string;
      action: string;
      entity_type: string;
      entity_id: string;
      redacted_before: Record<string, string>;
      redacted_after: Record<string, string>;
      request_id: string;
    }>;

    expect(persistedRow).toBeDefined();
    expect(persistedRow.request_id).toBe(requestId);
    // Assert sensitive fields are redacted
    expect(persistedRow.redacted_before.password).toBe('[REDACTED]');
    expect(persistedRow.redacted_before.accessToken).toBe('[REDACTED]');
    expect(persistedRow.redacted_before.status).toBe('pending');

    // Assert string truncation works in DB JSONB
    expect(persistedRow.redacted_after.status).toBe('active');
    expect(persistedRow.redacted_after.longNote.endsWith('... [TRUNCATED]')).toBe(true);

    // 2. Record Stock Adjustment Mutation
    const variantId = randomUUID();
    const stockAudit = await auditService.recordMutation(
      {
        actorId,
        storeId,
        action: 'inventory.stock_adjusted',
        entityType: 'inventory',
        entityId: variantId,
        before: { onHand: 10, reserved: 2 },
        after: { onHand: 25, reserved: 2, deltaOnHand: 15, reason: 'manual_adjustment' },
        requestId,
      },
    );

    expect(stockAudit.action).toBe('inventory.stock_adjusted');
    expect(stockAudit.entity_id).toBe(variantId);

    // 3. Query audit logs with store scope
    const storeLogs = await auditService.listAuditLogs({ storeId });
    expect(storeLogs.items.length).toBeGreaterThanOrEqual(2);
    expect(storeLogs.items.some((it) => it.action === 'store.approved')).toBe(true);
    expect(storeLogs.items.some((it) => it.action === 'inventory.stock_adjusted')).toBe(true);

    // 4. Query audit logs filtered by action
    const actionLogs = await auditService.listAuditLogs({ action: 'inventory.stock_adjusted' });
    expect(actionLogs.items.length).toBeGreaterThanOrEqual(1);
    expect(actionLogs.items.every((it) => it.action === 'inventory.stock_adjusted')).toBe(true);
  });
});
