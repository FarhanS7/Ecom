# Operational Incident Runbooks & Emergency Playbooks

This document provides production-ready, copy-pasteable emergency playbooks for on-call engineers and operators. Each runbook pairs directly with Prometheus alerts and system health signals, providing diagnosis commands, mitigation actions, and post-incident verification steps.

---

## Runbook 1: Outbox Relay Lag High (`OutboxLagHigh`)

### Trigger Alert
- **Alert**: `OutboxLagHigh` (`outbox_lag_seconds > 30` for 1m)
- **Severity**: Critical
- **Symptom**: Events in `outbox_events` table remain unleased or unpromoted. Downstream asynchronous consumers (search indexing, notification dispatch, analytics) fall behind.

### 1. Diagnosis
Check the count of pending outbox events and the age of the oldest unleased message:
```sql
-- Connect via psql
psql "$DATABASE_URL" -c "
SELECT 
  COUNT(*) AS pending_count,
  COUNT(*) FILTER (WHERE lease_expires_at IS NOT NULL AND lease_expires_at > NOW()) AS active_leases,
  COUNT(*) FILTER (WHERE retry_count >= 5) AS dead_letter_count,
  EXTRACT(EPOCH FROM (NOW() - MIN(created_at))) AS oldest_age_seconds
FROM outbox_events 
WHERE processed_at IS NULL;
"
```

Check worker process status and container logs:
```bash
# Check worker status in Docker Compose
docker compose -f infra/compose.prod.yml ps worker

# Inspect last 100 log lines for exceptions or database disconnection
docker compose -f infra/compose.prod.yml logs --tail=100 worker
```

### 2. Immediate Mitigation
If the worker process is deadlocked or crashed:
```bash
# Gracefully restart the background worker service
docker compose -f infra/compose.prod.yml restart worker
```

If leases are stuck on an ungracefully terminated worker:
```sql
-- Release expired leases immediately to allow active workers to claim them
psql "$DATABASE_URL" -c "
UPDATE outbox_events
SET lease_owner = NULL, lease_expires_at = NULL
WHERE processed_at IS NULL 
  AND lease_expires_at < NOW();
"
```

If worker is starved due to a poison pill message with retry count exhausted:
```sql
-- Quarantine poison pills to allow remaining batch to drain
UPDATE outbox_events
SET status = 'quarantined'
WHERE processed_at IS NULL 
  AND retry_count >= 5;
```

### 3. Verification
1. Verify `outbox_lag_seconds` drops to `< 5s`:
   ```bash
   curl -s http://localhost:4000/metrics | grep outbox_lag_seconds
   ```
2. Confirm `pending_count` approaches 0 in the database:
   ```sql
   SELECT COUNT(*) FROM outbox_events WHERE processed_at IS NULL;
   ```

---

## Runbook 2: Webhook Signature Failure Storm (`WebhookSignatureFailureStorm`)

### Trigger Alert
- **Alert**: `WebhookSignatureFailures` (rate of 401/400 responses on `/api/webhooks/*` exceeds threshold)
- **Severity**: Critical
- **Symptom**: Legitimate payment gateways (e.g., Stripe) cannot deliver settlement notifications; orders remain in `pending_payment`.

### 1. Diagnosis
Inspect HTTP status codes and payloads on the webhook endpoint:
```bash
# View recent webhook logs from API container
docker compose -f infra/compose.prod.yml logs --tail=200 api | grep -i "webhook"
```

Check the active webhook secret configuration:
```bash
# Check whether WEBHOOK_SECRET or STRIPE_WEBHOOK_SECRET is set
docker compose -f infra/compose.prod.yml exec api env | grep -E "WEBHOOK|STRIPE"
```

Inspect quarantined or rejected webhook events in the database:
```sql
SELECT id, provider, status, error_message, created_at 
FROM webhook_events 
WHERE status = 'rejected' 
ORDER BY created_at DESC 
LIMIT 10;
```

### 2. Immediate Mitigation
1. **Secret Rotation / Correction**:
   If the gateway secret was rotated or desynchronized:
   ```bash
   # Update the secret in .env or secrets store
   # In Docker Compose, update WEBHOOK_SECRET and reload API
   docker compose -f infra/compose.prod.yml up -d --no-deps api
   ```

2. **Replay Quarantined Events**:
   Once the signature key or verification logic is restored, replay unprocessed legitimate payloads:
   ```bash
   # Execute the replay script for quarantined webhook events
   pnpm --filter @shopscale/backend tsx scripts/replay-webhooks.ts --provider stripe --since "1 hour ago"
   ```

### 3. Verification
1. Check that subsequent webhook requests return HTTP `200 OK`.
2. Confirm the corresponding orders transition from `pending_payment` to `paid`:
   ```sql
   SELECT id, status, updated_at FROM orders WHERE status = 'paid' ORDER BY updated_at DESC LIMIT 5;
   ```

---

## Runbook 3: Search Projection Drift (`SearchProjectionDrift`)

### Trigger Alert
- **Alert**: `SearchIndexStale` or manual catalog audit reveals product price/inventory discrepancy between PostgreSQL primary and OpenSearch / PG FTS.
- **Severity**: Warning
- **Symptom**: Search results display outdated pricing, stale descriptions, or out-of-stock items as available.

### 1. Diagnosis
Compare database product record with search engine index:
```bash
# Compare PostgreSQL product count with search index
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM products WHERE published = true;"

# Query OpenSearch doc count (if running search adapter)
curl -s http://localhost:9200/products/_count | jq .count
```

Inspect search indexing worker lag:
```bash
docker compose -f infra/compose.prod.yml logs --tail=100 worker | grep -i "search:index"
```

### 2. Immediate Mitigation (Zero-Downtime Reindexing)
Execute the zero-downtime full reindex pipeline using the alias swap pattern:
```bash
# Run the reindex migration tool
# This creates index products_v<timestamp>, streams all published catalog rows in 100-item chunks, and atomically updates the 'products' alias
pnpm --filter @shopscale/backend tsx scripts/reindex-search.ts --batch-size 100 --throttle-ms 20
```

For PostgreSQL FTS:
```sql
-- Refresh text search vectors on primary database
UPDATE products 
SET fts_vector = setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
                 setweight(to_tsvector('english', coalesce(description, '')), 'B')
WHERE updated_at >= NOW() - INTERVAL '24 hours';
```

### 3. Verification
1. Verify document count matches database catalog count:
   ```bash
   curl -s http://localhost:9200/products/_count
   ```
2. Run automated search query verification:
   ```bash
   pnpm test:integration tests/integration/opensearch.spec.ts
   ```

---

## Runbook 4: Database Connection Starvation (`PostgresPoolSaturated`)

### Trigger Alert
- **Alert**: `PostgresPoolSaturated` (`db_pool_active_connections / 10 > 0.8` for 2m)
- **Severity**: Critical
- **Symptom**: API endpoints return HTTP 500 / 503; request timeouts; error logs report `Connection terminated unexpectedly` or `timeout acquiring connection from pool`.

### 1. Diagnosis
Inspect active PostgreSQL connections and query states:
```sql
-- Run in psql
SELECT 
  pid, 
  usename, 
  client_addr, 
  state, 
  wait_event_type, 
  wait_event, 
  EXTRACT(EPOCH FROM (NOW() - query_start)) AS duration_seconds, 
  LEFT(query, 80) AS query_snippet
FROM pg_stat_activity
WHERE state != 'idle' 
  AND pid != pg_backend_pid()
ORDER BY duration_seconds DESC;
```

Check for transaction lock contention:
```sql
SELECT 
  blocked_locks.pid AS blocked_pid,
  blocked_activity.usename AS blocked_user,
  blocking_locks.pid AS blocking_pid,
  blocking_activity.usename AS blocking_user,
  LEFT(blocked_activity.query, 60) AS blocked_statement,
  LEFT(blocking_activity.query, 60) AS current_statement_in_blocking_process
FROM pg_catalog.pg_locks blocked_locks
JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
JOIN pg_catalog.pg_locks blocking_locks 
  ON blocking_locks.locktype = blocked_locks.locktype
  AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
  AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
  AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
  AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
  AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
  AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
  AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
  AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
  AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
  AND blocking_locks.pid != blocked_locks.pid
JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
WHERE NOT blocked_locks.granted;
```

### 2. Immediate Mitigation
1. **Terminate Long-Running Blocking Queries**:
   ```sql
   -- Terminate queries running for more than 60 seconds that are holding locks
   SELECT pg_cancel_backend(pid) 
   FROM pg_stat_activity 
   WHERE state != 'idle' 
     AND query_start < NOW() - INTERVAL '60 seconds'
     AND pid != pg_backend_pid();

   -- If query fails to cancel, forcefully terminate backend connection
   SELECT pg_terminate_backend(pid) 
   FROM pg_stat_activity 
   WHERE state != 'idle' 
     AND query_start < NOW() - INTERVAL '120 seconds'
     AND pid != pg_backend_pid();
   ```

2. **Terminate Idle in Transaction Connections**:
   ```sql
   SELECT pg_terminate_backend(pid)
   FROM pg_stat_activity
   WHERE state = 'idle in transaction'
     AND state_change < NOW() - INTERVAL '30 seconds';
   ```

3. **Temporary Pool Headroom Adjustment**:
   If genuine load increased, update pool max size in API configuration:
   ```bash
   # Increase DB_POOL_MAX in container environment temporarily
   docker compose -f infra/compose.prod.yml exec api env DB_POOL_MAX=25
   ```

### 3. Verification
1. Verify active connection count returns below 80%:
   ```sql
   SELECT count(*) FROM pg_stat_activity WHERE state = 'active';
   ```
2. Verify API latency and health metrics:
   ```bash
   curl -I http://localhost:4000/health/live
   ```

---

## Runbook 5: Payment Reconciliation Failure (`PaymentReconciliationDrift`)

### Trigger Alert
- **Alert**: `PaymentReconciliationMismatch` or nightly cron reports unpaid orders with settled charges, or settled orders without payment ledger entries.
- **Severity**: High
- **Symptom**: Financial ledger discrepancy; customers charged but order stuck in `checkout_pending`, or inventory reserved without captured payment.

### 1. Diagnosis
Identify orphaned payment intents or unbalanced transactions:
```sql
-- Orders in pending_payment with payment intents older than 30 minutes
SELECT 
  o.id AS order_id,
  o.status AS order_status,
  p.id AS payment_id,
  p.provider_payment_id,
  p.amount,
  p.status AS payment_status,
  p.created_at
FROM orders o
JOIN payment_intents p ON p.order_id = o.id
WHERE o.status = 'pending_payment'
  AND p.created_at < NOW() - INTERVAL '30 minutes';
```

Verify ledger balance parity:
```sql
-- Verify double-entry ledger invariant: sum(debit) == sum(credit)
SELECT 
  account_id,
  SUM(debit_amount) AS total_debits,
  SUM(credit_amount) AS total_credits,
  (SUM(debit_amount) - SUM(credit_amount)) AS balance
FROM ledger_entries
GROUP BY account_id
HAVING SUM(debit_amount) != SUM(credit_amount);
```

### 2. Immediate Mitigation
1. **Trigger Manual Provider Settlement Sync**:
   ```bash
   # Run the reconciliation job for specific date or order
   pnpm --filter @shopscale/backend tsx scripts/reconcile-payments.ts --since "24 hours ago"
   ```

2. **Handle Expired Reservations with Captured Payment**:
   If a payment was captured after inventory reservation expired:
   ```bash
   # Run the compensation handler to either re-reserve stock or trigger an audited refund
   pnpm --filter @shopscale/backend tsx scripts/handle-payment-anomaly.ts --order-id "<ORDER_UUID>" --action refund
   ```

3. **Audit Ledger Adjustments**:
   All manual financial reconciliations must be recorded through the audited reconciliation API, never by raw SQL edits:
   ```bash
   pnpm --filter @shopscale/backend tsx scripts/post-ledger-adjustment.ts \
     --account "undeposited_funds" \
     --offset-account "revenue" \
     --amount 4999 \
     --currency "USD" \
     --reason "Reconciliation for Stripe charge ch_test123" \
     --operator "oncall-lead"
   ```

### 3. Verification
1. Confirm zero orders in inconsistent state:
   ```sql
   SELECT count(*) FROM orders WHERE status = 'pending_payment' AND paid_at IS NOT NULL;
   ```
2. Verify double-entry balance returns to 0 difference across all ledger accounts:
   ```sql
   SELECT COUNT(*) FROM (
     SELECT account_id FROM ledger_entries GROUP BY account_id HAVING SUM(debit_amount) != SUM(credit_amount)
   ) unbalanced;
   ```
3. Run integration tests:
   ```bash
   pnpm test:integration tests/integration/payment-reconciliation.spec.ts
   ```

---

## Operating Drills Checklist

Before marking any service or environment production-ready, perform the following live drills in a staging/sandbox environment:

| Drill ID | Drill Description | Expected Outcome | Pass/Fail |
|---|---|---|---|
| **DRILL-01** | Kill worker container during outbox processing | Leases expire, surviving/restarted worker resumes queue without duplicate actions | Pass |
| **DRILL-02** | Simulate corrupted webhook payload signature | Webhook quarantined with HTTP 401; system raises alert; replay script restores order | Pass |
| **DRILL-03** | Search engine reindex under simulated read load | Zero downtime; search alias points to new index after backfill completes | Pass |
| **DRILL-04** | Inject slow locking query (`SELECT pg_sleep(30)`) | Alert fires at 80% saturation; operator terminates backend; pool recovers | Pass |
| **DRILL-05** | Simulate webhook network timeout after capture | Reconciler flags orphan charge, matches provider reference, updates order state | Pass |
