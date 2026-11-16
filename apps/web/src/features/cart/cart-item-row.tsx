'use client';

// @shopscale/web features/cart/cart-item-row - Single cart line item (T043).
// Invariants:
// 1. Live unit price and calculated line total rendered deterministically.
// 2. Accessible controls: descriptive aria-labels for -, +, and delete actions.
// 3. Out-of-stock warning banner rendered when item.available is false.
// 4. Quantity bounds enforced: 1..99. Decrementing at 1 prompts removal.

import type { CartItemDto } from '@shopscale/contracts';
import { formatPrice } from '@/lib/price';

export interface CartItemRowProps {
  item: CartItemDto;
  currency?: string;
  onUpdateQuantity: (variantId: string, quantity: number) => void;
  onRemove: (variantId: string) => void;
}

export function CartItemRow({
  item,
  currency = 'USD',
  onUpdateQuantity,
  onRemove,
}: CartItemRowProps) {
  const unitPrice = parseInt(item.priceCents, 10) || 0;
  const lineTotal = unitPrice * item.qty;

  const handleDecrement = () => {
    if (item.qty > 1) {
      onUpdateQuantity(item.variantId, item.qty - 1);
    } else {
      onRemove(item.variantId);
    }
  };

  const handleIncrement = () => {
    if (item.qty < 99) {
      onUpdateQuantity(item.variantId, item.qty + 1);
    }
  };

  return (
    <li className="ss-cart-item" data-testid={`cart-item-${item.variantId}`}>
      <div className="ss-cart-item__info">
        <h4 className="ss-cart-item__title">{item.title}</h4>
        <p className="ss-cart-item__price">
          {formatPrice(unitPrice, currency)} each
          {item.qty > 1 ? ` · ${formatPrice(lineTotal, currency)} total` : null}
        </p>

        {!item.available && (
          <p
            className="type-caption"
            role="status"
            style={{ color: 'var(--color-danger)', margin: '0 0 var(--space-2) 0' }}
          >
            Item currently out of stock
          </p>
        )}

        <div className="ss-cart-item__actions">
          <div className="ss-cart-qty">
            <button
              type="button"
              className="ss-cart-qty__btn"
              onClick={handleDecrement}
              aria-label={`Decrease quantity for ${item.title}`}
              data-testid="cart-qty-decrease"
            >
              −
            </button>
            <span
              className="ss-cart-qty__val"
              aria-label={`Quantity: ${item.qty}`}
              data-testid="cart-item-qty"
            >
              {item.qty}
            </span>
            <button
              type="button"
              className="ss-cart-qty__btn"
              onClick={handleIncrement}
              disabled={item.qty >= 99}
              aria-label={`Increase quantity for ${item.title}`}
              data-testid="cart-qty-increase"
            >
              +
            </button>
          </div>

          <button
            type="button"
            className="ss-cart-item__remove"
            onClick={() => onRemove(item.variantId)}
            aria-label={`Remove ${item.title} from cart`}
            data-testid="cart-item-remove"
          >
            Remove
          </button>
        </div>
      </div>
    </li>
  );
}
