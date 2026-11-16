'use client';

// @shopscale/web features/wishlist/wishlist-view - Interactive wishlist list with cart & removal actions (REQ-ENG-001 / T065).

import { useState } from 'react';
import Link from 'next/link';
import type { WishlistItemDto } from '@shopscale/contracts';
import { Card, PrimaryButton, SecondaryButton, Tag } from '@/components/ui';
import { formatPrice } from '@/lib/price';
import { useCartSafe } from '@/features/cart/cart-context';
import { gatewayRequest } from '@/lib/csrf';

export interface WishlistViewProps {
  initialItems: WishlistItemDto[];
}

export function WishlistView({ initialItems }: WishlistViewProps) {
  const [items, setItems] = useState<WishlistItemDto[]>(initialItems);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const cartContext = useCartSafe();

  const handleRemove = async (productId: string) => {
    setRemovingId(productId);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await gatewayRequest(`/api/v1/wishlist/${productId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setItems((prev) => prev.filter((i) => i.productId !== productId));
        setActionSuccess('Item removed from wishlist.');
      } else {
        setActionError('Failed to remove item from wishlist.');
      }
    } catch {
      setActionError('Network error removing item.');
    } finally {
      setRemovingId(null);
    }
  };

  const handleAddToCart = async (item: WishlistItemDto) => {
    if (!item.primaryVariantId) return;
    if (!cartContext) return;

    setAddingId(item.productId);
    setActionError(null);
    setActionSuccess(null);

    try {
      await cartContext.addItem(item.primaryVariantId, 1);
      setActionSuccess(`Added "${item.title}" to cart!`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to add item to cart');
    } finally {
      setAddingId(null);
    }
  };

  return (
    <div data-testid="wishlist-container">
      {actionError ? (
        <p
          role="alert"
          data-testid="wishlist-error"
          className="type-body-sm"
          style={{ color: 'var(--color-danger)', marginBottom: 'var(--space-3)' }}
        >
          {actionError}
        </p>
      ) : null}

      {actionSuccess ? (
        <p
          role="status"
          data-testid="wishlist-success"
          className="type-body-sm"
          style={{ color: 'var(--color-brand)', marginBottom: 'var(--space-3)' }}
        >
          {actionSuccess}
        </p>
      ) : null}

      {items.length === 0 ? (
        <Card className="ss-state" style={{ padding: 'var(--space-6)', textAlign: 'center' }}>
          <h2 className="type-h3" style={{ marginBottom: 'var(--space-2)' }}>
            Your wishlist is empty
          </h2>
          <p className="type-body" style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-4)' }}>
            Explore our marketplace to find products you love and save them for later.
          </p>
          <div>
            <Link href="/products" className="ss-btn ss-btn--primary" data-testid="browse-products-link">
              Explore Products &rarr;
            </Link>
          </div>
        </Card>
      ) : (
        <div className="ss-wishlist-grid" data-testid="wishlist-grid">
          {items.map((item) => {
            const priceLabel = formatPrice(item.priceCents, item.currency);
            const isAdding = addingId === item.productId;
            const isRemoving = removingId === item.productId;
            const canAddToCart = item.available && Boolean(item.primaryVariantId);

            return (
              <div key={item.productId} className="ss-wishlist-card" data-testid="wishlist-card">
                <div className="ss-wishlist-card__image-box">
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.title}
                      className="ss-wishlist-card__image"
                    />
                  ) : (
                    <span className="type-caption" style={{ color: 'var(--text-ghost)' }}>
                      No image
                    </span>
                  )}
                </div>

                <div className="ss-wishlist-card__info">
                  {item.storeName ? (
                    <span className="type-caption" style={{ color: 'var(--text-secondary)' }}>
                      {item.storeName}
                    </span>
                  ) : null}

                  <Link
                    href={`/products/${item.slug}`}
                    className="ss-wishlist-card__title"
                    data-testid="wishlist-item-title"
                  >
                    {item.title}
                  </Link>

                  <div className="ss-wishlist-card__meta">
                    <span className="ss-wishlist-card__price" data-testid="wishlist-item-price">
                      {priceLabel}
                    </span>

                    <span data-testid="wishlist-item-availability">
                      {item.available ? (
                        <Tag tone="positive">In Stock</Tag>
                      ) : (
                        <Tag tone="warning">Unavailable</Tag>
                      )}
                    </span>
                  </div>
                </div>

                <div className="ss-wishlist-card__actions">
                  <PrimaryButton
                    disabled={!canAddToCart || isAdding || isRemoving}
                    loading={isAdding}
                    onClick={() => {
                      void handleAddToCart(item);
                    }}
                    data-testid="wishlist-add-to-cart-btn"
                  >
                    {item.available ? 'Add to cart' : 'Unavailable'}
                  </PrimaryButton>

                  <SecondaryButton
                    disabled={isRemoving || isAdding}
                    loading={isRemoving}
                    onClick={() => {
                      void handleRemove(item.productId);
                    }}
                    data-testid="wishlist-remove-btn"
                  >
                    Remove
                  </SecondaryButton>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
