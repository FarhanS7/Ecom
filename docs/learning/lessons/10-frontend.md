# Server/client boundaries, accessible UI, and real flows

Learning status: reference material for future implementation. Examples are reasoning sketches, not tested application code.

Related implementation: T023–T027, T032, T043, T048, T057–T059, T064–T069, T075, T080. Prerequisites: React/Next.js familiarity and the project's API/channel contracts.

## Choose your route

Guided: read this lesson, implement the linked task, then attempt the [challenge](../challenges/10-frontend.md). Challenge-first: open that file now, use [hints](../hints/10-frontend.md) only if needed, then compare [solution reasoning](../solutions/10-frontend.md).

## Mental model

Server rendering supplies trustworthy initial content and keeps secrets off the client. Client components handle interaction; they do not become authorization boundaries. UI state is a product contract: loading, error, empty, conflict, pending payment, and partial fulfillment all need distinct meanings.

## Worked example

Clicking checkout returns 202. A green 'Payment complete' screen would be false; render 'Processing payment' and query the order state. Likewise, disabling a button prevents accidental clicks but cannot replace server idempotency.

```
type PaymentView =
  | { state: 'pending'; orderId: string }
  | { state: 'paid'; orderId: string }
  | { state: 'needs-attention'; orderId: string; message: string };
// Render explicit state, not a boolean named success.
```

## Guided implementation

1. Extract design tokens and reusable semantic components before duplicating page markup.
2. Keep public initial reads on the server; isolate search/cart/variant interactions in client components.
3. Store shareable search/filter state in the URL; cancel stale suggestion requests.
4. Implement keyboard focus, labels, error announcements and mobile/zoom layouts.
5. Run actual shopper and staff journeys with seeded API data; inspect errors, private caching and screenshots.

Use [the task tracker](../../../tasks/todo.md) for the concrete implementation order. Do not implement a lesson's later-stage example before its task prerequisites are present.

## Common mistakes

Marking the whole application use client; putting secrets in public environment variables; cached personalized pages; hover-only controls; theme inputs becoming arbitrary CSS; pixel matching a mockup while buttons remain disconnected.

## Explain it without looking

- Which state belongs in the URL rather than a global store?
- Why is a route guard insufficient to protect a seller mutation?
- How should focus move when a cart drawer closes after an error?

Write answers in your own learning journal. Include one counterexample to the naive approach, a test that catches it, and a condition under which a different design would be better.

## Transfer exercise

Switch between two store themes with long product titles and reduced motion enabled; preserve layout and contrast.

## Reference

[Next.js server/client components](https://nextjs.org/docs/app/getting-started/server-and-client-components) and [Playwright assertions](https://playwright.dev/docs/test-assertions). Project-specific choices are explained in [architecture](../../../ARCHITECTURE.md); framework documentation does not establish that our future implementation passes its tests.
