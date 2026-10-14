# Cross-cutting implementation conventions

## Types and money

Use strict TypeScript, explicit DTO schemas at HTTP/event boundaries, and domain types inside modules. Use bigint for cent arithmetic; JSON uses decimal strings. Avoid floating-point price calculations and unsafe number casts.

```typescript
type ReserveResult =
  | { ok: true; reservationId: string }
  | { ok: false; code: 'INSUFFICIENT_STOCK'; variantId: string };

interface InventoryPort {
  reserve(tx: UnitOfWorkContext, input: ReserveInput): Promise<ReserveResult>;
}
```

This is a contract sketch; referenced types are defined in their implementation task. Expected business rejection may use a typed result. Unexpected infrastructure errors propagate to the global mapper with redacted logs. Do not mix arbitrary string errors with stable API codes.

## Naming and ownership

Module IDs are stable kebab-case. Files describe responsibility (reservation.service.ts), not vague helper numbers. Database snake_case; TypeScript camelCase; immutable public event types use a schema version. Public API clients consume contracts, not backend ORM models.

A module writes its own tables through exported application ports. A coordinator passes one transaction context to participating ports; lower modules must not commit independently. Read projections may intentionally join across documented tables; do not confuse a read model with permission to mutate another module's state.

## Validation and transactions

Bound lengths, quantities, upload size/dimensions, query duration, page size and retry count. SQL uses parameters. Order and reservation locks follow one documented order across confirm/cancel/expiry/refund paths. Never call remote services while holding a database transaction open.

## Errors and logs

Use stable codes such as INSUFFICIENT_STOCK, PRICE_CHANGED, STALE_VERSION, IDEMPOTENCY_CONFLICT and REQUEST_IN_PROGRESS. Redact credentials, session proofs, full addresses and webhook secret material. Logs include request/event/operation IDs where needed; metrics use bounded labels, never per-order/user IDs.

## Security and cache

Every route is explicitly public, actor-authorized, scoped-store-authorized or webhook-verified. No authorization from hidden UI controls. Personalized responses are uncached; public caches are keyed by channel and publication context. CSRF/Origin validation applies to browser cookie mutations.

## Migrations and comments

Review generated SQL and record why each index exists. Apply additive schema first, backfill, switch readers, then later retire old columns. Comments explain a non-obvious invariant or tradeoff; they should not merely narrate obvious assignments.

## Documentation

Change the canonical spec/ADR first when assumptions change; task files link to it instead of repeating all decisions. Keep actual evidence beside its run, with commit and environment. Never replace an old failed result with invented success.
