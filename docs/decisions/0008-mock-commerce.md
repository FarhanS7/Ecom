# ADR-0008: Deterministic mock commerce before real integrations

## Status

Confirmed demo-first goal; proposed adapter design. Recorded 2026-09-29. Review during T001; preserve history if replaced.

## Context

The user selected demo first and a production roadmap. Learning failure modes should not require real money or accounts.

## Decision

Use a signed, persistent mock provider with controllable success, decline, timeout, duplicate, and late webhook outcomes; simulate shipping and payouts. Single USD currency and explicit demo shipping/tax treatment.

## Alternatives considered

Provider test mode can be added as an adapter exercise later; live payments introduce unresolved country, liability, and compliance decisions.

## Consequences

The simulator must live outside the order transaction and preserve provider effects across worker crashes. Demo invoices/payouts are not compliance evidence.

## Validation

Repeat effects and reconcile timeouts; assert exactly one provider charge and balanced ledger entries.

Related: [Architecture](../../ARCHITECTURE.md), [confirmed user decisions](../planning/confirmed-decisions.md), [source references](../planning/resources.md).
