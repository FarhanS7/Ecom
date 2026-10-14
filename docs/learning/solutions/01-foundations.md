# Solution reasoning: Boundaries, TypeScript, and a reproducible workspace

This is an expected approach, not a claim that the code is implemented, tested, or reviewed. Attempt [the challenge](../challenges/01-foundations.md) before reading.

## Reasoning

Use a schema/parser that produces a validated config object, inject only server config into API providers, and expose two health behaviors. The web page receives a safe health DTO. The invalid-config test executes the parse/bootstrap boundary; the outage test uses a real stopped/unreachable database with a bounded timeout. Splitting liveness/readiness lets an operator distinguish a living process from one unable to serve requests. A single route that always returns OK would hide the failure. A route that dumps environment variables would expose secrets.

## Expected evidence

Valid environment: live=200 and ready=200. Stopped DB: live=200 and ready=503. Missing required config: process refuses to start. Client bundle contains no DATABASE_URL value.

Record the actual outcome, command, environment and commit during implementation. A matching explanation without a verified behavior is not sufficient.

## Why a naive solution fails

Putting all business logic in route handlers; trusting TypeScript for runtime validation; installing every nested package.json under skills; creating shared/util.ts as an unrestricted dependency bucket.

Use a concrete input from the lesson to explain the failure. Do not memorize a pattern name without being able to show what it prevents.

## Alternative and tradeoff exercise

Propose one other valid design, identify its added cost, and state the workload or product requirement that would make it preferable. Compare against the related ADR instead of assuming the chosen approach is universally best.

## Review your understanding

- What does TypeScript fail to protect at an HTTP boundary?
- How would you replace persistence without changing an HTTP DTO?
- Why should liveness stay healthy while readiness fails during DB outage?

Then attempt: Add an optional telemetry endpoint setting without making the earliest shell require a telemetry service.

After implementation, add a task-specific walkthrough in your journal pointing to actual code lines and explaining review fixes. This reference solution cannot predict line numbers or fixes that do not exist yet.
