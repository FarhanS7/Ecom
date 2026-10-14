# Confirmed planning decisions

Status: user decisions recorded; the accompanying implementation plan is a proposal for review, not a completed application or an approved technical design.

## Deliverables requested

Create a full implementation plan using the existing PRD, design specification, development framework, and relevant bundled resources. Separate concerns into linked Markdown files. Include learning documentation so the user understands the engineering, not only the implementation steps. Clarifying questions are welcome.

## Learning background and goals

- The user reports experience with JavaScript, Next.js, React, Node.js, NestJS, Express, SQL, and NoSQL. Depth of experience is not yet established.
- Both backend engineering portfolio/interview preparation and full-stack engineering are primary goals.
- The learning material must cover frontend as well as backend engineering.
- Provide both guided lessons and challenge-first exercises, with separate solution walkthroughs. The user can choose the reading order for each topic.
- The user chose a flexible pace. Organize work by milestones and learning checkpoints, without fixed dates or assumed weekly hours.

## Confirmed product decisions

| ID | Decision | Planning consequence |
| --- | --- | --- |
| D-001 | Support independent branded stores and a shared marketplace. | Define store boundaries, marketplace visibility, and cross-channel behavior explicitly. |
| D-002 | Each seller manages one catalog and inventory pool across channels. | Orders from either channel compete for the same stock. Avoid independent stock copies. |
| D-003 | Sellers choose which products appear in the marketplace. | Model marketplace publication separately from availability in the seller's storefront. |
| D-004 | Customers use one account across stores and the marketplace. | Define shared identity, global order history, store-specific views, and scoped seller access. |
| D-005 | Each branded store has its own cart; the marketplace has a separate multi-seller cart. | Store cart identity includes the store; marketplace checkout needs seller-specific fulfillment boundaries. |
| D-006 | Build a portfolio demo first, with a separate production roadmap. | Fully plan demo delivery and its learning outcomes; distinguish future real payments, payouts, shipping, and operations from demo acceptance criteria. |
| D-007 | One seller business owns one branded store, with an owner and staff with different permissions. | Plan store-scoped staff memberships and permissions. Multiple stores per business belong in the future roadmap. |
| D-008 | Use TypeScript, NestJS for the backend, and Next.js with React for the frontend. | Build the implementation and learning documents around this stack. |
| D-009 | Local development uses Windows, Docker Desktop, and 8 GB system RAM. | Keep the default development services small; specify optional Docker profiles and separate benchmark requirements. CPU and Docker resource allocation remain unknown. |

## Planning response to local resource limits

Proposed: run the application processes on the host and keep only core data services in Docker by default. Add search, broker, and observability services through explicit profiles when a lesson or verification step needs them. Validate actual resource usage during setup rather than promising fixed capacity now.

The PRD's Tier L performance goals remain targets requiring reproducible evidence. Local development constraints do not establish that those goals pass, nor authorize silently lowering them. The final plan must distinguish functional checks on the learner's laptop from full benchmark runs on a measured environment.

## Proposed, not yet confirmed

- Exact staff roles, invitation flow, and ownership-transfer rules remain to be specified within the confirmed one-business/one-store model.
- Shared identity does not yet select cross-domain session transport, custom domains, or authentication libraries.
- Demo-first does not yet select mock-only payments versus a provider's test environment.

## Source documents

- [Marketplace PRD](../../01-ecommerce-marketplace-PRD.md)
- [Design specification](../../design.md)
- [PRD-to-tasks framework](../../PRD_TO_TASKS_FRAMEWORK.md)
- [Visual reference](../../tm.html)

The source documents have not been edited. Future specifications must explicitly reconcile their multi-vendor and multi-tenant assumptions with these confirmed decisions.
