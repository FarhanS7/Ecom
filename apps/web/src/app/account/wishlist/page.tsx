// @shopscale/web app/account/wishlist/page.tsx - Customer wishlist page (REQ-ENG-001 / T065).

import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { WishlistResponseDto } from '@shopscale/contracts';
import { apiBaseUrl } from '@/lib/api';
import { currentSessionEmail } from '@/lib/session-server';
import { WishlistView } from '@/features/wishlist/wishlist-view';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'My Wishlist',
};

async function loadWishlist(): Promise<WishlistResponseDto> {
  let base: string;
  try {
    base = apiBaseUrl();
  } catch {
    return { items: [], count: 0 };
  }

  try {
    const res = await fetch(`${base}/v1/wishlist`, {
      headers: {
        cookie: cookies().toString(),
        accept: 'application/json',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return { items: [], count: 0 };
    }

    return (await res.json()) as WishlistResponseDto;
  } catch {
    return { items: [], count: 0 };
  }
}

export default async function AccountWishlistPage() {
  const email = await currentSessionEmail();
  if (!email) {
    redirect('/login?next=/account/wishlist');
  }

  const { items } = await loadWishlist();

  return (
    <section aria-labelledby="wishlist-page-title" className="ss-account-wishlist">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
        <div>
          <Link href="/account" className="text-muted" style={{ display: 'inline-block', marginBottom: 'var(--space-1)' }}>
            &larr; Back to account
          </Link>
          <h1 id="wishlist-page-title" className="type-h2">
            My Wishlist
          </h1>
        </div>
      </div>

      <WishlistView initialItems={items} />
    </section>
  );
}
