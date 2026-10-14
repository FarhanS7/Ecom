# Event and worker contracts

## Envelope

Each immutable outbox row carries eventId, eventType, schemaVersion, aggregateId, aggregateVersion, occurredAt, correlationId, causationId, storeId when scoped, and a validated payload. Consumers reject unknown schema versions into a visible failure queue, not a silent discard.

| Event | Producer | Consumers | Minimal payload |
| --- | --- | --- | --- |
| StoreApproved / StoreSuspended | stores | search, notification, cache | storeId, version |
| ProductChanged / PublicationChanged | catalog | search, cache | productId, storeId, version |
| InventoryChanged | inventory | search, low-stock alert | variantId, version; consumers read safe current product projection |
| CheckoutReserved | commerce | payment-dispatch worker | orderId, paymentEffectKey, amountCents, currency |
| PaymentObserved | payments | commerce handler | attemptId, providerEventId, status, amountCents, currency |
| OrderPaid | commerce | notifications, invoice, reporting | orderId, sellerOrderIds |
| SuborderTransitioned | commerce | notifications, reporting | sellerOrderId, from, to, version |
| RefundCompleted | payments/commerce reconciliation | reporting, notification, ledger projection | refundId, orderId, amountCents |
| ReviewChanged | reviews | rating projection, search | productId, reviewId, version |

Avoid embedding addresses, credentials, raw tokens, or full customer records. Invoice worker fetches authorized order snapshots through a narrow application port.

## Relay and delivery

Claim eligible outbox rows with a bounded lease and FOR UPDATE SKIP LOCKED; release transaction before broker calls. Publish with stable job ID derived from eventId plus consumer. Mark published only after enqueue acknowledgment. A crash between publish and mark causes duplicates, which is expected.

BullMQ uses a dedicated Redis jobs instance with noeviction and persistence, separate from evictable cache data. Redis durability is not sufficient for correctness: outbox/receipt reconciliation can re-enqueue published-but-unconsumed required events after recovery. Job retention and receipt retention must not delete the only recovery evidence.

## Consumer rules

For a DB-only consumer, insert consumer_receipts(consumer,eventId), perform mutation, and write follow-up outbox rows within one transaction. A uniqueness conflict means already processed. If the handler fails, roll back the receipt as well as the mutation.

For external effects, do not mark a receipt complete before effect acknowledgment. Use stable effect keys with provider dedupe; reconcile ambiguous timeouts. Mock email/SMS delivery has a unique local effect key. Real providers require their own capabilities review.

Projection consumers compare aggregateVersion. A delayed version 4 cannot overwrite applied version 5. Search consumers may reload current canonical data and atomically advance version. Track deletion/tombstone versions so delayed events cannot resurrect hidden products.

## Retry policy

Proposed: exponential backoff with jitter, capped at 60 seconds, five automatic attempts, then failed-job visibility and controlled replay. Validate permanent input failures immediately. Preserve event ID during replay. Trigger an alert for oldest outstanding event >30 seconds and nonempty failed queue.

## Verification

Kill relay after enqueue and before mark; kill consumer after write but before acknowledgment; reset jobs Redis while retaining PostgreSQL; deliver v3 before v2. Required results: no lost order effect, no double stock mutation, no projection rollback, and visible recovery status.

[Official BullMQ idempotent-job guidance](https://docs.bullmq.io/patterns/idempotent-jobs) supports designing repeat-safe handlers; the transactional receipt and reconciliation protocol above is this project's proposal.
