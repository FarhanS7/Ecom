# Solution reasoning: Server/client boundaries, accessible UI, and real flows

This is an expected approach, not a claim that the code is implemented, tested, or reviewed. Attempt [the challenge](../challenges/10-frontend.md) before reading.

## Reasoning

Render initial channel/context data on the server, pass a safe DTO into small client interaction components, and call the same-origin gateway for mutations. A reducer/state machine tracks pending, conflict, failure and confirmed states explicitly. URL parameters preserve listing state. Accessible controls use labels, focus management and announced errors; drawer closure restores focus to its trigger. On 409 stale cart, reload current data and show a clear reconciliation step rather than silently overwriting. Browser tests exercise real API scope enforcement and check that personalized content is never shared-cached.

## Expected evidence

Store cart never shows marketplace-only lines; errors are announced; focus remains usable; 202 is pending; subsequent paid response changes state; repeated submit uses the same intended operation key.

Record the actual outcome, command, environment and commit during implementation. A matching explanation without a verified behavior is not sufficient.

## Why a naive solution fails

Marking the whole application use client; putting secrets in public environment variables; cached personalized pages; hover-only controls; theme inputs becoming arbitrary CSS; pixel matching a mockup while buttons remain disconnected.

Use a concrete input from the lesson to explain the failure. Do not memorize a pattern name without being able to show what it prevents.

## Alternative and tradeoff exercise

Propose one other valid design, identify its added cost, and state the workload or product requirement that would make it preferable. Compare against the related ADR instead of assuming the chosen approach is universally best.

## Review your understanding

- Which state belongs in the URL rather than a global store?
- Why is a route guard insufficient to protect a seller mutation?
- How should focus move when a cart drawer closes after an error?

Then attempt: Switch between two store themes with long product titles and reduced motion enabled; preserve layout and contrast.

After implementation, add a task-specific walkthrough in your journal pointing to actual code lines and explaining review fixes. This reference solution cannot predict line numbers or fixes that do not exist yet.
