import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Operational Runbooks Verification (TASK-087)', () => {
  const runbooksPath = path.resolve(__dirname, '../../docs/operations/runbooks.md');
  const alertsPath = path.resolve(__dirname, '../../infra/prometheus/alerts.yml');

  it('docs/operations/runbooks.md should exist and be well-formed', () => {
    expect(fs.existsSync(runbooksPath)).toBe(true);
    const content = fs.readFileSync(runbooksPath, 'utf-8');
    expect(content.length).toBeGreaterThan(1500);
  });

  it('should document Runbook 1: Outbox Relay Lag High with exact alert and queries', () => {
    const content = fs.readFileSync(runbooksPath, 'utf-8');
    expect(content).toContain('Runbook 1: Outbox Relay Lag High');
    expect(content).toContain('OutboxLagHigh');
    expect(content).toContain('outbox_events');
    expect(content).toContain('docker compose -f infra/compose.prod.yml restart worker');
  });

  it('should document Runbook 2: Webhook Signature Failure Storm with diagnosis and replay', () => {
    const content = fs.readFileSync(runbooksPath, 'utf-8');
    expect(content).toContain('Runbook 2: Webhook Signature Failure Storm');
    expect(content).toContain('webhook_events');
    expect(content).toContain('replay');
  });

  it('should document Runbook 3: Search Projection Drift with zero-downtime reindexing', () => {
    const content = fs.readFileSync(runbooksPath, 'utf-8');
    expect(content).toContain('Runbook 3: Search Projection Drift');
    expect(content).toContain('reindex');
    expect(content).toContain('batch-size');
  });

  it('should document Runbook 4: Database Connection Starvation with pg_stat_activity and lock inspection', () => {
    const content = fs.readFileSync(runbooksPath, 'utf-8');
    expect(content).toContain('Runbook 4: Database Connection Starvation');
    expect(content).toContain('PostgresPoolSaturated');
    expect(content).toContain('pg_stat_activity');
    expect(content).toContain('pg_terminate_backend');
  });

  it('should document Runbook 5: Payment Reconciliation Failure with ledger balance invariant check', () => {
    const content = fs.readFileSync(runbooksPath, 'utf-8');
    expect(content).toContain('Runbook 5: Payment Reconciliation Failure');
    expect(content).toContain('ledger_entries');
    expect(content).toContain('debit_amount');
    expect(content).toContain('credit_amount');
  });

  it('should document Operating Drills Checklist table covering failure modes', () => {
    const content = fs.readFileSync(runbooksPath, 'utf-8');
    expect(content).toContain('Operating Drills Checklist');
    expect(content).toContain('DRILL-01');
    expect(content).toContain('DRILL-05');
  });

  it('referenced alerts should match alerts defined in infra/prometheus/alerts.yml', () => {
    const alertsContent = fs.readFileSync(alertsPath, 'utf-8');
    expect(alertsContent).toContain('OutboxLagHigh');
    expect(alertsContent).toContain('PostgresPoolSaturated');
  });
});
