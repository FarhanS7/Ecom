'use client';

// @shopscale/web features/wishlist/wishlist-button - Toggle product in wishlist (REQ-ENG-001 / T065).

import { useState } from 'react';
import { HeartIcon } from '@/components/ui';
import { gatewayRequest } from '@/lib/csrf';

export interface WishlistHeartButtonProps {
  productId: string;
  initialInWishlist?: boolean | undefined;
  className?: string | undefined;
  size?: number | undefined;
  onToggle?: ((inWishlist: boolean) => void) | undefined;
}

export function WishlistHeartButton({
  productId,
  initialInWishlist = false,
  className = '',
  size = 18,
  onToggle,
}: WishlistHeartButtonProps) {
  const [inWishlist, setInWishlist] = useState(initialInWishlist);
  const [isLoading, setIsLoading] = useState(false);

  const handleToggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isLoading) return;

    const nextState = !inWishlist;
    // Optimistic toggle
    setInWishlist(nextState);
    setIsLoading(true);

    try {
      const res = await gatewayRequest(`/api/v1/wishlist/${productId}`, {
        method: nextState ? 'PUT' : 'DELETE',
      });

      if (res.ok) {
        onToggle?.(nextState);
      } else {
        // Rollback on failure
        setInWishlist(!nextState);
      }
    } catch {
      // Rollback on network failure
      setInWishlist(!nextState);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      type="button"
      className={`ss-wishlist-btn ${inWishlist ? 'ss-wishlist-btn--active' : ''} ${className}`}
      onClick={(e) => {
        void handleToggle(e);
      }}
      disabled={isLoading}
      aria-label={inWishlist ? 'Remove from wishlist' : 'Add to wishlist'}
      aria-pressed={inWishlist}
      data-testid="wishlist-toggle-btn"
    >
      <HeartIcon size={size} filled={inWishlist} />
    </button>
  );
}
