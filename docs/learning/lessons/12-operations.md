# Measurement, release evidence, and operational learning

Learning status: reference material for future implementation. Examples are reasoning sketches, not tested application code.

Related implementation: T066–T067, T071–T090. Prerequisites: Working end-to-end demo and meaningful correctness tests.

## Choose your route

Guided: read this lesson, implement the linked task, then attempt the [challenge](../challenges/12-operations.md). Challenge-first: open that file now, use [hints](../hints/12-operations.md) only if needed, then compare [solution reasoning](../solutions/12-operations.md).

## Mental model

A performance claim is an experiment with defined inputs, environment and oracle. A successful backup command is not proof of recoverability; restoring and verifying business invariants is. Observability helps explain a failure, while tests establish specific expected behavior.

## Worked example

Average latency is 20ms but p95 is 900ms. A claim that requests are fast based on the average hides the tail. A 1000-product smoke run cannot substantiate a 100k-product target. Similarly, zero HTTP errors can hide duplicate financial effects unless database/provider counts are checked.

```
// Proposed k6 threshold shape; exact scenario config is implemented in T079.
thresholds: {
  http_req_failed: ['rate<0.005'],
  'http_req_duration{route:search}': ['p(95)<150']
}
```

## Guided implementation

1. Choose one measurable question and fixed workload; record hardware, allocation, versions, seed and commit.
2. Warm up explicitly, then measure cold/warm profiles separately; preserve raw output.
3. Inspect query plans, lock waits, pool queues and memory to explain numbers.
4. Restore a backup into a new isolated namespace and verify order/stock/ledger plus a purchase.
5. Rehearse deployment/rollback and write a portfolio claim only after its evidence exists.

Use [the task tracker](../../../tasks/todo.md) for the concrete implementation order. Do not implement a lesson's later-stage example before its task prerequisites are present.

## Common mistakes

Comparing different datasets/hardware as if only an index changed; hiding failed thresholds; generating load from an already saturated machine without disclosure; treating screenshots as benchmark evidence alone; claiming a restore RTO without timing a restore.

## Explain it without looking

- What does p95 tell you that average latency does not?
- What would make a before/after benchmark unfair?
- How do you prove restored stock agrees with restored paid orders?

Write answers in your own learning journal. Include one counterexample to the naive approach, a test that catches it, and a condition under which a different design would be better.

## Transfer exercise

Limit database memory and compare query plans/cache behavior without changing the dataset; explain the observed tradeoff.

## Reference

[k6 thresholds](https://grafana.com/docs/k6/latest/using-k6/thresholds/) and [Testcontainers Node](https://node.testcontainers.org/). Project-specific choices are explained in [architecture](../../../ARCHITECTURE.md); framework documentation does not establish that our future implementation passes its tests.
