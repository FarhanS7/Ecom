# Draft operational runbooks

These are procedures to implement and rehearse in T087, not completed incident exercises. Use only isolated demo/test environments for fault injection.

## Slow checkout

Detect: checkout p95/error alert. Inspect request traces, DB pool waits, stock row lock wait, coupon locks, outbox lag and provider response time. Compare durable checkout acceptance latency with payment-completion latency.

Act: identify the saturated dependency; lower worker concurrency or pause noncritical reports when evidence supports it. Preserve idempotency keys. Do not disable stock checks or increase every pool limit.

Verify: recovery below target, no missing/duplicate orders, queue drains. Escalate if database locks or uncertain payment attempts accumulate.

## Stock mismatch

Detect: available<0, reserved>on_hand, or ledger reconciliation difference. Pause new checkout for affected variants through audited control, retaining existing order evidence.

Inspect active reservations, expiry timestamps, paid order lines and movement operation keys in one consistent snapshot. Identify missing/double transitions.

Act: fix the transition/reconciliation bug and apply an audited correction transaction only after explaining the discrepancy. Never overwrite counters from an arbitrary cached value.

Verify: ledger sums, reservations, provider/order outcomes reconcile; replay test reproduces then prevents incident.

## Queue backlog or failed jobs

Detect: oldest outbox/job age >30 seconds or failed-job alert. Inspect dependency availability, retry count, lease age, poison event/schema version and worker heartbeats.

Act: restore failed dependency; replay selected original event IDs only after fixing the permanent cause. Use outbox/receipt reconciliation after Redis loss. Do not clear all queues or regenerate IDs.

Verify: required effects finish once, lag falls, dedupe receipts and financial records agree.

## Uncertain payment or late success

Detect: pending attempt beyond reconciliation window, mismatched callback, or captured-after-expiry state.

Inspect stable provider effect key and provider lookup. If paid with active reservation, finalize through normal handler. If stock released, request idempotent refund/void and keep compensation visible.

Verify: one net intended effect, consistent order state and balanced ledger. Human attention is required for unresolved provider outcomes; do not blindly charge again.

## Restore and rollback

Restore backups into a new database/object namespace; verify checksums/counts, orders/stock/ledger, invoice access and one purchase. Record elapsed recovery and newest recoverable record. Do not claim RPO/RTO without measurement.

App rollback is allowed only while schema remains backward compatible. Otherwise stop rollout and follow a reviewed forward-fix plan. Destructive migration rollback is not assumed safe. Keep old artifacts until verification succeeds.
