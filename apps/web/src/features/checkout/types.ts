// @shopscale/web features/checkout/types - Types for checkout flow (T048).

import type { QuoteResponse } from '@shopscale/contracts';

export interface AddressItem {
  id: string;
  fields: {
    name?: string;
    fullName?: string;
    line1: string;
    line2?: string | null;
    city: string;
    region?: string;
    state?: string;
    postalCode: string;
    country: string;
    phone?: string | null;
  };
  createdAt: string;
}

export type CheckoutStep = 'address' | 'review' | 'submitting';

export interface CheckoutFormState {
  step: CheckoutStep;
  selectedAddressId: string | null;
  quote: QuoteResponse | null;
  couponCode: string;
  error: string | null;
  errorCode: string | null;
  isSubmitting: boolean;
}

export interface CheckoutError {
  error: string;
  message: string;
  variantId?: string;
  expectedPriceCents?: number;
  currentPriceCents?: number;
  available?: number;
}
