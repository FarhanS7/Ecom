'use client';

// @shopscale/web components/header - Floating pill header (T023b, cart wired T043).
// DESIGN.md §5.2: full-width 56px pill, tenant logo + wordmark, centred search
// pill, cart/wishlist circles and the account (or Sign in) pill, sticky.
// Presentational and server-renderable: search submits natively to /search, so
// the header works without JavaScript. Inside CartProvider, cart icon opens
// the accessible slide-over drawer and shows live item badge.

import { BagIcon, HeartIcon, IconCircleButton, SearchPill } from '@/components/ui';
import { useCartSafe } from '@/features/cart/cart-context';

export interface HeaderProps {
  /** Tenant wordmark; rendered lowercased with a trailing dot (never nitec). */
  tenantName: string;
  search?: { defaultValue?: string | undefined; submitting?: boolean | undefined } | false;
  cartCount?: number;
  onCartClick?: () => void;
  wishlistActive?: boolean;
  account?: 'signed-out' | { name: string };
}

export function Header({
  tenantName,
  search = {},
  cartCount,
  onCartClick,
  wishlistActive = false,
  account = 'signed-out',
}: HeaderProps) {
  const cartContext = useCartSafe();
  const count = cartCount ?? cartContext?.totalCount ?? 0;
  const handleCartClick = onCartClick ?? cartContext?.openCart;

  return (
    <header className="ss-header" role="banner">
      <a className="ss-header__logo" href="/">
        <span className="ss-logo-mark" aria-hidden="true">
          {tenantName.slice(0, 1).toUpperCase()}
        </span>
        {tenantName.toLowerCase()}.
      </a>

      {search === false ? null : (
        <div className="ss-header__search">
          <SearchPill defaultValue={search.defaultValue} submitting={search.submitting} />
        </div>
      )}

      <nav className="ss-header__actions" aria-label="Cart and account">
        <span className="ss-icon-wrap">
          <IconCircleButton
            label={count > 0 ? `Cart, ${count} items` : 'Cart'}
            href={handleCartClick ? undefined : '/cart'}
            onClick={handleCartClick}
          >
            <BagIcon size={18} />
          </IconCircleButton>
          {count > 0 ? (
            <span className="ss-badge" aria-hidden="true" data-testid="cart-badge">
              {count}
            </span>
          ) : null}
        </span>

        <IconCircleButton
          label={wishlistActive ? 'Wishlist, items saved' : 'Wishlist'}
          href="/account/wishlist"
          variant="ghost"
          active={wishlistActive}
        >
          <HeartIcon size={18} filled={wishlistActive} />
        </IconCircleButton>

        {account === 'signed-out' ? (
          <a className="ss-account" href="/login">
            Sign in
          </a>
        ) : (
          <a className="ss-account" href="/account">
            {account.name}
            <span className="ss-avatar" aria-hidden="true">
              {account.name.slice(0, 1).toUpperCase()}
            </span>
          </a>
        )}
      </nav>
    </header>
  );
}
