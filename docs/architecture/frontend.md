# Frontend architecture and UX plan

## Route map

| Area | Pages |
| --- | --- |
| Marketplace | /, /products, /products/{id}, /search, /cart, /checkout |
| Branded store | /stores/{slug}, /stores/{slug}/products, /stores/{slug}/products/{productSlug}, /stores/{slug}/cart, /stores/{slug}/checkout |
| Customer | /login, /register, /forgot-password, /reset-password, /account, /account/orders, /account/orders/{id}, /account/wishlist |
| Seller staff | /seller/{storeId}, /products, /inventory, /orders, /returns, /coupons, /team, /settings, /reports under that prefix |
| Platform | /admin/applications, /stores, /users, /audit, /reports, /policies |
| Support | /support/orders, /support/refunds; restricted customer lookup |

Do not duplicate domain logic between store and marketplace routes. A typed ChannelContext selects data and theme. Route guards improve UX but NestJS remains the authorization boundary.

## Rendering and state

Server components render public catalog, initial product details, and approved theme data. Client components handle filters, autocomplete, variant selection, cart controls, menus, and forms. Use URL state for shareable filters/sort/cursors; component state for transient controls; a small cart/session provider only where needed. Do not add Redux by default.

Private user content uses explicit uncached requests and private/no-store responses. Cache public content only with channel-aware keys and publication invalidation. A logged-in page must not reuse another user's server-rendered data.

The same-origin gateway sends secure HttpOnly session cookies to Nest; public responses never forward Set-Cookie into a shared cache. Add Origin/CSRF validation for mutating browser requests.

## Design system

[design.md](../../design.md) is the visual specification; [tm.html](../../tm.html) is a reference, not reusable production behavior. Build Frame, Header, SearchPill, IconCircleButton, Card, Tag, RatingBadge, PrimaryButton, ArrowButton, HeroCard, ColorChipsCard, PromoTile, FeaturedProductCard, CategoryPreviewCard, StatCard, TrendingCard, SocialRow, ProductCard.

Extract tokens exactly, including mobile exceptions. Market theme uses ShopScale demo content; each store injects only allowed variables. Validate fonts and color tokens; do not allow arbitrary CSS values or HTML. Theme tokens load before paint to avoid layout shifts.

## Interaction contracts

- Search is a labelled input with debounced suggestions, keyboard navigation, cancellation of stale responses, and URL-backed committed queries.
- Cart mutation shows pending/error states, handles version conflicts, and does not claim inventory is reserved before checkout.
- Checkout presents seller grouping, per-seller shipping, total, stock/price changes, and a stable retry path. Disable accidental double-submit but rely on server idempotency.
- Order view distinguishes pending payment, paid, partial fulfillment, cancellation, partial refund, and failed payment recovery.
- Seller form uses validation summaries and preserves entered data after server rejection.
- Suspended/unpublished products disappear from discovery; direct links show an unavailable state. Historic order lines retain snapshots.
- Missing homepage content reflows rather than leaving empty cards.

## Accessibility and verification

Use semantic landmarks, visible focus, labelled inputs, useful image alt text, 44px targets, focus trapping/restoration in dialogs, announced cart errors, and reduced motion. Test 390/768/1024/1440 widths, keyboard-only checkout, 200% zoom, theme contrast, loading/empty/error/disabled states, and text overflow.

Component tests prove interaction states; Playwright proves actual cross-page flows; screenshots compare layout at fixed seeded data. Reticle is optional supplemental runtime evidence, not a substitute for tests or permission checks.

## Performance budget proposal

Target LCP <=2.5s, CLS <=0.1, and INP <=200ms under a recorded test profile; these are frontend project targets, separate from backend latency SLOs. Measure production build, image sizes, bundle boundaries, and slow network behavior. Never report dev-server timings as production evidence.
