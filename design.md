# DESIGN.md — Multi-Tenant E‑Commerce Storefront

> **Authority:** This file is the single source of truth for UI/UX. The IDE agent MUST follow it strictly.
> If a request conflicts with this file, follow this file. If something is not defined here, extend it using the
> same visual language (soft glass bento cards, pill controls, big radii, one accent color) — never invent a new style.
> Reference design: the "nitec." dashboard-style storefront (bento grid, frosted cards, lime CTA, floating product imagery).
> Brand names, copy, products and images in the reference are **placeholders**. The **layout, spacing, radii, typography feel, component shapes and interactions are fixed.**

---

## 1. Design Principles

1. **Bento layout.** Every page is composed of rounded, frosted "cards" placed on a soft gradient canvas with equal gaps.
2. **Soft + airy.** Light, translucent surfaces, very subtle shadows, lots of breathing room.
3. **Pill everything.** Buttons, search, tags, nav bar, badges are fully rounded (pill/circle).
4. **One loud accent.** Neutral UI + one lime CTA color (tenant-overridable) + product imagery supplies the color.
5. **Product-first.** Large, clean, cut-out product photos (transparent/neutral backgrounds) are the hero. Text is minimal.
6. **Arrow-up-right = "go".** Any card that navigates has a circular white button with an ↗ icon.
7. **Black is the contrast color.** Primary text, primary icon buttons and the CTA's inner circle are near-black.

---

## 2. Multi-Tenant Theming Rules

Tenants can change **only** the tokens listed below. Everything else (layout, radii, spacing, component anatomy) is locked.

| Tenant-overridable (via CSS variables) | Locked (never per-tenant) |
|---|---|
| `--color-accent` (CTA lime), `--color-accent-contrast` | Grid structure, card radii, gaps, paddings |
| `--color-brand` (stat circle / highlight blue) | Component anatomy & interaction patterns |
| `--font-display`, `--font-body` (optional) | Type scale, weights, letter-spacing rules |
| Logo (SVG), tenant name, favicon | Icon style (outline, 1.5px) |
| Background gradient stops (`--bg-from/mid/to`) | Shadow / blur / glass recipe |
| Content: copy, images, swatches, socials | Pill/circle shape language |

**Implementation contract**
- Resolve tenant at request time (subdomain/domain/path) → load a `TenantTheme` object → inject as CSS variables on `:root` (or a wrapper with `data-tenant="<id>"`).
- Components MUST read colors only from CSS variables/tokens. **No hard-coded hex values in components.**
- All tenant-provided logos/images must be validated (SVG sanitized, image aspect handled with `object-fit`).
- Fallback to the default theme in this file if a tenant token is missing.

```ts
type TenantTheme = {
  id: string;
  name: string;
  logoSvg: string;            // wordmark + mark
  accent: string;             // default #DCF75A
  accentContrast: string;     // default #0A0A0A
  brand: string;              // default #3D6FD6
  bg: { from: string; mid: string; to: string };
  fontDisplay?: string;
  fontBody?: string;
  socials: { platform: 'x'|'tiktok'|'instagram'|'linkedin'|'facebook'|'youtube'; url: string }[];
  colorSwatches: string[];    // up to 5, used in "Popular Colors" card
};
```

---

## 3. Design Tokens

### 3.1 CSS variables (copy exactly)

```css
:root {
  /* Canvas */
  --bg-from: #D6E0E5;            /* top-left, cool blue-grey */
  --bg-mid:  #E8EEEB;            /* center, soft mint-grey  */
  --bg-to:   #F2F2D9;            /* bottom, pale butter-green */
  --bg-gradient: linear-gradient(170deg, var(--bg-from) 0%, var(--bg-mid) 50%, var(--bg-to) 100%);

  /* Surfaces (glass) */
  --surface:        rgba(255, 255, 255, 0.60);
  --surface-strong: rgba(255, 255, 255, 0.85);
  --surface-solid:  #FFFFFF;
  --surface-hero:   linear-gradient(135deg, rgba(255,255,255,.75) 0%, rgba(240,248,245,.65) 100%);
  --surface-border: rgba(255, 255, 255, 0.70);

  /* Text */
  --text-primary:   #0A0A0A;
  --text-secondary: #6B7075;
  --text-tertiary:  #9AA0A6;
  --text-ghost:     #D3D8DA;     /* big outlined "01" numerals */
  --text-on-dark:   #FFFFFF;

  /* Brand / accent (tenant-overridable) */
  --color-accent:          #DCF75A;  /* lime CTA */
  --color-accent-contrast: #0A0A0A;
  --color-brand:           #3D6FD6;  /* blue stat circle, links/highlights */

  /* Functional */
  --color-heart:   #E5453B;
  --color-star:    #F5B921;
  --color-hot:     #F97316;          /* "Popular" flame */
  --color-success: #2FB544;
  --color-danger:  #E5453B;

  /* Default swatch palette ("Popular Colors") */
  --swatch-1: #3F73D9;  /* blue   */
  --swatch-2: #FF8A1F;  /* orange */
  --swatch-3: #2FB544;  /* green  */
  --swatch-4: #F0403A;  /* red    */
  --swatch-5: #2DD4C4;  /* cyan   */

  /* Radii */
  --radius-frame: 28px;   /* outer page frame on desktop */
  --radius-card:  28px;   /* all bento cards */
  --radius-inner: 18px;   /* thumbnails, inner image tiles */
  --radius-pill:  999px;

  /* Spacing (4px base) */
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px; --space-4: 16px;
  --space-5: 20px; --space-6: 24px; --space-8: 32px; --space-10: 40px; --space-12: 48px;
  --grid-gap: 16px;        /* gap between ALL bento cards */
  --page-pad: 24px;        /* padding inside outer frame */
  --card-pad: 24px;        /* default card padding (20px on small cards) */

  /* Shadows */
  --shadow-card:  0 8px 30px rgba(20, 30, 40, 0.06);
  --shadow-hover: 0 14px 40px rgba(20, 30, 40, 0.10);
  --shadow-float: 0 6px 16px rgba(20, 30, 40, 0.10);   /* small white circle buttons */

  /* Glass */
  --blur: saturate(140%) blur(18px);

  /* Type */
  --font-display: 'Satoshi', 'General Sans', 'Inter Tight', 'Inter', system-ui, sans-serif;
  --font-body:    'Satoshi', 'General Sans', 'Inter', system-ui, sans-serif;

  /* Motion */
  --ease: cubic-bezier(.22,.61,.36,1);
  --dur-fast: 150ms; --dur: 250ms; --dur-slow: 500ms;
}
```

### 3.2 Typography

Geometric grotesk sans (reference feels like Aeonik / Satoshi / General Sans). Use **Satoshi** or **General Sans** (Fontshare, free); if unavailable use **Inter Tight** / **Inter**. Never use serif or script fonts.

| Token | Size (desktop) | Weight | Line-height | Letter-spacing | Use |
|---|---|---|---|---|---|
| `display` | `clamp(36px, 4vw, 56px)` | 500 | 1.08 | -0.02em | Hero headline ("Sequoia Inspiring Musico.") |
| `ghost-number` | 48–56px | 500 | 1 | 0 | Outlined "01" step/slide index |
| `h3` | 20–22px | 500 | 1.2 | -0.01em | Card titles that are prominent |
| `card-title` | 15–16px | 500 | 1.25 | -0.005em | "Listening Has Been Released", "Light Grey Surface Headphone", "New Gen X‑Bud" |
| `body` | 14px | 400 | 1.5 | 0 | Paragraphs |
| `body-sm` | 12–13px | 400 | 1.45 | 0 | Descriptions, sub-labels |
| `caption` | 11–12px | 400/500 | 1.3 | 0 | Tags, nav search, socials label |
| `button` | 13–14px | 600 | 1 | 0 | CTA text |
| `stat` | 24–28px | 700 | 1 | -0.01em | "5m+" |

Rules: headings are **sentence/Title case, never ALL CAPS**. Titles are near-black; secondary text is `--text-secondary`. Headline breaks over 2 lines by design (max-width ≈ 9–10 words per 2 lines).

### 3.3 Iconography
- Outline icons, **1.5px stroke**, rounded caps/joins, 18–20px (Lucide or Phosphor "regular"). Icons in white circles are black; heart is **filled red** when active.
- Required icons: search, refresh/loader (search button), shopping-bag, heart, arrow-up-right, chevrons `<` `>` (carousel), grid (tag), flame (popular), star (filled yellow), social (X, TikTok, Instagram, LinkedIn).

---

## 4. Page Shell

```
┌───────────────────────────────────────────────────────────────┐  ← Frame (radius 28, canvas gradient, padding 24)
│ [ HEADER PILL ]                                               │
│                                                               │
│ ┌──────────── MAIN (9/12) ────────────┐ ┌─── ASIDE (3/12) ──┐ │
│ │  HERO CARD                          │ │ Popular Colors    │ │
│ │                                     │ │ New Gen tile      │ │
│ │                                     │ │ Featured tall     │ │
│ │ [More] [Stat] [Popular product]     │ │ product card      │ │
│ └─────────────────────────────────────┘ └───────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

- The whole storefront sits inside a large rounded **frame** (`--radius-frame`) over the gradient canvas; on the real site the frame may be full-bleed with `--page-pad` and the gradient on `body`.
- `max-width: 1440px`, centered. All gaps between cards = `--grid-gap` (16px). **Never use different gaps.**

### 4.1 Grid (desktop ≥ 1200px)

```css
.storefront-grid {
  display: grid;
  grid-template-columns: 9fr 3fr;         /* ≈ 75% / 25% */
  gap: var(--grid-gap);
}
.main-col  { display: grid; grid-template-rows: minmax(0, 1fr) auto; gap: var(--grid-gap); }
.main-col .hero { min-height: 400px; }    /* hero ≈ 2.6× height of the bottom row */
.bottom-row {
  display: grid;
  grid-template-columns: 3fr 2fr 4fr;     /* More Products | Stat | Popular product */
  gap: var(--grid-gap);
  height: 156px;                          /* ≈ 140/632 of frame */
}
.aside-col { display: flex; flex-direction: column; gap: var(--grid-gap); }
.aside-col .colors   { height: 82px; }
.aside-col .newgen   { height: 156px; }
.aside-col .featured { flex: 1; min-height: 300px; }   /* fills remaining height, aligns bottom with bottom-row */
```

Card proportions (reference, of content width): hero ≈ 75% × 57% height; bottom row = 3 cards (≈ 24% / 15% / 32%); aside = 3 stacked cards (≈ 12% / 22% / 43% height).

---

## 5. Components

### 5.1 Card (base)
```css
.card {
  background: var(--surface);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-card);
  -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur);
  padding: var(--card-pad);
  position: relative; overflow: hidden;
  transition: transform var(--dur) var(--ease), box-shadow var(--dur) var(--ease);
}
.card:hover { transform: translateY(-3px); box-shadow: var(--shadow-hover); }
```
- Clickable cards are `<a>` elements with the ↗ circle button (see 5.6). Focus ring: 2px `--text-primary` outline, 3px offset.
- Image cards (`New Gen`, `Featured`, `Popular product`): image is **full-bleed** (`object-fit: cover`), padding 0, text overlays sit on a soft gradient (white→transparent for light imagery).

### 5.2 Header (floating pill navigation)
- Full-width pill: height **56px**, `--radius-pill`, `--surface` glass + border + `--shadow-card`, inner padding `0 8px 0 20px`.
- **Left:** Logo (tenant): black rounded-square mark with letter/glyph + lowercase wordmark 20px, weight 600 (`nitec.` → `{tenant.name}.`).
- **Center-left (right after logo, ~ 380px wide):** Search — white pill input (height 44px, placeholder "Search products…" `caption` size, `--text-primary` at 60%) with a **black circular button (36–40px)** flush right inside the pill showing a white icon (search; loader/refresh while loading).
- **Right group (gap 8px):**
  - Cart: white circle 44px, black bag icon (badge: 16px black circle, white 10px count, top-right).
  - Wishlist: white circle 44px, **red filled heart**.
  - Account pill: white pill height 44px containing user name (caption, 500) + 32px circular avatar on the right.
- Logged out: replace account pill with "Sign in" pill (same size, white, black text).
- Sticky on scroll: `position: sticky; top: 12px; z-index: 50`.

### 5.3 Hero Card (featured campaign / collection)
Layout: two zones — left text (≈ 50%), right product stage (≈ 50%).

**Left column (top → bottom, left aligned, padding 32px):**
1. **Eyebrow tag** — white pill, 12px text `--text-secondary`, tiny grid icon at left ("Music is Classic" → collection/category tagline). Height 28px, padding `0 12px`.
2. **Headline** — `display` style, 2 lines, `--text-primary`.
3. **Index row** — ghost outlined numeral "01" (`-webkit-text-stroke: 1px var(--text-ghost); color: transparent`), then a 1px `--text-tertiary` line (~110px, ending with a tiny arrowhead), then a text block: bold-ish `body` title ("Clear Sounds", weight 500, 14px) + 2‑line `body-sm` description in `--text-secondary`. The numeral tracks the active slide.
4. **Primary CTA** — "View All Products" (see 5.4).
5. **Social row** (bottom, aligned baseline of card) — label "Follow us on:" `caption` + 4 white circle buttons (36px, `--shadow-float`), grey icons (`--text-secondary`), no brand colors.

**Right stage:**
- Product cut-out image, large (≈ 300–340px), centered slightly right, subtle float animation (translateY ±8px, 6s ease-in-out infinite).
- **Decorative orbs:** 4–6 small spheres (10–22px) around the product — 1–2 light grey glossy, 2–3 deep navy/brand-dark (`radial-gradient` highlight top-left). They drift slowly (parallax). Purely decorative (`aria-hidden`).
- **Orbit arc:** thin 1px `--text-tertiary` arc below the product with a small dot at the ends.
- **Carousel control:** white pill (48×32px) centered at the bottom of the arc with `<` `>` icons; swaps the hero slide (product image, headline, index number, description).
- Background: `--surface-hero`, very subtle mint tint behind the product (radial gradient, 10% opacity of brand color).

### 5.4 Primary CTA — "Lime pill with black arrow circle"
```css
.btn-primary {
  display: inline-flex; align-items: center; gap: 16px;
  height: 52px; padding: 0 6px 0 24px;
  background: var(--color-accent); color: var(--color-accent-contrast);
  border-radius: var(--radius-pill); font: 600 14px/1 var(--font-body);
}
.btn-primary .btn-icon {         /* inner circle */
  width: 40px; height: 40px; border-radius: 50%;
  background: #0A0A0A; color: #fff; display: grid; place-items: center;
}
.btn-primary:hover .btn-icon svg { transform: rotate(45deg); }   /* ↗ rotates to → feel */
.btn-primary:active { transform: scale(.97); }
```
There is **one** primary CTA per view. Secondary buttons = white pill, black text, same height, same inner-circle option.

### 5.5 Tags / Chips
- **Neutral tag:** white pill, height 28–30px, padding `0 12px`, 12px text, `--text-secondary`, optional 14px leading icon.
- **Popular tag:** white pill with 1px `--surface-border`, flame icon `--color-hot` + "Popular".
- **Rating badge:** white pill, yellow filled star `--color-star` + value ("4.7") 12px/600, placed bottom-right of image cards.

### 5.6 Circular action buttons
- **Arrow button:** 36–40px white circle, `--shadow-float`, black ↗ (1.5px). Positioned **top-right** (16px inset) on image/product cards, or **bottom-left** on the New Gen tile. Hover: bg → `--color-accent`, icon rotates 45°.
- **Heart (wishlist):** 36px circle; inactive = `--surface-strong` with grey outline heart; active = red filled heart on light-grey circle. Toggle with scale-pop animation (1 → 1.2 → 1, 200ms).
- **Social/utility:** 36px white circle, grey icon.

### 5.7 "Popular Colors" card (color facet filter)
- Height ≈ 82px, padding 16px 20px. Title "Popular Colors" `card-title` 14–15px/500.
- Row of **5 white circular chips (36px, `--shadow-float`)** each holding a **22px solid color dot** centered. Gap 10px, evenly distributed.
- Behavior: click filters catalog by color; selected = 2px `--text-primary` ring around chip. Colors come from `tenant.colorSwatches` (max 5).

### 5.8 "New Gen" tile (new arrivals promo)
- Full-bleed lifestyle/product photo (light grey background, hands holding product), height ≈ 156px.
- Title top-left, 2 lines (`card-title`, e.g., "New Gen / X‑Bud") in `--text-primary`; white → transparent gradient behind the text for legibility.
- White circular ↗ button bottom-left.
- Links to: New Arrivals listing.

### 5.9 "Featured product" tall card
- Tall card (aside bottom), full-bleed product/model photo, light grey/white gradient at top that fades into the image.
- ↗ white circle top-right.
- Bottom-left text: product name (`card-title`, 2 lines, `--text-primary`; on darker imagery use `--text-on-dark`) + tagline `caption` `--text-secondary` ("Boosted with bass"). Optional price on the third line (`body-sm`, 600).
- Links to: Product Detail Page.

### 5.10 "More Products" card (category preview)
- Padding 20px. Top-left: title "More Products" (`card-title`) + `caption` "460 plus items." in `--text-secondary` (item count from data).
- Top-right: heart circle button (36px, light-grey bg, red filled heart) → links to Wishlist / Favorites.
- Bottom: row of **3 square thumbnails** (≈ 52–56px, `--radius-inner` 16px), gap 10px, each with a different neutral background (dark, light grey, mid grey) and a cut-out product. Click → product/category page.

### 5.11 "Stat / Social proof" card
- Top: cluster of **3 overlapping avatars** (32px, circular or 12px-rounded squares, 2px white border, overlap −10px), pastel backgrounds.
- Center: **large brand-colored circle** (~84px, `--color-brand`, subtle radial highlight/inner glow) containing metric `stat` "5m+" white 700 and label "Downloads" 11px white 80% → generalize to `{{metric}}` such as "Orders", "Happy customers", "Products sold".
- Bottom: white pill, star + "4.6 reviews" (`caption`, 600; yellow star).
- The card background is lightly tinted (white → very light blue). Centered composition.

### 5.12 "Popular product" horizontal card
- Wide card (≈ 4/9 of main width), height 156px. Left column: "Popular" tag (5.5), title (2 lines, `card-title`, e.g., "Listening Has Been Released" → trending product / drop name), and a row of 2–3 small overlapping product-avatar circles (28–34px) below the title.
- Right ≈ 55%: cropped full-height product photo (hand holding item) bleeding to the card's right/bottom edges.
- ↗ white circle top-right; rating badge bottom-right.

### 5.13 Carousel dots / Index
Hero uses the ghost numeral (`01`, `02` …) plus the `<` `>` control; no traditional dots on desktop. On mobile show a 3–5 dot indicator (6px dots, active = 18px pill in `--text-primary`).

---

## 6. Content ↔ E‑Commerce Mapping (what each block is used for)

| UI block | E‑commerce purpose | Data source |
|---|---|---|
| Header search | Global product search with autosuggest | `/search?q=` |
| Cart bag | Cart drawer / page | cart state |
| Heart (header) | Wishlist | wishlist |
| Account pill | Account menu / sign‑in | session |
| Hero | Featured campaign / best collection (carousel of 3–5) | `tenant.featuredCollections[]` |
| View All Products | Product listing page | `/products` |
| Popular Colors | Color filter shortcut | `tenant.colorSwatches` |
| New Gen tile | New arrivals | `/products?sort=new` |
| Featured tall card | Hero product / editor's pick | `products[featured]` |
| More Products | Category/collection preview + count | `categories[]` |
| Stat card | Social proof (orders, customers, rating) | `tenant.stats` |
| Popular product card | Trending / best seller with rating | `products[trending]` |
| Follow us on | Tenant social links | `tenant.socials` |

Every tenant must be able to supply all of the above; if a block has no data, **hide the block and let neighbors reflow** (do not leave empty cards).

---

## 7. Extending the Design to Other Pages

Use the same shell (gradient canvas + floating header pill) and build with glass cards. Follow these derived patterns:

- **Product Listing (PLP):** left/top filter card (glass, pills for filters, color chips as in 5.7); product grid of glass cards (`--radius-card`, 4 cols desktop / 2 mobile). Product card = image on neutral tile (`--radius-inner`), title `card-title`, price `body-sm` 600, rating badge, heart button top-left, ↗/“Add” circle bottom-right.
- **Product Detail (PDP):** two-column bento: large image card (with floating orbs + orbit arc like hero) | info card (title `h3`, price, color chips, size pills, quantity stepper pill, **lime primary CTA "Add to cart"**, secondary white "Buy now"). Reviews card with stat circle style.
- **Cart / Checkout:** glass cards for line items, summary card sticky on the right; totals in `h3`; lime primary CTA "Checkout"; steps shown as ghost numerals `01 02 03`.
- **Account/Dashboard:** bento tiles with stats in the blue circle style.
- **Forms:** inputs = white pill (height 48px, `--radius-pill`; multi-line = 20px radius), 1px transparent border → 2px `--text-primary` on focus; labels `caption` above. Errors in `--color-danger`.
- **Empty/Loading:** skeletons = card shape with shimmering `rgba(255,255,255,.5)` gradient; never spinners inside cards (the search button loader is the only spinner).
- **Modals/Drawers:** glass card, `--radius-card`, backdrop `rgba(10,10,10,.25)` + blur(6px).
- **Footer:** one wide glass card (same radius), logo left, links in `body-sm` `--text-secondary`, socials as white circles.

---

## 8. Responsive Behavior

| Breakpoint | Layout |
|---|---|
| ≥ 1200px | Full bento as in §4.1 |
| 768–1199px | Single column stack: Header → Hero (full width) → Popular Colors + New Gen (2 cols) → Bottom row cards (2 cols, stat card spans 1) → Featured tall card (full width, 360px tall) |
| < 768px | 1 column, `--grid-gap: 12px`, `--page-pad: 12px`. Header: logo + search icon button + cart + menu; search opens as full-width pill under header. Hero: text first, product image below (280px), CTA full width; socials hidden. Bottom cards each full width (156px tall). Popular Colors chips scroll horizontally. |

- Radii shrink to 22px on mobile; type: `display` 34px min.
- Touch targets ≥ 44×44px.

---

## 9. Motion & Interaction

- Entry: cards fade + translateY(12px → 0), staggered 60ms, 500ms `--ease`.
- Hover (cards): lift −3px + `--shadow-hover`; image inside scales 1.04 (600ms).
- Hero product: slow float; orbs: independent drift, 8–12s loops; slide change = crossfade 400ms + product slides 24px.
- Buttons: press scale .97; ↗ icon rotates 45° on hover.
- Respect `prefers-reduced-motion`: disable float, drift, and stagger.

---

## 10. Accessibility

- Text contrast ≥ 4.5:1 (do not put `--text-tertiary` on gradient for essential info).
- All icon-only buttons need `aria-label` (Search, Cart, Wishlist, Next slide…).
- Decorative orbs/arcs `aria-hidden="true"`; product images have meaningful `alt`.
- Full keyboard support: visible focus ring (2px `--text-primary`, offset 3px), hero carousel operable with ← →, pause on hover/focus.
- Semantic landmarks: `header`, `nav`, `main`, `section`, `footer`.

---

## 11. Implementation Guidance

- **Stack-agnostic.** If using Tailwind, map tokens in `tailwind.config` (`colors`, `borderRadius`, `boxShadow`, `spacing`, `fontFamily`) to the CSS variables above — do not duplicate raw hex values.
- Build reusable components: `Frame`, `Header`, `SearchPill`, `IconCircleButton`, `Card`, `Tag`, `RatingBadge`, `PrimaryButton`, `ArrowButton`, `HeroCard`, `ColorChipsCard`, `PromoTile`, `FeaturedProductCard`, `CategoryPreviewCard`, `StatCard`, `TrendingCard`, `SocialRow`, `ProductCard`.
- Images: WebP/AVIF, `sizes` responsive, transparent PNG/WebP cut-outs for hero/product thumbnails, lazy-load everything below the fold; hero image `priority`.
- Glass effect fallback: if `backdrop-filter` unsupported, use `--surface-strong`.
- Performance: avoid large blur radii on many overlapping elements; limit backdrop-filter to cards.
- Theme switch must not cause layout shift: theme variables inlined in SSR `<style>`.

---

## 12. STRICT RULES (Do / Don't)

**DO**
- Use the token values, radii (28 / 18 / pill) and 16px gaps exactly.
- Keep exactly **one lime primary CTA** per view with the black arrow circle.
- Use frosted white cards on the soft gradient; keep shadows very light.
- Use outline icons and circular white buttons for secondary actions.
- Keep product images clean, cut-out or on neutral light backgrounds.
- Hide/reflow empty blocks. Keep the page composition asymmetric bento (big hero + small tiles).

**DON'T**
- Don't use hard borders, dark backgrounds for cards, heavy drop shadows, or gradients other than the canvas/soft glass ones.
- Don't use square corners, ALL CAPS headings, more than one accent color for UI chrome, or serif fonts.
- Don't use colored social icons, stock "SaaS blue" buttons, or default browser form controls.
- Don't hard-code tenant brand names, colors, or copy in components.
- Don't add new card shapes, extra shadows, or new radii "for variety".
- Don't copy the reference's brand ("nitec.", "Sequoia", "Musico") or its photos — use tenant data only.

---

## 13. Definition of Done (checklist for every screen)

- [ ] Uses `Frame` + floating pill `Header` + glass cards with `--grid-gap`.
- [ ] All colors/radii/shadows come from tokens; tenant theme swap works with zero code change.
- [ ] Exactly one lime primary CTA; secondary actions use white circle/pill.
- [ ] Type scale, weights and letter-spacing match §3.2.
- [ ] Hover, focus, active, disabled, loading and empty states implemented.
- [ ] Responsive at 1440 / 1024 / 768 / 390 widths.
- [ ] Accessibility checks (contrast, labels, keyboard, reduced motion) pass.
