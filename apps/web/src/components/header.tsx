// @shopscale/web components/header - Floating pill header (T023b).
// DESIGN.md §5.2: full-width 56px pill, tenant logo + wordmark, centred search
// pill, cart/wishlist circles and the account (or Sign in) pill, sticky.
// Presentational and server-renderable: search submits natively to /search, so
// the header works without JavaScript.

import { BagIcon, HeartIcon, IconCircleButton, SearchPill } from '@/components/ui';

export interface HeaderProps {
  /** Tenant wordmark; rendered lowercased with a trailing dot (never nitec). */
  tenantName: string;
  search?: { defaultValue?: string | undefined; submitting?: boolean | undefined } | false;
  cartCount?: number;
  wishlistActive?: boolean;
  account?: 'signed-out' | { name: string };
}

export function Header({
  tenantName,
  search = {},
  cartCount = 0,
  wishlistActive = false,
  account = 'signed-out',
}: HeaderProps) {
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
            label={cartCount > 0 ? `Cart, ${cartCount} items` : 'Cart'}
            href="/cart"
          >
            <BagIcon size={18} />
          </IconCircleButton>
          {cartCount > 0 ? (
            <span className="ss-badge" aria-hidden="true">
              {cartCount}
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
