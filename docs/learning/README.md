# Learning path

You already know JavaScript/React/Next.js/Node/Nest/Express and SQL/NoSQL. This path focuses on engineering depth and connects backend correctness with usable frontend behavior. It has no fixed schedule.

## Two ways through every topic

- **Guided:** lesson → implementation task → challenge → solution comparison.
- **Challenge first:** challenge → your attempt → optional hints → lesson/solution → revised attempt.

Do not read all solutions before trying the exercises. Do not wait to finish every lesson before building; follow the task prerequisites and learn a topic when you need it.

| Topic | Lesson | Challenge | Hints | Solution |
| --- | --- | --- | --- | --- |
| Boundaries, TypeScript, and a reproducible workspace | [Read](lessons/01-foundations.md) | [Attempt](challenges/01-foundations.md) | [Hints](hints/01-foundations.md) | [Compare](solutions/01-foundations.md) |
| Sessions, token rotation, and browser security | [Read](lessons/02-identity.md) | [Attempt](challenges/02-identity.md) | [Hints](hints/02-identity.md) | [Compare](solutions/02-identity.md) |
| Store isolation, ownership, and channel context | [Read](lessons/03-tenancy.md) | [Attempt](challenges/03-tenancy.md) | [Hints](hints/03-tenancy.md) | [Compare](solutions/03-tenancy.md) |
| Relational modeling, snapshots, and stable pagination | [Read](lessons/04-catalog.md) | [Attempt](challenges/04-catalog.md) | [Hints](hints/04-catalog.md) | [Compare](solutions/04-catalog.md) |
| Search projections, facets, and eventual consistency | [Read](lessons/05-search.md) | [Attempt](challenges/05-search.md) | [Hints](hints/05-search.md) | [Compare](solutions/05-search.md) |
| Durable carts, caching, and merge semantics | [Read](lessons/06-carts.md) | [Attempt](challenges/06-carts.md) | [Hints](hints/06-carts.md) | [Compare](solutions/06-carts.md) |
| Concurrency, reservations, and stock ledgers | [Read](lessons/07-inventory.md) | [Attempt](challenges/07-inventory.md) | [Hints](hints/07-inventory.md) | [Compare](solutions/07-inventory.md) |
| Idempotency, totals, and multi-seller checkout | [Read](lessons/08-checkout.md) | [Attempt](challenges/08-checkout.md) | [Hints](hints/08-checkout.md) | [Compare](solutions/08-checkout.md) |
| Uncertain outcomes, webhooks, refunds, and ledgers | [Read](lessons/09-payments.md) | [Attempt](challenges/09-payments.md) | [Hints](hints/09-payments.md) | [Compare](solutions/09-payments.md) |
| Server/client boundaries, accessible UI, and real flows | [Read](lessons/10-frontend.md) | [Attempt](challenges/10-frontend.md) | [Hints](hints/10-frontend.md) | [Compare](solutions/10-frontend.md) |
| Outbox delivery, repeat-safe workers, and tracing | [Read](lessons/11-reliability.md) | [Attempt](challenges/11-reliability.md) | [Hints](hints/11-reliability.md) | [Compare](solutions/11-reliability.md) |
| Measurement, release evidence, and operational learning | [Read](lessons/12-operations.md) | [Attempt](challenges/12-operations.md) | [Hints](hints/12-operations.md) | [Compare](solutions/12-operations.md) |

## Per-session loop

Choose one small task. Write your prediction before running it. Implement and observe the outcome. Explain the difference between expected and actual behavior. Save a short [journal entry](journal-template.md); commit the tested change and follow independent review before task completion.

## Mastery rubric

| Level | Evidence |
| --- | --- |
| Recognize | Can describe the concept in plain language |
| Explain | Can walk through the example and identify the invariant |
| Apply | Implements behavior with meaningful tests |
| Transfer | Solves a changed input/problem without copying |
| Defend | Explains a tradeoff and when an alternative would win |

Aim for Apply on every topic and Transfer on stock, checkout, permissions, events, and frontend state. A weak answer means revisit a small example, not restart the whole project.

[Glossary](glossary.md) · [Journal template](journal-template.md) · [Implementation roadmap](../../tasks/plan.md)
