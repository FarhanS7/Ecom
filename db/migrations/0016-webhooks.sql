-- Migration 0016: Webhook events deduplication ledger (T050)
-- Invariants:
-- 1. PRIMARY KEY(provider, event_id) guarantees deduplication across webhook retries.
-- 2. payload_hash (SHA-256) enables detecting and quarantining altered payload replays.
-- 3. status tracks processing lifecycle: 'received', 'processed', 'quarantined'.

CREATE TABLE IF NOT EXISTS webhook_events (
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'received',
  PRIMARY KEY (provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_received_at ON webhook_events (received_at DESC);
