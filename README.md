# ShopScale planning workspace

This repository currently contains specifications and a static visual reference, not a running marketplace.

Start with the [documentation index](docs/README.md), then the [implementation roadmap](tasks/plan.md). The [task tracker](tasks/todo.md) is the single implementation checklist.

## Product

One shared marketplace plus independent branded stores. Each seller business owns one store, can invite staff, and uses one catalog and inventory pool across both channels. Customers share an account but have separate carts per storefront and for the marketplace.

## Current status

- Discovery choices are recorded in [confirmed decisions](docs/planning/confirmed-decisions.md).
- The implementation plan is a proposal for review, not evidence that anything is built.
- There is no application package manifest or root Git repository yet. Commands in the plan are future command contracts, not runnable instructions today.
- Original source documents and downloaded resources remain unchanged.

## Reading order

1. [Scope and defaults](docs/planning/scope.md)
2. [Requirements reconciliation](docs/planning/requirements-reconciliation.md)
3. [Architecture](ARCHITECTURE.md)
4. [Milestones](tasks/plan.md)
5. [Learning guide](docs/learning/README.md)
6. [First task](tasks/items/T001.md)

Planning is milestone-based with no fixed deadline. Local development targets Windows, Docker Desktop, and 8 GB RAM.
