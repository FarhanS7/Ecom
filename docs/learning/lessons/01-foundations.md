# Boundaries, TypeScript, and a reproducible workspace

Learning status: reference material for future implementation. Examples are reasoning sketches, not tested application code.

Related implementation: T001–T008. Prerequisites: Basic JavaScript/Node and reading TypeScript types. You do not need to relearn React before starting.

## Choose your route

Guided: read this lesson, implement the linked task, then attempt the [challenge](../challenges/01-foundations.md). Challenge-first: open that file now, use [hints](../hints/01-foundations.md) only if needed, then compare [solution reasoning](../solutions/01-foundations.md).

## Mental model

A module is a boundary around a responsibility, not merely a folder. A controller translates HTTP into a use case; a use case enforces business rules; a repository handles persistence. Exporting every provider makes the boundary meaningless. TypeScript checks shapes at compile time, while runtime validation still checks untrusted input.

## Worked example

Suppose configuration says PORT='banana'. A TypeScript type assertion cannot turn it into a valid port. Parse at startup and fail with a redacted configuration error. Similarly, a declared quantity:number does not prevent a client from posting -3 or a string.

```
type StockPort = {
  reserve(tx: Transaction, request: ReservationRequest): Promise<ReservationResult>;
};
// Transaction, ReservationRequest and ReservationResult are domain contracts.
// This is an interface sketch, not a standalone runnable implementation.
```

## Guided implementation

1. Draw browser → Next → Nest → database and name which layer validates, authorizes, and commits.
2. Create the smallest API route and web page with actual HTTP data. Keep business packages outside app bootstrap code.
3. Define runtime env parsing and one invalid-config test; ensure client bundles cannot import secret config.
4. Add one migration and run it against an empty DB plus an already-migrated DB.
5. Run only the changed suite, then workspace gates; prove reference projects are excluded.

Use [the task tracker](../../../tasks/todo.md) for the concrete implementation order. Do not implement a lesson's later-stage example before its task prerequisites are present.

## Common mistakes

Putting all business logic in route handlers; trusting TypeScript for runtime validation; installing every nested package.json under skills; creating shared/util.ts as an unrestricted dependency bucket.

## Explain it without looking

- What does TypeScript fail to protect at an HTTP boundary?
- How would you replace persistence without changing an HTTP DTO?
- Why should liveness stay healthy while readiness fails during DB outage?

Write answers in your own learning journal. Include one counterexample to the naive approach, a test that catches it, and a condition under which a different design would be better.

## Transfer exercise

Add an optional telemetry endpoint setting without making the earliest shell require a telemetry service.

## Reference

[Nest modules](https://docs.nestjs.com/modules). Project-specific choices are explained in [architecture](../../../ARCHITECTURE.md); framework documentation does not establish that our future implementation passes its tests.
