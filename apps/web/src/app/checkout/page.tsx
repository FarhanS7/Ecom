// @shopscale/web - Checkout page (T048).
import type { Metadata } from 'next';
import { CheckoutView } from '@/features/checkout';

export const metadata: Metadata = {
  title: 'Checkout | ShopScale',
  description: 'Review your order and complete checkout.',
};

export default function CheckoutPage() {
  return (
    <main className="min-h-screen py-8">
      <CheckoutView />
    </main>
  );
}
