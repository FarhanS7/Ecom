# Outbox delivery, repeat-safe workers, and tracing

Learning status: reference material for future implementation. Examples are reasoning sketches, not tested application code.

Related implementation: T029–T030, T061, T071–T074. Prerequisites: Database transactions and the payment lesson's uncertain-outcome model.

## Choose your route

Guided: read this lesson, implement the linked task, then attempt the [challenge](../challenges/11-reliability.md). Challenge-first: open that file now, use [hints](../hints/11-reliability.md) only if needed, then compare [solution reasoning](../solutions/11-reliability.md).

## Mental model

The database and queue do not share your local transaction. If you commit an order then publish, a crash can lose the event. If you publish then commit, a worker can act on an order that never commits. The outbox makes the intent durable with the order; delivery may still repeat.

## Worked example

Relay publishes event E and crashes before recording published_at. Restart publishes E again. A consumer receipt committed with its database mutation prevents duplicate business changes. External email requires its own effect key because a DB receipt alone cannot atomically cover another system.

```
BEGIN;
INSERT INTO consumer_receipts(consumer_name, event_id, processed_at)
VALUES ($1, $2, now()) ON CONFLICT DO NOTHING;
-- Continue mutation only if this transaction inserted the receipt.
-- Roll back receipt and mutation together if the handler fails.
COMMIT;
```

## Guided implementation

1. Draw all crash windows between order write, outbox write, enqueue, consume, effect and acknowledgment.
2. Implement bounded relay leases and stable event IDs.
3. Make DB consumers transact receipt plus mutation; handle external effects with durable operation keys.
4. Add retry/backoff, visible failed jobs, and replay preserving identity.
5. Trace one order across request ID, event ID and provider effect key without storing PII in logs.

Use [the task tracker](../../../tasks/todo.md) for the concrete implementation order. Do not implement a lesson's later-stage example before its task prerequisites are present.

## Common mistakes

Claiming exactly-once delivery; inserting receipt before a transaction and never rolling it back; deleting jobs to hide failures; high-cardinality metric labels; queue-only durability with no reconciliation after Redis loss.

## Explain it without looking

- Which crash creates duplicate delivery even with a correct outbox?
- Why can a receipt not by itself guarantee one external email?
- How would you recover if a published queue job vanished before consumption?

Write answers in your own learning journal. Include one counterexample to the naive approach, a test that catches it, and a condition under which a different design would be better.

## Transfer exercise

Recreate the jobs Redis container with empty data while retaining PostgreSQL; recover published-but-unconsumed effects through reconciliation.

## Reference

[BullMQ idempotent jobs](https://docs.bullmq.io/patterns/idempotent-jobs). Project-specific choices are explained in [architecture](../../../ARCHITECTURE.md); framework documentation does not establish that our future implementation passes its tests.
