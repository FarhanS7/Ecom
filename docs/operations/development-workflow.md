# Implementation, review, and learning workflow

Derived from [the source framework](../../PRD_TO_TASKS_FRAMEWORK.md), with explicit [reconciliation notes](../planning/requirements-reconciliation.md). This plan does not initialize Git, create commits, install tools, or send review requests.

## Repository workflow

T002 initializes main/dev and records branch protection expectations. Feature branches follow feature/{module}/{task-id}-{slug}. Start from the intended clean base and inspect existing changes before modifying anything. Do not reset or discard unrelated work.

Use conventional commit types with a domain scope. Commit each independently verified subtask; avoid splitting a single invariant across intentionally broken commits. A red test is part of local TDD, not an excuse to merge a broken branch.

A task PR targets dev; release promotion targets main after release gates. Keep migrations sequential. Preserve original references and exclude skills/ from application tooling. Before any reorganization, record resource provenance and maintain links.

## Task execution

1. Read one task, its spec/ADR and provider contracts.
2. Attempt the challenge or work through the lesson.
3. Write a failing test for the observable behavior; prove it fails for the expected reason.
4. Implement only the behavior; run focused tests and relevant build/typecheck.
5. Inspect runtime flow, record evidence, and commit the verified subtask.
6. Prepare a scoped review context with changed files, behavior, assumptions, risk areas and exact verification results.

## Independent review

The source framework requires a different model in a fresh session and names Opus 4.6. Preserve that preference in the implementation workflow; this planning session does not claim such a review happened. If unavailable, record that fact and obtain an explicit amendment or an available appropriate reviewer before marking the review gate complete.

Review reports include reproducible trigger, expected vs actual behavior, file/line, severity, and a suggested correction. Verify each finding; reject false positives with evidence. Resolve critical/high findings before merge/release. Three cycles is a time-to-escalate signal, not a permission to ship unresolved critical issues.

Use docs/reviews/{task-id}-context.md and {task-id}-report.md so later reviews do not overwrite earlier ones.

## Post-review walkthrough

Explain the implemented code block by block only where reasoning matters. Connect it to the invariant and DB/API contract; compare at least one alternative; explain review fixes and what failure each prevents. Answer two to four transfer questions without copying. If an answer is weak, revisit that lesson and try another input.

A reviewed implementation can still contain defects. Continue testing and monitoring; never label review as proof of correctness.

## Planning-framework mapping

| Source phase | This plan |
| --- | --- |
| -1 sanity | scope + reconciliation + traceability |
| 0 foundation | architecture + module/data/API/event docs + ADRs |
| 0.5 Git | T002 and this workflow |
| 1 task tree | individual tasks, phases, dependency links |
| 1.5 integration | T003–T008, extended throughout |
| 2 code loop | per-task execution above |
| 2.5 independent review | task/milestone review artifacts |
| 3 learning | lessons/challenges/hints/solutions and explanation checkpoint |
| 4 release | T085–T090 |
| 5 operations | runbooks, evidence, production roadmap |
