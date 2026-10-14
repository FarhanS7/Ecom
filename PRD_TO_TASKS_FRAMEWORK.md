# PRD → Tasks Framework
> A phased system for turning a PRD into senior-level implementation plans — and then into actual understanding, not just shipped code.

---

## How to Use This File (Read First)

This file is your **operating manual** for every project. Every section is written as a direct command to you (the IDE + AI). When you start a new phase, paste the relevant command block into your AI session. The commands are written to be unambiguous — the AI should never have to guess what to do next.

**The golden rules this file enforces:**
- Every architectural decision is made **once** and referenced everywhere else
- Every task produces a **git commit**. No commit = task not done
- Code is always reviewed by a **different model in a new session** before it's considered finished
- The model that writes the code **never reviews its own code in the same session**

---

## The Full Pipeline at a Glance

```
Phase -1  →  PRD Sanity Check          (catch gaps before they get built in)
Phase 0   →  Project Foundation        (architecture, DB, conventions — decided once)
Phase 0.5 →  Git Repository Setup      (branches, commit convention — set once)
Phase 1   →  Modules → Tasks           (break PRD into a buildable tree with dependencies)
Phase 1.5 →  Integration & Environment (docker, CI, integration tests)
Phase 2   →  AI Code Loop              (implement, per task, with git commits per subtask)
Phase 2.5 →  AI Adversarial Review     (different model, new session, finds bugs)
Phase 3   →  Walkthrough & Learning    (understand the reviewed, clean code)
Phase 4   →  Deployment & Release      (production, migrations, rollback)
Phase 5   →  Post-Launch Operations    (monitoring, docs, changelog)
```

---

## Phase -1 — PRD Sanity Check

> **Run this phase exactly once, before any architecture decision. Never skip it.**

### Command — Paste this to start Phase -1:
```
You are doing a PRD Sanity Check before any architecture work begins.
Read the PRD I provide and do the following three things:

1. AMBIGUITY & GAP SCAN
   - List every underspecified behavior (features named but edge cases missing)
   - List every contradiction (two sections implying incompatible things)
   - List every missing non-functional requirement (scale, latency, user count)
   - Format each as a question, not a guess. Do not silently assume answers.

2. SCOPE LINE (v1 vs later)
   - Define exactly what is IN scope for v1 (minimum usable end-to-end product)
   - Define what is EXPLICITLY DEFERRED (named, not just omitted)
   - One sentence explaining why this line was drawn (time / team size / unproven demand)

3. RISKIEST ASSUMPTION
   - Name the single assumption most likely to be wrong and most expensive if it is
   - Usually: user behavior, a third-party API's real capabilities, or expected data volume
   - State what in Phase 0 would need to change if this assumption breaks

Output format: numbered list of open questions, a scope table, and one named risk.
Do not proceed to architecture until these are answered or explicitly deferred.
```

**Output of Phase -1:** Open questions list + scope table + one named risk. Every Phase 0 decision must be consistent with what was decided here.

---

## Phase 0 — Project Foundation

> **Run once. The output becomes `ARCHITECTURE.md`. Every later task references this file — never re-derives from it.**

### Command — Paste this to start Phase 0:
```
You are producing the project foundation document for this codebase.
This will be saved as ARCHITECTURE.md and referenced by every task going forward.
Base all decisions on the PRD and the Phase -1 output I provide.

Produce the following sections:

1. ARCHITECTURE STYLE
   - Chosen style: monolith / modular monolith / microservices / serverless
   - Why this style fits this project's actual scale (team size, traffic, deployment cadence)
   - 1-2 alternatives considered and the specific reason each loses for THIS project
   - Module boundaries: list each top-level domain with its single responsibility

2. SYSTEM DESIGN
   - Request flow: client → (gateway?) → service → DB, including where auth/cache/rate limiting sit
   - Sync vs async boundaries: which operations must return immediately vs. belong in a queue (and why)
   - Caching strategy: what is cached, where, and invalidation method (or state explicitly: no caching yet)
   - First likely bottleneck and the scaling lever for it later

3. DATABASE DESIGN
   - Engine choice and why (relational vs. document vs. hybrid — based on actual data shape)
   - Full schema: every table/collection with PKs, FKs, relationship types, indexes and why each index exists
   - Migration strategy: tool name + rule for breaking schema changes in production (additive-first always)

4. CROSS-CUTTING CONVENTIONS (apply everywhere, decided once)
   - Error handling: typed errors with code field, global exception filter pattern
   - Auth/authorization: JWT + guards / RBAC / ownership checks — which and how
   - Logging baseline: structured logs, request IDs, what logs at error vs warn vs info
   - Environment/config: .env validation at boot, no secrets in code
   - API versioning: convention for public endpoints if applicable

Save this output as ARCHITECTURE.md in the project root.
Every Phase 1 task references this file. Never re-derive these decisions inside a task.
```

**Output of Phase 0:** `ARCHITECTURE.md` in the project root.

---

## Phase 0.5 — Git Repository Setup

> **Run once per project. Universal setup that works whether solo or team, any project type.**

### Command — Paste this to start Phase 0.5:
```
Set up the Git repository and branch structure for this project.
Follow these exact rules:

BRANCH STRUCTURE:
- main        → production only. Direct commits are never allowed here.
- dev         → integration branch. All feature branches merge here first.
- feature/[module-name]/[task-name] → one branch per task (e.g. feature/auth/jwt-issuance)
- hotfix/[description]              → emergency fixes branched from main, merged to both main and dev

SETUP COMMANDS TO RUN:
```
git init
git checkout -b main
git checkout -b dev
```

COMMIT MESSAGE CONVENTION (enforce this on every commit):
Format: type(scope): short description

Types:
- feat     → new feature or subtask implementation
- fix      → bug fix (including fixes from AI review)
- test     → adding or updating tests
- refactor → code change with no behavior change
- docs     → documentation only
- chore    → setup, config, tooling

Examples:
- feat(auth): add JWT issuance function
- test(auth): add edge case for expired token
- fix(auth): handle null user on token refresh
- docs(auth): add REVIEW_CONTEXT.md for JWT feature

WHEN TO COMMIT (non-negotiable):
- After every subtask in Phase 2 Step 5 → one commit per subtask
- After every fix from Phase 2.5 AI review → one commit per fix
- Never bundle multiple subtasks into one commit
- Never commit broken or untested code

BRANCH LIFECYCLE:
1. Before starting a task: git checkout dev && git checkout -b feature/[module]/[task]
2. After task passes Phase 2.5 review and Phase 3 walkthrough: open PR from feature branch → dev
3. PR title matches the task name from Phase 1
4. Merge to dev. Delete the feature branch.
5. dev → main only at Phase 4 deployment.
```

**Output of Phase 0.5:** initialized repo with `main` and `dev` branches, commit convention documented in `CONTRIBUTING.md`.

---

## Phase 1 — Break the PRD into Modules → Tasks

> **Run once after Phase 0. Produces the full build plan. Every task gets a branch and a dependency tag.**

### Command — Paste this to start Phase 1:
```
You are breaking the PRD into a buildable module and task tree.
Use the ARCHITECTURE.md from Phase 0 as the module boundary reference.

Produce the following:

1. TASK TREE
   Format as a hierarchy:
   Project
   ├── Module A (domain name from ARCHITECTURE.md)
   │   ├── Task A.1 — [name]
   │   ├── Task A.2 — [name]
   │   └── Task A.3 — [name]
   ├── Module B
   │   └── ...

   Rules for splitting:
   - A module = a domain boundary from ARCHITECTURE.md Phase 0 (0.1)
   - A task = small enough to fit one AI Code Loop prompt (one function, one endpoint, one focused class)
   - If a task needs more than 3 subtasks to describe, it is actually a module — split it further

2. DEPENDENCY & SEQUENCING TABLE
   For every task, list what blocks it:
   Task A.2 | blocked by: A.1 (needs user records to exist)
   Task C.4 | blocked by: C.1, C.2 (needs submissions + scoring to exist)

   Then identify:
   - The critical path (longest chain of dependencies)
   - What is parallelizable (tasks with no shared dependency)
   - What to build first (whatever Phase -1's riskiest assumption depends on)

3. GIT BRANCH NAME for each task:
   feature/[module-name]/[task-name-in-kebab-case]
   Example: feature/auth/jwt-issuance

4. PER-TASK SCOPED CHECKLIST
   For each task, answer only the categories that apply — do not force all onto every task:

   | Category            | Include when...                                              | Skip when...                                  |
   |---------------------|--------------------------------------------------------------|-----------------------------------------------|
   | Architecture note   | Task introduces a new pattern not in Phase 0                 | Standard CRUD covered by Phase 0 patterns     |
   | System design note  | Non-trivial flow (multi-step, external API, idempotency)     | Simple read/write                             |
   | DSA                 | Real algorithmic weight (ranking, dedup at scale)            | Standard ORM query — skip, say so             |
   | Database note       | Touches schema not in Phase 0, or non-obvious index need     | Already fully specified in ARCHITECTURE.md    |
   | Best practices      | Always — short checklist only, conventions set in Phase 0    |                                               |
   | Real-life gotcha    | Genuine production risk (race condition, idempotency key)    | None — say so rather than inventing one       |
   | Code review points  | 1-3 specific things to watch for in review                   |                                               |
   | QA testing          | Always — scenario list feeds directly into Phase 2 tests     |                                               |

   If a category is skipped, write one line saying so. Never silently omit.
```

**Output of Phase 1:** full task tree + dependency table + git branch names + scoped checklist per task.

---

## Phase 1.5 — Integration & Environment

> **Set up once after the first 1-2 modules. Extend as new modules land. Never skip.**

### Command — Paste this to start Phase 1.5:
```
Set up the integration and local development environment for this project.
Produce the following:

1. LOCAL DEVELOPMENT (one-command startup)
   - docker-compose.yml that starts the app + all dependencies (Postgres, Redis, etc.)
   - Seed script that populates enough realistic data to exercise the features being built
   - .env.example listing every required variable with a one-line description
   - App must fail loudly at boot if a required env variable is missing

2. CONTINUOUS INTEGRATION
   What runs on every push to any branch:
   - Lint
   - Typecheck
   - Unit tests
   Failure blocks merge. This catches Phase 0 convention violations in generated code
   mechanically instead of relying on manual checks.

3. INTEGRATION TESTS (cross-module)
   Write tests that:
   - Exercise real flows across 2+ modules without mocking the modules from each other
   - Run against a real (test) database — not mocks — to catch schema/query mismatches
   - Run on PR merge, not every commit (slower, run less frequently)
   Example: signup → login → first authenticated request as one unbroken flow

GIT: commit the environment setup on dev branch
   git add docker-compose.yml .env.example
   git commit -m "chore(env): add docker-compose and env contract"
   git add [ci config file]
   git commit -m "chore(ci): add lint, typecheck, unit test pipeline"
```

**Output of Phase 1.5:** working `docker-compose.yml`, green CI pipeline, integration test suite committed to `dev`.

---

## Phase 2 — AI Code Loop (per task)

> **One task = one feature branch. One subtask = one commit. Run this loop for every task in Phase 1's tree.**

### Before Starting Any Task — Run These Git Commands First:
```bash
# Always start from a clean dev
git checkout dev
git pull origin dev

# Create the task branch (name comes from Phase 1)
git checkout -b feature/[module]/[task-name]
```

---

### The Implementation Prompt — Paste this (filled in) to implement a task:
```
## Goal
[One sentence: what function/module/endpoint, what input, what output, what key constraint]

## Context (from ARCHITECTURE.md — paste only the relevant lines)
- Architecture: [relevant pattern, e.g. "this runs as a BullMQ worker, not a request handler"]
- DB: [relevant table/columns this task touches]
- Real-life gotcha: [if flagged in Phase 1, e.g. "must be idempotent — webhook may retry"]

## Rules
1. [Data integrity constraint]
2. [Security constraint]
3. [Error handling — typed errors, specific code field]
4. [Edge case rule]
5. [Style/consistency rule — reference ARCHITECTURE.md convention, do not re-state it]

## Types / Interfaces
[Paste explicit input/output types. Do not let the AI invent shapes.]

interface Input { }
interface Output { }
function taskName(input: Input): Promise<Output>

## Examples
Example 1 — happy path:
  Input:  [exact values]
  Output: [exact values]
  Notes:  [why this output]

Example 2 — edge case:
  Input:  [exact values]
  Output: [exact values]
  Notes:  [why this output]

## Subtasks
Implement as separate, independently testable functions:
1. validateX(...) — throws typed error on bad input
2. computeY(...) — pure calculation, no side effects
3. assembleZ(...) — builds final output shape
Then compose in [mainFunctionName]().

After completing EACH subtask, stop and tell me so I can commit it before continuing.

## Tests
Write unit tests covering:
1. Happy path
2. [Edge case from Phase 1 QA notes]
3. [Error case — specific error code expected]
4. [Real-life gotcha if flagged]
Use [Jest/Vitest/pytest]. Mock all external dependencies.

## Edge Cases to Explicitly Handle
- [list from Phase 1 scoped checklist]
```

---

### After Each Subtask — Commit Immediately:
```bash
# After subtask 1 passes its test:
git add [changed files]
git commit -m "feat([module]): [subtask description]"

# After subtask 2:
git add [changed files]
git commit -m "feat([module]): [subtask description]"

# After tests are written and passing:
git add [test files]
git commit -m "test([module]): add unit tests for [task name]"
```

---

### Iteration Loop Checklist (after the AI responds):
```
[ ] Output matches all examples exactly
[ ] Every rule is respected in the code
[ ] All subtasks present as named functions
[ ] All tests pass
[ ] Errors are typed with code field — not raw throw new Error("string")
[ ] Edge cases handled (empty input, null, zero, boundary values)
[ ] Code is consistent with ARCHITECTURE.md conventions (naming, error format, auth pattern)
```

**If a box is unchecked — targeted correction, never a full re-prompt:**
```
The [function] does not handle [specific case].
Given input [X], expected [Y], got [Z].
Fix only this behavior without changing anything else.
```

After each fix: `git commit -m "fix([module]): [what was fixed]"`

---

## Phase 2.5 — AI Adversarial Review

> **This runs after Phase 2's iteration loop is fully green. Before Phase 3. Always. No exceptions.**
> **The model that wrote the code never reviews it in the same session.**

### Step A — Generate the Review Context (same session as implementation):

Ask the implementing model (still in the Phase 2 session):
```
You just implemented [task name].
Write a REVIEW_CONTEXT.md file covering:

1. WHAT WAS BUILT
   - The feature in one paragraph, plain language, no jargon
   - Which files were created or modified (list with paths)

2. HOW IT WORKS
   - The internal flow: what calls what, in what order
   - Any non-obvious design decisions made during implementation
   - What each subtask function does and why it exists separately

3. KNOWN TRADEOFFS
   - Anything deferred or simplified for now
   - Any assumption made that wasn't in the original spec

4. WHAT TO FOCUS THE REVIEW ON
   - The areas most likely to have bugs or edge case gaps
   - Any part of the code you (the implementing model) are least confident about

Save this as REVIEW_CONTEXT.md in the task's directory or project root.
```

**Commit the context file:**
```bash
git add REVIEW_CONTEXT.md
git commit -m "docs([module]): add REVIEW_CONTEXT.md for [task name] review"
```

---

### Step B — Open a New Session. Switch to Opus 4.6.

In the new session, paste this command:
```
You are doing an adversarial code review. Your job is to find problems — not to be nice.
You are NOT the model that wrote this code. Approach it as a skeptical senior engineer.

Read REVIEW_CONTEXT.md first to understand what was built and why.
Then read every file listed in the "files modified" section of REVIEW_CONTEXT.md.

Produce a REVIEW_REPORT.md with the following sections:

1. BUGS (things that will break in production)
   - Exact file + line number
   - What the bug is
   - What input or condition triggers it
   - Severity: CRITICAL / HIGH / MEDIUM

2. EDGE CASES NOT HANDLED
   - Exact scenario that is unhandled
   - What the code currently does vs. what it should do

3. SECURITY ISSUES
   - Any input not validated, any data leaked, any auth gap
   - Severity: CRITICAL / HIGH / MEDIUM

4. LOGIC ERRORS
   - Places where the code does something subtly different from what was intended

5. PHASE 0 CONVENTION VIOLATIONS
   - Anything inconsistent with ARCHITECTURE.md (wrong error format, missing auth check, etc.)

6. WHAT LOOKS GOOD
   - 2-3 things done well — this keeps the report calibrated, not just negative

For each finding: state the exact problem, the exact location, and the suggested fix.
Do not flag style preferences as bugs. Only flag things that are wrong or risky.
```

---

### Step C — You Decide What to Fix:

After reading REVIEW_REPORT.md, sort the findings:

```
MUST FIX before merge:
[ ] CRITICAL bugs
[ ] HIGH severity security issues
[ ] Phase 0 convention violations

FIX if time allows:
[ ] MEDIUM severity items
[ ] Unhandled edge cases that are realistic

SKIP (document why):
[ ] Anything that looks like hallucination (problem described doesn't exist in the code)
[ ] LOW severity style opinions
[ ] Out-of-scope concerns (real issue, but belongs in a later task)
```

Your experience and knowledge of the feature decides what's real vs. hallucinated. The model can be wrong. You have the final call.

---

### Step D — Fix and Commit Each Item:
```bash
# One commit per fix — never bundle fixes together
git add [changed files]
git commit -m "fix([module]): [exact issue from review report]"
```

---

### Step E — Repeat the Review (2-3 total cycles):

After fixes are committed, go back to Step B. Open another new Opus 4.6 session.
Run the same review prompt. Stop when either:
- The new report has no CRITICAL or HIGH findings, or
- You have done 3 review cycles (whichever comes first)

**Final commit before Phase 3:**
```bash
git add REVIEW_REPORT.md
git commit -m "docs([module]): add final REVIEW_REPORT.md — [N] cycles, all criticals resolved"
```

---

## Phase 3 — Walkthrough & Learning

> **This runs after Phase 2.5 review is complete and all criticals are fixed.**
> **Purpose: your understanding. The code is already correct. Now make it yours.**
> **Run once per task, or once per module if tasks were small and tightly related.**

### Command — Paste this to start Phase 3:
```
Walk me through the code we just implemented and reviewed for [task name].
The code is clean and reviewed. This walkthrough is for my learning, not further debugging.

Do the following:

1. LINE-BY-LINE / BLOCK-BY-BLOCK WALKTHROUGH
   For each non-trivial block:
   - What this block does, in plain language before any jargon
   - Why it is written this way — what breaks or gets worse with the naive approach
   - What it connects to — which ARCHITECTURE.md convention, which DB table, which other task
   Skip self-evident lines (simple variable assignments need no explanation).
   Spend explanation on the non-obvious: guard clauses, query shapes, transformation reasons.

2. CONCEPT EXTRACTION
   - Name the pattern or technique used (e.g. "this is optimistic locking")
   - One sentence: when to reach for this pattern in a different project
   - One sentence: when NOT to use it
   - Point to the specific line of code that exists because of a rule in the Phase 2 prompt

3. ALTERNATIVES NOT TAKEN
   - At least one other valid implementation approach
   - Why the chosen approach wins for this codebase at this scale
   - Under what future condition would the alternative become the better choice

4. REFACTOR & REVIEW NOTES
   - Walk through what the AI review in Phase 2.5 found and what was fixed
   - Show before → after for each fix, with one sentence on what failure mode it prevents
   - Flag anything acceptable now that would need revisiting at scale

5. CHECK YOUR UNDERSTANDING
   End with 2-4 questions I should be able to answer without help:
   - "If [input] were [edge case], what would this code do and why?"
   - "Why does [specific line] use [technique] instead of [obvious alternative]?"
   - "Which ARCHITECTURE.md convention does this task depend on, and what breaks if it changes?"

If I cannot answer one confidently, that is the signal to re-explain that part — not to move on.
```

**Phase 3 is done when you can answer every Check Your Understanding question without looking at the code.**

---

### After Phase 3 — Merge to Dev:
```bash
# Make sure you're on the feature branch
git status

# Push the feature branch
git push origin feature/[module]/[task-name]

# Open a PR: feature/[module]/[task-name] → dev
# PR title: [Module] — [Task name] (matches Phase 1 task name exactly)
# PR description: paste the one-paragraph summary from REVIEW_CONTEXT.md

# After PR is merged, clean up
git checkout dev
git pull origin dev
git branch -d feature/[module]/[task-name]
```

---

## Phase 4 — Deployment & Release

> **Runs once Phase 1.5's CI is green and enough modules form a usable v1 (per Phase -1.2 scope line).**
> **Does not wait for every task to be done — the v1 scope line decides when to ship.**

### Command — Paste this to plan Phase 4:
```
Plan the deployment for this project. Cover the following:

1. DEPLOYMENT TARGET & PROCESS
   - Where it runs: pick a concrete platform and state why it fits this project's scale and budget
   - How code gets there: push-to-deploy from dev/main, or manual trigger after CI green
   - Why that level of automation is appropriate right now

2. ENVIRONMENT PROMOTION
   - Environments: local → staging/preview → production (minimum three)
   - Secrets per environment: different credentials per env, where they live (platform secret manager)
   - Config that differs by environment: log verbosity, rate limits, feature flags

3. DATABASE MIGRATIONS IN PRODUCTION
   - Reference ARCHITECTURE.md migration strategy (0.3)
   - State whether migrations run automatically on deploy or require a manual step
   - Additive-first rule: add column → backfill → only then remove old one

4. ROLLBACK PLAN
   - What "broken" looks like: a concrete trigger (error rate spike, failed health check)
   - How to roll back: previous deploy vs. hotfix forward — which is faster for this platform
   - What does NOT roll back cleanly: state this explicitly (destructive migrations, etc.)
```

**Deploy from `dev` → `main` only when:**
```bash
# CI is green on dev
# All Phase 2.5 reviews passed
# Rollback trigger is written down before deploying

git checkout main
git merge dev
git tag v1.0.0
git push origin main --tags
```

**Output of Phase 4:** app running in production, documented promotion path, rollback trigger written down before it's needed.

---

## Phase 5 — Post-Launch Operations

> **"Deployed" is not "done." This phase makes it observable, documented, and maintainable.**

### Command — Paste this to plan Phase 5:
```
Plan the post-launch operations for this project:

1. MONITORING & ALERTING
   - Reference ARCHITECTURE.md logging baseline (0.4) — that defined what gets logged
   - This phase defines what happens with those logs
   - Pick 2-3 metrics that actually matter for THIS product specifically
   - Define the minimum alert: be notified when something fails repeatedly, not from a user complaint

2. DOCUMENTATION (definition of done)
   A task is not done when tests pass — it is done when future-you could pick it up in 6 months.
   Required:
   - README: what the project is, how to run locally, how to deploy
   - API docs: OpenAPI spec or maintained Postman collection for any endpoint others will call
   - ADRs: the Phase 0 decisions are already built — confirm they are in ARCHITECTURE.md permanently

3. VERSIONING & CHANGELOG
   - Lightweight convention: semantic versioning or dated entries
   - Changelog answers "what changed since last week" without reading git log
   - If API is consumed externally: state the breaking change policy explicitly
```

**Output of Phase 5:** monitoring that surfaces real failures, docs that survive you forgetting, changelog that answers "what changed."

---

## Anti-Patterns to Avoid

| Anti-Pattern | Why It Fails | Fix |
|---|---|---|
| Full checklist on every task | Same architecture/DB explanation repeated; buries actual task content | Phase 0 once, scoped filter per task |
| Whole module as one task | Hard to review, test, debug | Split until each leaf fits one Phase 2 prompt |
| Forcing DSA onto simple CRUD | Produces filler ("this loop is O(n)") | Use the 1.2 filter — skip and say so |
| Examples without exact output | AI can't validate its own result | Always provide both input and exact output |
| Skipping types in typed languages | AI invents interfaces that won't match your codebase | Always include Step 4 |
| Accepting code without tests | Edge cases surface in production | Always run Step 6 from Phase 1 QA notes |
| Committing multiple subtasks together | Impossible to bisect bugs later | One subtask = one commit, no exceptions |
| Skipping Phase 2.5 review | First-draft AI code ships unchallenged | Always review with a different model, new session |
| Using the same model to review its own code | Model is biased toward its own choices; blind to its own gaps | New session, switch to Opus 4.6 |
| Taking every review finding as truth | Models hallucinate issues that don't exist | You decide what's real — your experience is the filter |
| Phase 3 before Phase 2.5 is done | Walking through code that still has known bugs | Fix criticals first, then learn the clean version |
| Committing broken or untested code | Breaks CI, blocks teammates (or future-you) | Tests must pass before any commit |
| Deploying without a rollback plan | Incident response improvised under pressure | Write the trigger and method in Phase 4 before deploying |
| "Deployed" = "done" | Failures discovered by users; decisions forgotten | Phase 5 monitoring + docs are part of done |

---

## Quick Reference Card

```
PHASE -1  → PRD sanity: gaps, scope line, riskiest assumption. ONCE. FIRST.
PHASE 0   → Architecture, system design, full DB schema, conventions → ARCHITECTURE.md. ONCE.
PHASE 0.5 → Git setup: main/dev/feature branches, commit convention → CONTRIBUTING.md. ONCE.
PHASE 1   → PRD → Modules → Tasks. Dependencies tagged. Branch names. Scoped checklist per task.
PHASE 1.5 → docker-compose, CI pipeline, cross-module integration tests. Early + ongoing.
PHASE 2   → AI Code Loop per task. One subtask = one commit. Iteration loop checklist.
PHASE 2.5 → REVIEW_CONTEXT.md (same session) → new session → Opus 4.6 → REVIEW_REPORT.md → fix criticals → repeat 2-3x.
PHASE 3   → Walkthrough: explain the reviewed, clean code. Learn it until you own it.
PHASE 4   → Deploy: target, environments, migrations, rollback trigger written before shipping.
PHASE 5   → Monitoring, docs, changelog. Deployed ≠ done.

GIT RULES →
  Branch:  feature/[module]/[task] per task
  Commit:  one per subtask, type(scope): description
  Merge:   feature → dev (after Phase 3). dev → main (Phase 4 only).

REVIEW RULES →
  Writer model never reviews in the same session.
  Review model: always Opus 4.6, always new session.
  Cycles: 2-3 per task. Stop when no CRITICAL or HIGH findings remain.
```

---

*One foundation. One branch per task. One review per feature. Decide once, build clean, ship with confidence.*
