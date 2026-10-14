# Challenge: Boundaries, TypeScript, and a reproducible workspace

Prerequisites: Basic JavaScript/Node and reading TypeScript types. You do not need to relearn React before starting.

Related tasks: T001–T008. Use a scratch branch or the relevant implementation task; do not modify an unrelated completed feature. This exercise is not completed by reading its answer.

## Problem

Build a health endpoint and a page showing its result. Configuration must reject an invalid port and missing database URL. The readiness response must change when PostgreSQL stops, without exposing connection credentials.

## Required observable results

Valid environment: live=200 and ready=200. Stopped DB: live=200 and ready=503. Missing required config: process refuses to start. Client bundle contains no DATABASE_URL value.

## Constraints

Respect [architecture](../../../ARCHITECTURE.md) and the task's store/actor scope. Use real PostgreSQL for concurrency/constraint claims and actual browser interaction for UI claims. Do not mock the exact boundary you are trying to prove.

## Your deliverable

1. State the invariant in one sentence.
2. Write a failing test and record why it fails.
3. Implement the behavior and show actual result/evidence.
4. Explain a naive alternative and a concrete failure case.
5. Complete the variation below without copying the solution.

## Variation

Add an optional telemetry endpoint setting without making the earliest shell require a telemetry service.

## Self-check before opening the answer

Can you predict the behavior for a duplicate, missing, unauthorized, or delayed input where applicable? Are your assertions about persisted/public outcomes rather than only helper calls?

[Hints](../hints/01-foundations.md) · [Solution reasoning](../solutions/01-foundations.md) · [Guided lesson](../lessons/01-foundations.md)
